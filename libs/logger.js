/**
 * silly-logger only accepts a single string for .error() — the second argument is ignored.
 * This wrapper forwards one-arg calls unchanged; for (msg, err) it appends message and errno code.
 *
 * Also fans out warn/error/crash to a Discord webhook (if LOG_WEBHOOK_URL is set)
 * so the bot owner can monitor errors from a separate admin server.
 */
const silly = require('silly-logger');
const webhook = require('./loggerWebhook');

webhook.init();

function errorMessage(err) {
  if (err == null) return '';
  if (err instanceof Error) {
    return err.message + (err.code ? ` [${err.code}]` : '');
  }
  return String(err);
}

function combineMessage(msg, err) {
  if (arguments.length === 1) {
    if (msg instanceof Error) return errorMessage(msg);
    return msg == null ? '' : String(msg);
  }
  return String(msg) + (err != null ? ` ${errorMessage(err)}` : '');
}

function fanOut(level, msg, err) {
  try {
    const combined = arguments.length <= 2 ? combineMessage(msg) : combineMessage(msg, err);
    webhook.enqueue(level, combined);
  } catch (_) {
    /* never throw from logger */
  }
}

const origError = silly.error.bind(silly);
silly.error = function errorWrapped(msg, err) {
  if (arguments.length === 1) {
    if (msg instanceof Error) {
      const text = errorMessage(msg);
      origError(text);
      fanOut('error', text);
      return;
    }
    origError(msg);
    fanOut('error', msg);
    return;
  }
  const combined = String(msg) + (err != null ? ` ${errorMessage(err)}` : '');
  origError(combined);
  fanOut('error', combined);
};

const origWarn = silly.warn.bind(silly);
silly.warn = function warnWrapped(msg, err) {
  if (arguments.length <= 1) {
    origWarn(msg);
    fanOut('warn', msg);
    return;
  }
  const combined = String(msg) + (err != null ? ` ${errorMessage(err)}` : '');
  origWarn(combined);
  fanOut('warn', combined);
};

if (typeof silly.crash === 'function') {
  const origCrash = silly.crash.bind(silly);
  silly.crash = function crashWrapped(msg, err) {
    if (arguments.length <= 1) {
      origCrash(msg);
      fanOut('crash', msg);
      return;
    }
    const combined = String(msg) + (err != null ? ` ${errorMessage(err)}` : '');
    origCrash(combined);
    fanOut('crash', combined);
  };
}

module.exports = silly;
