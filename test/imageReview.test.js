const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const scamImageScan = require('../libs/scamImageScan');
const { buildScamImageEvidenceEmbed } = require('../libs/scamImageScan');
const { processImageReview } = require('../libs/imageReview');

const STAFF_ROLE = 'staff-role';
const MOD_ROLE = 'mod-role';

function fakeRoleCache(roleIds = []) {
  const set = new Set(roleIds);
  return {
    has: (id) => set.has(id),
    some: (fn) => [...set].some((id) => fn({ id })),
  };
}

function fakeMember(roleIds = []) {
  return {
    permissions: { has: () => false },
    roles: { cache: fakeRoleCache(roleIds) },
    joinedAt: new Date(Date.now() - 10 * 86400000),
  };
}

function fakeMessage({ member, attachmentSize, attachmentUrl = 'https://cdn.example/a.png' }) {
  const sent = [];
  const deleted = [];
  const bans = [];
  const reviewChannel = {
    id: 'review-channel',
    name: 'review',
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      return { id: 'queue-message' };
    },
  };
  const guild = {
    id: 'guild-1',
    members: {
      fetch: async () => member,
      ban: async (id, payload) => bans.push({ id, payload }),
    },
    channels: {
      cache: {
        get: (id) => (id === reviewChannel.id ? reviewChannel : null),
      },
      fetch: async (id) => (id === reviewChannel.id ? reviewChannel : null),
    },
  };

  return {
    id: 'message-1',
    guild,
    channelId: 'source-channel',
    channel: { id: 'source-channel', name: 'general' },
    author: {
      id: 'user-1',
      tag: 'User#0001',
      createdAt: new Date(Date.now() - 10 * 86400000),
    },
    content: 'image upload',
    attachments: new Map([
      [
        'att-1',
        {
          url: attachmentUrl,
          size: attachmentSize,
          contentType: 'image/png',
          name: 'a.png',
        },
      ],
    ]),
    delete: async () => deleted.push(true),
    _sent: sent,
    _deleted: deleted,
    _bans: bans,
  };
}

function fakeClient(overrides = {}) {
  const logs = [];
  return {
    config: { roles: { staff: STAFF_ROLE, mod: MOD_ROLE } },
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
    },
    db: {
      hasImageReviewApproval: async () => false,
      getGuildConfigurable: async () => ({
        image_review_channel_id: 'review-channel',
        modLogId: null,
        min_account_age_days: null,
        min_join_age_days: null,
        min_messages_for_image_trust: 1,
      }),
      getGuildUserMessageCount: async () => 0,
      insertPendingImageReview: async () => 42,
      updatePendingImageReviewQueueMessage: async () => {},
      getImageTextBlacklistRows: async () => [],
      getImageHashBlacklistRows: async () => [],
      query: {},
      ...overrides.db,
    },
    _logs: logs,
  };
}

test.afterEach(() => {
  scamImageScan._internal.clearTestState();
});

test('failed/skipped scan queues review for non-staff non-mod users', async () => {
  const client = fakeClient();
  const message = fakeMessage({
    member: fakeMember(),
    attachmentSize: scamImageScan.MAX_IMAGE_BYTES + 1,
  });

  await processImageReview(client, message, STAFF_ROLE, MOD_ROLE);

  assert.equal(message._deleted.length, 1, 'original message should be removed for staff review');
  assert.equal(message._sent.length, 1, 'review queue message should be posted');
  assert.match(message._sent[0].embeds[0].data.title, /skipped/i);
  assert.equal(message._bans.length, 0, 'scan failure must not auto-ban');
});

test('scanner disabled queues review when manual review fallback is enabled', async () => {
  const client = fakeClient({
    db: {
      getScamScanSettings: async () => ({
        ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
        scam_scan_enabled: false,
        scam_scan_manual_review_on_failure: true,
      }),
    },
  });
  const message = fakeMessage({
    member: fakeMember(),
    attachmentSize: 1024,
  });

  await processImageReview(client, message, STAFF_ROLE, MOD_ROLE);

  assert.equal(message._deleted.length, 1);
  assert.equal(message._sent.length, 1);
  assert.match(message._sent[0].embeds[0].data.fields.find((f) => f.name === 'Reason').value, /scanner_disabled/);
});

test('manual review fallback disabled does not queue incomplete scans and logs clearly', async () => {
  const client = fakeClient({
    db: {
      getScamScanSettings: async () => ({
        ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
        scam_scan_enabled: false,
        scam_scan_manual_review_on_failure: false,
      }),
    },
  });
  const message = fakeMessage({
    member: fakeMember(),
    attachmentSize: 1024,
  });

  await processImageReview(client, message, STAFF_ROLE, MOD_ROLE);

  assert.equal(message._deleted.length, 0);
  assert.equal(message._sent.length, 0);
  assert.ok(client._logs.some((entry) => entry.join(' ').includes('manual review fallback disabled')));
});

test('staff timeout logs clearly but does not ban or queue', async () => {
  const originalGet = axios.get;
  try {
    axios.get = () => new Promise(() => {});
    scamImageScan._internal.setTimeoutsForTest({ totalMs: 5, downloadMs: 1000, ocrMs: 1000, phashMs: 1000 });
    const client = fakeClient();
    const message = fakeMessage({
      member: fakeMember([STAFF_ROLE]),
      attachmentSize: 1024,
    });

    await processImageReview(client, message, STAFF_ROLE, MOD_ROLE);

    assert.equal(message._sent.length, 0, 'trusted timeout should not queue under current policy');
    assert.equal(message._deleted.length, 0, 'trusted timeout should not delete message under current policy');
    assert.equal(message._bans.length, 0, 'trusted timeout must not ban');
    assert.ok(
      client._logs.some((entry) => entry.join(' ').includes('trusted uploader') && entry.join(' ').includes('timeout')),
      'trusted timeout should be logged clearly',
    );
  } finally {
    axios.get = originalGet;
  }
});

test('scan evidence embed titles distinguish hit, timeout, failed, and skipped', () => {
  const message = fakeMessage({
    member: fakeMember(),
    attachmentSize: 1024,
  });
  const base = {
    hit: false,
    detail: '',
    reason: null,
    reasonCode: null,
    failureStage: null,
    timings: {},
    image: {},
    ocrConfidence: 0,
    ocrPreview: null,
  };

  const timeout = buildScamImageEvidenceEmbed(message, {
    ...base,
    status: 'timeout',
    reasonCode: 'ocr_timeout',
    failureStage: 'ocr',
  }, 0, 'https://cdn.example/a.png');
  const failed = buildScamImageEvidenceEmbed(message, {
    ...base,
    status: 'failed',
    reasonCode: 'phash_failed',
    failureStage: 'phash',
  }, 0, 'https://cdn.example/a.png');
  const skipped = buildScamImageEvidenceEmbed(message, {
    ...base,
    status: 'skipped',
    reasonCode: 'image_too_large',
    failureStage: 'validation',
  }, 0, 'https://cdn.example/a.png');
  const hit = buildScamImageEvidenceEmbed(message, {
    ...base,
    status: 'hit',
    hit: true,
    reason: 'ocr',
    reasonCode: 'ocr',
    detail: 'text:keyword:porewin',
  }, 0, 'https://cdn.example/a.png');

  assert.match(timeout.data.title, /timed out/i);
  assert.doesNotMatch(timeout.data.title, /scam image auto-enforcement/i);
  assert.match(failed.data.title, /failed/i);
  assert.doesNotMatch(failed.data.title, /scam image auto-enforcement/i);
  assert.match(skipped.data.title, /skipped/i);
  assert.match(hit.data.title, /scam image auto-enforcement/i);
});
