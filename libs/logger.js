/**
 * silly-logger only accepts a single string for .error() — the second argument is ignored.
 * This wrapper forwards one-arg calls unchanged; for (msg, err) it appends message and errno code.
 */
const silly = require('silly-logger');

function errorMessage(err) {
  if (err == null) return '';
  if (err instanceof Error) {
    return err.message + (err.code ? ` [${err.code}]` : '');
  }
  return String(err);
}

const origError = silly.error.bind(silly);
silly.error = function errorWrapped(msg, err) {
  if (arguments.length === 1) {
    if (msg instanceof Error) {
      origError(errorMessage(msg));
      return;
    }
    origError(msg);
    return;
  }
  origError(String(msg) + (err != null ? ` ${errorMessage(err)}` : ''));
};

module.exports = silly;
