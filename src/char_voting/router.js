const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../../database/db');
const config = require('../../config');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
const IMG_MIN = 900;
const IMG_MAX = 1024;

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Invalid file type. Only PNG, JPG, WEBP, and AVIF are allowed.'));
  },
});

function requireLogin(req, res, next) {
  if (req.session?.loggedin) return next();
  return res.status(401).json({ error: 'Login required' });
}

function isStaff(req) {
  return (req.session?.roles || []).includes(config.roles.staff);
}

function requireStaff(req, res, next) {
  if (!req.session?.loggedin) return res.status(401).json({ error: 'Login required' });
  if (!isStaff(req)) return res.status(403).json({ error: 'Staff only' });
  return next();
}

function requireStaffPage(req, res, next) {
  if (!req.session?.loggedin) return res.redirect('/auth/login');
  if (!isStaff(req)) return res.status(403).send('Staff only');
  return next();
}

function normalizePair(charName, gameName) {
  return {
    charNorm: (charName || '').trim().toLowerCase(),
    gameNorm: (gameName || '').trim().toLowerCase(),
  };
}

async function isBlocklisted(charName, gameName) {
  const { charNorm, gameNorm } = normalizePair(charName, gameName);
  if (!charNorm || !gameNorm) return false;
  const rows = await db.sql(
    'SELECT id FROM char_vote_blocklist WHERE char_name_norm = ? AND game_name_norm = ? LIMIT 1',
    [charNorm, gameNorm],
  );
  return rows.length > 0;
}

async function addToBlocklistFromSubmission(sub) {
  const { charNorm, gameNorm } = normalizePair(sub.char_name, sub.game_name);
  await db.sql(
    `INSERT IGNORE INTO char_vote_blocklist (char_name_norm, game_name_norm, char_name, game_name, source_submission_id)
     VALUES (?, ?, ?, ?, ?)`,
    [charNorm, gameNorm, sub.char_name, sub.game_name, sub.id],
  );
}

async function getActiveSeason() {
  const rows = await db.sql(
    "SELECT * FROM char_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1",
  );
  return rows[0] || null;
}

router.get('/admin/seasons', requireStaffPage, async (req, res) => {
  try {
    const seasons = await db.sql(`
      SELECT s.id, s.name, s.status, s.closed_at, s.created_at,
        (SELECT COUNT(*) FROM char_submissions c WHERE c.season_id = s.id) AS submission_count
      FROM char_seasons s
      ORDER BY s.id DESC
    `);
    res.render('char_voting_seasons_admin', {
      user: req.session?.user || null,
      csrfToken: req.session?.csrf || '',
      seasons,
    });
  } catch (err) {
    console.error('char_voting admin/seasons error', err);
    res.status(500).send('Server error');
  }
});

router.get('/', async (req, res) => {
  try {
    const activeSeason = await getActiveSeason();
    let viewingPastSeason = false;
    let displaySeason = activeSeason;

    const seasonIdParam = req.query.season ? parseInt(req.query.season, 10) : NaN;
    if (Number.isFinite(seasonIdParam) && isStaff(req)) {
      const rows = await db.sql('SELECT * FROM char_seasons WHERE id = ?', [seasonIdParam]);
      if (!rows.length) return res.status(404).send('Season not found');
      displaySeason = rows[0];
      viewingPastSeason = !activeSeason || displaySeason.id !== activeSeason.id;
    } else if (!displaySeason) {
      const rows = await db.sql(
        "SELECT * FROM char_seasons WHERE status IN ('closed', 'complete') ORDER BY id DESC LIMIT 1",
      );
      displaySeason = rows[0] || null;
    }

    const seasonActive = !!(displaySeason && displaySeason.status === 'active');

    let cards = [];
    let userSubmitted = false;
    let userVotes = {};
    const userId = req.session?.user?.id || null;

    if (displaySeason) {
      const submissions = await db.sql(
        `SELECT s.*,
          COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE 0 END), 0) AS up_votes,
          COALESCE(SUM(CASE WHEN v.vote_type = 'down' THEN 1 ELSE 0 END), 0) AS down_votes
         FROM char_submissions s
         LEFT JOIN char_votes v ON v.submission_id = s.id
         WHERE s.season_id = ?
         GROUP BY s.id
         ORDER BY (COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN v.vote_type = 'down' THEN 1 ELSE 0 END), 0)) DESC, s.created_at DESC`,
        [displaySeason.id],
      );

      if (userId) {
        const votes = await db.sql(
          'SELECT submission_id, vote_type FROM char_votes WHERE discord_user_id = ?',
          [userId],
        );
        votes.forEach((v) => { userVotes[v.submission_id] = v.vote_type; });

        const already = await db.sql(
          'SELECT id FROM char_submissions WHERE season_id = ? AND discord_user_id = ? LIMIT 1',
          [displaySeason.id, userId],
        );
        userSubmitted = already.length > 0;
      }

      cards = submissions.map((s) => ({
        ...s,
        up_votes: Number(s.up_votes) || 0,
        down_votes: Number(s.down_votes) || 0,
        user_vote: userVotes[s.id] || null,
      }));
    }

    res.render('char_voting', {
      user: req.session?.user || null,
      csrfToken: req.session?.csrf || '',
      isAdmin: isStaff(req),
      season: displaySeason,
      seasonActive,
      viewingPastSeason,
      cards,
      userSubmitted,
    });
  } catch (err) {
    console.error('char_voting GET error', err);
    res.status(500).send('Server error');
  }
});

router.post('/submit', requireLogin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const filePath = req.file ? path.join(UPLOADS_DIR, req.file.filename) : null;

  try {
    const season = await getActiveSeason();
    if (!season) {
      if (filePath) fs.unlink(filePath, () => {});
      return res.status(400).json({ error: 'No active season. Submissions are currently closed.' });
    }

    const { char_name, game_name } = req.body;
    if (!char_name || !game_name || !req.file) {
      return res.status(400).json({ error: 'All fields and an image are required.' });
    }

    const cn = char_name.trim();
    const gn = game_name.trim();
    if (await isBlocklisted(cn, gn)) {
      if (filePath) fs.unlink(filePath, () => {});
      return res.status(400).json({
        error: 'This character is already on the approved list and cannot be nominated again.',
      });
    }

    const userId = req.session.user.id;
    const already = await db.sql(
      'SELECT id FROM char_submissions WHERE season_id = ? AND discord_user_id = ? LIMIT 1',
      [season.id, userId],
    );
    if (already.length > 0) {
      if (filePath) fs.unlink(filePath, () => {});
      return res.status(400).json({ error: 'You have already submitted a character this season.' });
    }

    const meta = await sharp(filePath).metadata();
    const { width, height } = meta;

    if (width < IMG_MIN || height < IMG_MIN) {
      fs.unlink(filePath, () => {});
      return res.status(400).json({
        error: `Image too small. Minimum size is ${IMG_MIN}×${IMG_MIN}px (uploaded: ${width}×${height}px).`,
      });
    }
    if (width > IMG_MAX || height > IMG_MAX) {
      fs.unlink(filePath, () => {});
      return res.status(400).json({
        error: `Image too large. Maximum size is ${IMG_MAX}×${IMG_MAX}px (uploaded: ${width}×${height}px).`,
      });
    }

    const user = req.session.user;
    await db.sql(
      'INSERT INTO char_submissions (season_id, discord_user_id, username, avatar, char_name, game_name, image_filename) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [season.id, user.id, user.username, user.avatar || null, cn, gn, req.file.filename],
    );

    res.json({ success: true });
  } catch (err) {
    if (filePath) fs.unlink(filePath, () => {});
    console.error('char_voting submit error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/vote/:id', requireLogin, async (req, res) => {
  try {
    const season = await getActiveSeason();
    if (!season) {
      return res.status(400).json({ error: 'Season is closed. Voting is not allowed.' });
    }

    const submissionId = parseInt(req.params.id, 10);
    const { vote_type } = req.body;
    const userId = req.session.user.id;

    if (!['up', 'down'].includes(vote_type)) {
      return res.status(400).json({ error: 'Invalid vote type' });
    }

    const sub = await db.sql(
      'SELECT id, char_name, game_name FROM char_submissions WHERE id = ? AND season_id = ?',
      [submissionId, season.id],
    );
    if (!sub.length) return res.status(400).json({ error: 'Submission not in active season' });

    if (await isBlocklisted(sub[0].char_name, sub[0].game_name)) {
      return res.status(400).json({ error: 'This nomination cannot be voted on.' });
    }

    const existing = await db.sql(
      'SELECT vote_type FROM char_votes WHERE submission_id = ? AND discord_user_id = ?',
      [submissionId, userId],
    );

    if (existing.length > 0) {
      if (existing[0].vote_type === vote_type) {
        await db.sql(
          'DELETE FROM char_votes WHERE submission_id = ? AND discord_user_id = ?',
          [submissionId, userId],
        );
      } else {
        await db.sql(
          'UPDATE char_votes SET vote_type = ? WHERE submission_id = ? AND discord_user_id = ?',
          [vote_type, submissionId, userId],
        );
      }
    } else {
      await db.sql(
        'INSERT INTO char_votes (submission_id, discord_user_id, vote_type) VALUES (?, ?, ?)',
        [submissionId, userId, vote_type],
      );
    }

    const counts = await db.sql(
      `SELECT
        COALESCE(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END), 0) AS up_votes,
        COALESCE(SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END), 0) AS down_votes
       FROM char_votes WHERE submission_id = ?`,
      [submissionId],
    );

    const userVoteRow = await db.sql(
      'SELECT vote_type FROM char_votes WHERE submission_id = ? AND discord_user_id = ?',
      [submissionId, userId],
    );

    res.json({
      up_votes: Number(counts[0].up_votes) || 0,
      down_votes: Number(counts[0].down_votes) || 0,
      user_vote: userVoteRow[0]?.vote_type || null,
    });
  } catch (err) {
    console.error('char_voting vote error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/delete/:id', requireStaff, async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    const rows = await db.sql(
      'SELECT image_filename FROM char_submissions WHERE id = ?',
      [submissionId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });

    await db.sql('DELETE FROM char_submissions WHERE id = ?', [submissionId]);
    fs.unlink(path.join(UPLOADS_DIR, rows[0].image_filename), () => {});

    res.json({ success: true });
  } catch (err) {
    console.error('char_voting delete error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/approve/:id', requireStaff, async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    const seasonIdBody = req.body.season_id != null ? parseInt(req.body.season_id, 10) : null;

    const subs = await db.sql(
      `SELECT s.*, se.status AS season_status
       FROM char_submissions s
       INNER JOIN char_seasons se ON se.id = s.season_id
       WHERE s.id = ?`,
      [submissionId],
    );
    if (!subs.length) return res.status(404).json({ error: 'Submission not found' });

    const sub = subs[0];
    if (Number.isFinite(seasonIdBody) && sub.season_id !== seasonIdBody) {
      return res.status(400).json({ error: 'Submission does not belong to this season.' });
    }
    if (sub.season_status !== 'complete') {
      return res.status(400).json({ error: 'Season must be marked complete before approving nominations.' });
    }
    if (sub.status === 'approved') {
      return res.json({ success: true, already: true });
    }

    await db.sql("UPDATE char_submissions SET status = 'approved' WHERE id = ?", [submissionId]);
    await addToBlocklistFromSubmission(sub);

    res.json({ success: true });
  } catch (err) {
    console.error('char_voting approve error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Season management (staff only) ─────────────────────────

router.post('/season/start', requireStaff, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Season name is required.' });

    const finished = await db.sql(
      "SELECT status FROM char_seasons WHERE status IN ('closed', 'complete') ORDER BY id DESC LIMIT 1",
    );
    if (finished[0]?.status === 'closed') {
      return res.status(400).json({
        error: 'Mark the most recent closed season complete before starting a new one.',
      });
    }

    await db.sql(
      "UPDATE char_seasons SET status = 'closed', closed_at = NOW() WHERE status = 'active'",
    );

    await db.sql(
      "INSERT INTO char_seasons (name, status) VALUES (?, 'active')",
      [name],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('char_voting season/start error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/season/close', requireStaff, async (req, res) => {
  try {
    const season = await getActiveSeason();
    if (!season) return res.status(400).json({ error: 'No active season to close.' });

    await db.sql(
      "UPDATE char_seasons SET status = 'closed', closed_at = NOW() WHERE id = ?",
      [season.id],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('char_voting season/close error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/season/complete', requireStaff, async (req, res) => {
  try {
    const seasonId = parseInt(req.body.season_id, 10);
    if (!Number.isFinite(seasonId)) {
      return res.status(400).json({ error: 'season_id is required.' });
    }

    const rows = await db.sql('SELECT id, status FROM char_seasons WHERE id = ?', [seasonId]);
    if (!rows.length) return res.status(404).json({ error: 'Season not found' });
    if (rows[0].status !== 'closed') {
      return res.status(400).json({ error: 'Only a closed season can be marked complete.' });
    }

    await db.sql("UPDATE char_seasons SET status = 'complete' WHERE id = ?", [seasonId]);

    res.json({ success: true });
  } catch (err) {
    console.error('char_voting season/complete error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.requiredRoles = [];
