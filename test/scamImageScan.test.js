const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const axios = require('axios');
const imghash = require('imghash');

const scamImageScan = require('../libs/scamImageScan');

async function makePng(width = 120, height = 80) {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toBuffer();
}

function fakeClient(overrides = {}) {
  const logs = [];
  return {
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
    },
    db: {
      getImageTextBlacklistRows: async () => [],
      getImageHashBlacklistRows: async () => [],
      query: {},
      ...overrides.db,
    },
    _logs: logs,
  };
}

function setFakeOcr({ text = '', confidence = 90, neverResolve = false } = {}) {
  let terminated = false;
  const worker = {
    recognize: () => {
      if (neverResolve) return new Promise(() => {});
      return Promise.resolve({ data: { text, confidence } });
    },
    terminate: async () => {
      terminated = true;
    },
  };
  scamImageScan._internal.setOcrWorkerForTest(worker);
  return { wasTerminated: () => terminated };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test.afterEach(() => {
  scamImageScan._internal.clearTestState();
});

test('scanImageAttachment returns clean structured result with stage timings', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });
    const result = await scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/a.png', size: png.length }, {
      attachmentIndex: 0,
      messageId: 'm1',
    });

    assert.equal(result.status, 'clean');
    assert.equal(result.hit, false);
    assert.equal(result.reasonCode, 'none');
    assert.equal(typeof result.timings.downloadMs, 'number');
    assert.equal(typeof result.timings.preprocessMs, 'number');
    assert.equal(typeof result.timings.ocrMs, 'number');
    assert.equal(typeof result.timings.rulesMs, 'number');
    assert.equal(typeof result.timings.phashMs, 'number');
    assert.equal(typeof result.timings.totalMs, 'number');
    assert.equal(result.image.width, 120);
    assert.equal(result.image.height, 80);
    assert.equal(result.image.bytes, png.length);
  } finally {
    axios.get = originalGet;
  }
});

test('OCR timeout returns timeout result and never becomes clean', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    const worker = setFakeOcr({ neverResolve: true });
    scamImageScan._internal.setTimeoutsForTest({ totalMs: 100, downloadMs: 50, ocrMs: 5, phashMs: 50 });

    const result = await scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'timeout');
    assert.equal(result.hit, false);
    assert.equal(result.failureStage, 'ocr');
    assert.equal(result.reasonCode, 'ocr_timeout');
    assert.equal(worker.wasTerminated(), true);
  } finally {
    axios.get = originalGet;
  }
});

test('oversize attachment returns skipped image_too_large result', async () => {
  const result = await scamImageScan.scanImageAttachment(fakeClient(), {
    url: 'https://cdn.example/too-large.png',
    size: scamImageScan.MAX_IMAGE_BYTES + 1,
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.hit, false);
  assert.equal(result.failureStage, 'validation');
  assert.equal(result.reasonCode, 'image_too_large');
  assert.equal(result.image.bytes, scamImageScan.MAX_IMAGE_BYTES + 1);
});

test('pixel guard rejects images above MAX_IMAGE_PIXELS', () => {
  assert.throws(
    () => scamImageScan._internal.validateImageMetadata({ width: 5001, height: 5000, format: 'png' }),
    /pixel cap/,
  );
});

test('text rule hit short-circuits before pHash', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  let phashCalls = 0;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async () => {
      phashCalls += 1;
      return 'a'.repeat(64);
    };
    setFakeOcr({ text: 'visit porewin casino now', confidence: 90 });
    const client = fakeClient({
      db: {
        getEnabledScamScanRules: async () => [{
          id: 7,
          type: 'keyword',
          pattern: 'porewin',
          normalized_pattern: 'porewin',
          severity: 'auto',
          enabled: true,
        }],
        getImageHashBlacklistRows: async () => [{ id: 1, phash: 'a'.repeat(64), description: 'known' }],
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'hit');
    assert.equal(result.reasonCode, 'ocr');
    assert.equal(result.severity, 'auto');
    assert.equal(result.matchedRules[0].id, 7);
    assert.equal(phashCalls, 0);
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('scanner uses enabled scam scan keyword rules', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    setFakeOcr({ text: 'withdrawal success confirmed', confidence: 90 });
    const client = fakeClient({
      db: {
        getEnabledScamScanRules: async () => [{
          id: 11,
          type: 'keyword',
          pattern: 'withdrawal success',
          normalized_pattern: 'withdrawal success',
          severity: 'review',
          enabled: true,
        }],
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'hit');
    assert.equal(result.reasonCode, 'ocr');
    assert.equal(result.severity, 'review');
    assert.equal(result.matchedRules[0].id, 11);
  } finally {
    axios.get = originalGet;
  }
});

test('scanner fails closed when rule loading fails', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    setFakeOcr({ text: 'withdrawal success confirmed', confidence: 90 });
    const client = fakeClient({
      db: {
        getEnabledScamScanRules: async () => {
          throw new Error('db unavailable');
        },
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'failed');
    assert.equal(result.hit, false);
    assert.equal(result.failureStage, 'rules');
    assert.equal(result.reasonCode, 'rule_loading_failed');
  } finally {
    axios.get = originalGet;
  }
});

test('pHash path still returns review hit', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  try {
    const png = await makePng();
    const phash = 'a'.repeat(64);
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async () => phash;
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });
    const client = fakeClient({
      db: {
        getImageTextBlacklistRows: async () => [],
        getImageHashBlacklistRows: async () => [{ id: 3, phash, description: 'known scam' }],
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'hit');
    assert.equal(result.reasonCode, 'phash');
    assert.equal(result.severity, 'review');
    assert.equal(result.matchedHashes[0].id, 3);
    assert.equal(typeof result.timings.phashMs, 'number');
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('pHash generation failure with hash rows returns failed, not clean', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async () => {
      throw new Error('hash exploded');
    };
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });
    const client = fakeClient({
      db: {
        getImageTextBlacklistRows: async () => [],
        getImageHashBlacklistRows: async () => [{ id: 3, phash: 'a'.repeat(64), description: 'known scam' }],
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'failed');
    assert.equal(result.hit, false);
    assert.equal(result.failureStage, 'phash');
    assert.equal(result.reasonCode, 'phash_failed');
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('no pHash rows skips pHash and can return clean', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  let phashCalls = 0;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async () => {
      phashCalls += 1;
      return 'a'.repeat(64);
    };
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });

    const result = await scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'clean');
    assert.equal(phashCalls, 0);
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('computeScamImagePhash uses the same prepared buffer as runtime pHash', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  const buffers = [];
  try {
    const png = await makePng(300, 220);
    const phash = 'b'.repeat(64);
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async (buffer) => {
      buffers.push(Buffer.from(buffer));
      return phash;
    };
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });
    await scamImageScan.computeScamImagePhash(png);
    const client = fakeClient({
      db: {
        getImageTextBlacklistRows: async () => [],
        getImageHashBlacklistRows: async () => [{ id: 3, phash, description: 'known scam' }],
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'hit');
    assert.equal(buffers.length, 2);
    assert.equal(Buffer.compare(buffers[0], buffers[1]), 0);
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('queued scan does not time out before it starts', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    let calls = 0;
    axios.get = async () => {
      calls += 1;
      if (calls <= 2) return new Promise(() => {});
      return { data: png, headers: { 'content-length': String(png.length) } };
    };
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });
    scamImageScan._internal.setTimeoutsForTest({ totalMs: 10, downloadMs: 1000, ocrMs: 50, phashMs: 50 });

    const p1 = scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/1.png', size: png.length });
    const p2 = scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/2.png', size: png.length });
    const p3 = scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/3.png', size: png.length });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assert.equal(r1.status, 'timeout');
    assert.equal(r2.status, 'timeout');
    assert.equal(r3.status, 'clean');
    assert.equal(calls, 3);
  } finally {
    axios.get = originalGet;
  }
});

test('OCR timeout reset lets a queued OCR scan succeed with a fresh worker', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    let workerCreates = 0;
    let markFirstRecognizeStarted;
    const firstRecognizeStarted = new Promise((resolve) => {
      markFirstRecognizeStarted = resolve;
    });
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    scamImageScan._internal.setTimeoutsForTest({ totalMs: 200, downloadMs: 50, ocrMs: 5, phashMs: 50 });
    scamImageScan._internal.setOcrWorkerFactoryForTest(() => {
      workerCreates += 1;
      if (workerCreates === 1) {
        return Promise.resolve({
          recognize: () => {
            markFirstRecognizeStarted();
            return new Promise(() => {});
          },
          terminate: async () => delay(10),
        });
      }
      return Promise.resolve({
        recognize: async () => ({ data: { text: 'ordinary screenshot', confidence: 90 } }),
        terminate: async () => {},
      });
    });

    const p1 = scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/1.png', size: png.length });
    await firstRecognizeStarted;
    const p2 = scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/2.png', size: png.length });
    const [r1, r2] = await Promise.all([p1, p2]);

    assert.equal(r1.status, 'timeout');
    assert.equal(r1.failureStage, 'ocr');
    assert.equal(r2.status, 'clean');
    assert.equal(workerCreates, 2);
  } finally {
    axios.get = originalGet;
  }
});

test('download timeout aborts the axios request signal', async () => {
  const originalGet = axios.get;
  let aborted = false;
  try {
    axios.get = async (_url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        aborted = opts.signal.aborted;
        const err = new Error('canceled');
        err.name = 'CanceledError';
        err.code = 'ERR_CANCELED';
        reject(err);
      });
    });
    scamImageScan._internal.setTimeoutsForTest({ totalMs: 100, downloadMs: 5, ocrMs: 50, phashMs: 50 });

    const result = await scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/a.png', size: 1024 });

    assert.equal(result.status, 'timeout');
    assert.equal(result.failureStage, 'download');
    assert.equal(result.reasonCode, 'download_timeout');
    assert.equal(aborted, true);
  } finally {
    axios.get = originalGet;
  }
});

test('invalid image metadata returns structured preprocess failure', async () => {
  const originalGet = axios.get;
  try {
    const bad = Buffer.from('not an image');
    axios.get = async () => ({ data: bad, headers: { 'content-length': String(bad.length) } });

    const result = await scamImageScan.scanImageAttachment(fakeClient(), { url: 'https://cdn.example/a.png', size: bad.length });

    assert.equal(result.status, 'failed');
    assert.equal(result.hit, false);
    assert.equal(result.failureStage, 'preprocess');
    assert.equal(result.reasonCode, 'image_decode_failed');
  } finally {
    axios.get = originalGet;
  }
});

test('scanner disabled returns structured skipped result', async () => {
  const result = await scamImageScan.scanImageAttachment(fakeClient({
    db: {
      getScamScanSettings: async () => ({
        ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
        scam_scan_enabled: false,
      }),
    },
  }), { url: 'https://cdn.example/a.png', size: 1024 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reasonCode, 'scanner_disabled');
  assert.equal(result.failureStage, 'settings');
});

test('OCR disabled skips text matching but still allows pHash', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  let ocrCalls = 0;
  try {
    const png = await makePng();
    const phash = 'b'.repeat(64);
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async () => phash;
    scamImageScan._internal.setOcrWorkerForTest({
      recognize: async () => {
        ocrCalls += 1;
        return { data: { text: 'porewin', confidence: 90 } };
      },
      terminate: async () => {},
    });
    const result = await scamImageScan.scanImageAttachment(fakeClient({
      db: {
        getScamScanSettings: async () => ({
          ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
          scam_scan_ocr_enabled: false,
        }),
        getEnabledScamScanRules: async () => [{ id: 1, type: 'keyword', pattern: 'porewin', normalized_pattern: 'porewin', severity: 'auto' }],
        getImageHashBlacklistRows: async () => [{ id: 2, phash, description: 'known' }],
      },
    }), { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'hit');
    assert.equal(result.reasonCode, 'phash');
    assert.equal(ocrCalls, 0);
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('pHash disabled skips hash matching but text rules still run', async () => {
  const originalGet = axios.get;
  const originalHash = imghash.hash;
  let phashCalls = 0;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    imghash.hash = async () => {
      phashCalls += 1;
      return 'c'.repeat(64);
    };
    setFakeOcr({ text: 'ordinary screenshot', confidence: 90 });
    const result = await scamImageScan.scanImageAttachment(fakeClient({
      db: {
        getScamScanSettings: async () => ({
          ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
          scam_scan_phash_enabled: false,
        }),
        getImageHashBlacklistRows: async () => [{ id: 3, phash: 'c'.repeat(64), description: 'known' }],
      },
    }), { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'clean');
    assert.equal(phashCalls, 0);
  } finally {
    axios.get = originalGet;
    imghash.hash = originalHash;
  }
});

test('OCR and pHash disabled returns skipped scanner_checks_disabled', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    const result = await scamImageScan.scanImageAttachment(fakeClient({
      db: {
        getScamScanSettings: async () => ({
          ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
          scam_scan_ocr_enabled: false,
          scam_scan_phash_enabled: false,
        }),
      },
    }), { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reasonCode, 'scanner_checks_disabled');
  } finally {
    axios.get = originalGet;
  }
});

test('configured max bytes and max pixels are respected', async () => {
  const sizeResult = await scamImageScan.scanImageAttachment(fakeClient({
    db: {
      getScamScanSettings: async () => ({
        ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
        scam_scan_max_image_bytes: 1048576,
      }),
    },
  }), { url: 'https://cdn.example/a.png', size: 1048577 });

  assert.equal(sizeResult.status, 'skipped');
  assert.equal(sizeResult.reasonCode, 'image_too_large');

  assert.throws(
    () => scamImageScan._internal.validateImageMetadata(
      { width: 2000, height: 2000, format: 'png' },
      { ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS, scam_scan_max_image_pixels: 1000000 },
    ),
    /pixel cap/,
  );
});

test('configured OCR max edge is applied during preprocessing', async () => {
  const png = await makePng(1200, 600);
  const prepared = await scamImageScan._internal.preprocessForScan(png, {
    ...scamImageScan.DEFAULT_SCAM_SCAN_SETTINGS,
    scam_scan_ocr_max_edge: 800,
  });
  const meta = await sharp(prepared.buffer).metadata();

  assert.equal(meta.width, 800);
  assert.equal(meta.height, 400);
});

test('settings load failure uses safe defaults and does not become clean on rule load failure', async () => {
  const originalGet = axios.get;
  try {
    const png = await makePng();
    axios.get = async () => ({ data: png, headers: { 'content-length': String(png.length) } });
    setFakeOcr({ text: 'withdrawal success confirmed', confidence: 90 });
    const client = fakeClient({
      db: {
        getScamScanSettings: async () => {
          throw new Error('settings db unavailable');
        },
        getEnabledScamScanRules: async () => {
          throw new Error('rules db unavailable');
        },
      },
    });

    const result = await scamImageScan.scanImageAttachment(client, { url: 'https://cdn.example/a.png', size: png.length });

    assert.equal(result.status, 'failed');
    assert.equal(result.reasonCode, 'rule_loading_failed');
    assert.ok(client._logs.some((entry) => entry.join(' ').includes('settings load failed')));
  } finally {
    axios.get = originalGet;
  }
});

test('increasing scan concurrency allows additional queued work to progress', async () => {
  const limit = scamImageScan._internal.createLimiter(1);
  const first = deferred();
  const started = [];

  const p1 = limit(async () => {
    started.push('first');
    await first.promise;
    return 'first';
  });
  const p2 = limit(async () => {
    started.push('second');
    return 'second';
  });

  await delay(0);
  assert.deepEqual(started, ['first']);
  limit.setMaxConcurrency(2);
  await delay(0);
  assert.deepEqual(started, ['first', 'second']);
  first.resolve();
  assert.deepEqual(await Promise.all([p1, p2]), ['first', 'second']);
});

test('reducing scan concurrency while work is active does not deadlock', async () => {
  const limit = scamImageScan._internal.createLimiter(2);
  const first = deferred();
  const second = deferred();
  const started = [];

  const p1 = limit(async () => {
    started.push('first');
    await first.promise;
    return 'first';
  });
  const p2 = limit(async () => {
    started.push('second');
    await second.promise;
    return 'second';
  });
  const p3 = limit(async () => {
    started.push('third');
    return 'third';
  });

  await delay(0);
  assert.deepEqual(started, ['first', 'second']);
  limit.setMaxConcurrency(1);
  first.resolve();
  await delay(0);
  assert.deepEqual(started, ['first', 'second']);
  second.resolve();
  assert.deepEqual(await Promise.all([p1, p2, p3]), ['first', 'second', 'third']);
  assert.deepEqual(started, ['first', 'second', 'third']);
});

test('increasing OCR concurrency allows additional queued OCR work to progress', async () => {
  const limit = scamImageScan._internal.createLimiter(1);
  const first = deferred();
  const started = [];

  const p1 = limit(async () => {
    started.push('ocr-first');
    await first.promise;
    return 'ocr-first';
  });
  const p2 = limit(async () => {
    started.push('ocr-second');
    return 'ocr-second';
  });

  await delay(0);
  assert.deepEqual(started, ['ocr-first']);
  limit.setMaxConcurrency(2);
  await delay(0);
  assert.deepEqual(started, ['ocr-first', 'ocr-second']);
  first.resolve();
  assert.deepEqual(await Promise.all([p1, p2]), ['ocr-first', 'ocr-second']);
});

test('reducing OCR concurrency while work is active does not deadlock', async () => {
  const limit = scamImageScan._internal.createLimiter(2);
  const first = deferred();
  const second = deferred();
  const started = [];

  const p1 = limit(async () => {
    started.push('ocr-first');
    await first.promise;
    return 'ocr-first';
  });
  const p2 = limit(async () => {
    started.push('ocr-second');
    await second.promise;
    return 'ocr-second';
  });
  const p3 = limit(async () => {
    started.push('ocr-third');
    return 'ocr-third';
  });

  await delay(0);
  limit.setMaxConcurrency(1);
  first.resolve();
  await delay(0);
  assert.deepEqual(started, ['ocr-first', 'ocr-second']);
  second.resolve();
  assert.deepEqual(await Promise.all([p1, p2, p3]), ['ocr-first', 'ocr-second', 'ocr-third']);
});

test('limiter slots are released after success, rejection, and thrown exceptions', async () => {
  const limit = scamImageScan._internal.createLimiter(1);
  const started = [];
  const results = [];

  const tasks = [
    limit(async () => {
      started.push('success');
      return 'success';
    }).then((v) => results.push(v)),
    limit(async () => {
      started.push('reject');
      throw new Error('timeout-like rejection');
    }).catch((e) => results.push(e.message)),
    limit(() => {
      started.push('throw');
      throw new Error('sync throw');
    }).catch((e) => results.push(e.message)),
    limit(async () => {
      started.push('after');
      return 'after';
    }).then((v) => results.push(v)),
  ];

  await Promise.all(tasks);

  assert.deepEqual(started, ['success', 'reject', 'throw', 'after']);
  assert.deepEqual(results, ['success', 'timeout-like rejection', 'sync throw', 'after']);
});
