const express = require("express");
require("dotenv").config({path: '../.env'});
const router = express.Router();
const { timestamp, getDiscordAvatarUrl, generateUniqueId} = require("../libs/utils");
const db = require("../libs/database/db");
const crypto = require('crypto');

router.get("/", (req, res) => {
	res.render('warnings', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});

router.get("/list", (req, res) => {
	db.query(`SELECT * FROM warnings`, (err, results, fields) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ message: 'Internal server error' });
		}
		const formattedResults = results.map(command => ({
			...command,
			created_at: new Date(command.created_at * 1000).toLocaleString(),
			updated_at: new Date(command.updated_at * 1000).toLocaleString(),
		}));

		res.json({ warnings: formattedResults });
	});
});

router.post("/add", (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}
	
	
		const { warn_user_id, warn_user, warn_reason } = req.body;
		if (!reason ) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		let data = [];
		data.push(generateUniqueId());  // warn_id
		data.push(warn_user_id);        // warn_user_id (make sure it's defined)
		data.push(warn_user);           // warn_user (make sure it's defined)
		data.push(req.session.user.id); // warn_by_id
		data.push(req.session.user.username); // warn_by_user
		data.push(warn_reason);         // warn_reason (make sure it's defined)
		data.push(timestamp());         // created_at
		data.push(timestamp());         // updated_at

		db.query('INSERT INTO warnings (warn_id, warn_user_id, warn_user, warn_by_id, warn_by_user, warn_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', data, (err, results, fields) => {
			if (err) {
				console.error(err);
				return res.status(500).json({ message: 'Internal server error' });
			}
			res.status(201).json({ message: 'Warning created' });
		});
	});

router.post("/edit/:id", (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}
	const { reason } = req.body;
	if (!reason) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	db.query('UPDATE warnings SET warn_reason = ?, updated_at = ? WHERE warn_id = ?', [reason, timestamp(), req.params.id], (err, results, fields) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ message: 'Internal server error' });
		}
		res.status(200).json({ message: 'Warning updated' });
	});
});

router.post("/delete/:id", (req, res) => {
    if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
        return res.status(403).json({ message: 'Invalid CSRF token' });
    }

    // const {warn_id} = req.body;

    db.query("DELETE FROM warnings WHERE warn_id = ?", [req.params.id], (err, results, fields) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        res.status(200).json({ message: 'Warning deleted' });
    });
});


module.exports = router;