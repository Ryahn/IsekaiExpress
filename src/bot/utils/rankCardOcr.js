const axios = require('axios');
const dns = require('node:dns');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_SHARP_FORMATS = new Set(['jpeg', 'png', 'webp']);

function isPrivateIpv4(address) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeIpv6(address) {
  return address.toLowerCase().replace(/^\[|\]$/g, '');
}

function isPrivateIpv6(address) {
  const normalized = normalizeIpv6(address);
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
}

function isBlockedAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }
  return true;
}

function validateResolvedAddress(address) {
  if (isBlockedAddress(address)) {
    throw new Error('Image URL resolves to a private or reserved network address.');
  }
}

function validateRankImageUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Image URL must be a valid HTTP(S) URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Image URL must use HTTP or HTTPS.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Image URL cannot target localhost.');
  }

  if (net.isIP(hostname)) {
    validateResolvedAddress(hostname);
  }

  return parsed.toString();
}

function createValidatedLookup() {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error);
        return;
      }

      try {
        for (const resolved of addresses) {
          validateResolvedAddress(resolved.address);
        }
      } catch (validationError) {
        callback(validationError);
        return;
      }

      const first = addresses[0];
      callback(null, first.address, first.family);
    });
  };
}

const httpAgent = new http.Agent({ lookup: createValidatedLookup() });
const httpsAgent = new https.Agent({ lookup: createValidatedLookup() });

function validateContentType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(normalized)) {
    throw new Error('Image URL must return a JPEG, PNG, or WebP image.');
  }
}

function createByteLimitStream(maxBytes) {
  let totalBytes = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        callback(new Error('Image is too large. Maximum size is 5 MB.'));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function downloadImage(url, outputPath) {
  const response = await axios.get(validateRankImageUrl(url), {
    responseType: 'stream',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxRedirects: 0,
    httpAgent,
    httpsAgent,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  validateContentType(response.headers['content-type']);

  const contentLength = Number(response.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Maximum size is 5 MB.');
  }

  await pipeline(
    response.data,
    createByteLimitStream(MAX_IMAGE_BYTES),
    fs.createWriteStream(outputPath),
  );
}

function formatXPStringToNumber(xpString) {
  let number = parseFloat(xpString);
  if (xpString.toLowerCase().includes('k')) {
    number *= 1000;
  }
  return number;
}

function cleanText(text) {
  return text.replace(/[^\w\s]/gi, '').trim();
}

async function extractRankFromImageUrl(imageUrl) {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'f95bot-rank-'));
  const imagePath = path.join(tempDir, 'level-card');
  const croppedImagePath = path.join(tempDir, 'cropped-level-card.png');

  try {
    await downloadImage(imageUrl, imagePath);

    const metadata = await sharp(imagePath).metadata();
    if (!metadata.format || !ALLOWED_SHARP_FORMATS.has(metadata.format)) {
      throw new Error('Downloaded file is not a supported image.');
    }

    await sharp(imagePath)
      .extract({ left: 296, top: 63, width: 440, height: 126 })
      .toFile(croppedImagePath);

    const xpText = await Tesseract.recognize(imagePath, 'eng', {
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    }).then(({ data: { text } }) => text);

    const xpMatch = xpText.match(/\d+\.?\d*k/i);
    const xpValue = xpMatch ? formatXPStringToNumber(xpMatch[0]) : null;

    const usernameText = await Tesseract.recognize(croppedImagePath, 'eng')
      .then(({ data: { text } }) => text);
    const lines = usernameText.split('\n').map((line) => cleanText(line)).filter(Boolean);

    return {
      xpValue,
      usernameValue: lines.length > 0 ? lines[0] : 'Username not found',
    };
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  extractRankFromImageUrl,
};
