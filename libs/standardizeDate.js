const moment = require('moment');

const FORMATS = [
  'YYYY-MM-DD',
  'DD-MM-YYYY',
  'D-M-YYYY',
  'D-MM-YYYY',
  'DD-M-YYYY',
  'YY-MM-DD',
  'DD-MM-YY',
  'D-M-YY',
  'D-MM-YY',
  'DD-M-YY',
  'YYYY-M-D',
  'YY-M-D',
  'YYYY-MM-D',
  'YY-MM-D',
  'DD-MMM-YYYY',
  'DD-MMM-YY',
  'D-MMM-YYYY',
  'D-MMM-YY',
  'M-D-YYYY',
  'MM-DD-YYYY',
  'M-D-YY',
  'MM-DD-YY',
];

/**
 * Parse flexible date input into YYYY-MM-DD, or null if invalid.
 * @param {string} dateInput
 * @returns {string|null}
 */
function standardizeDate(dateInput) {
  if (!dateInput || typeof dateInput !== 'string') {
    return null;
  }

  const processedInput = dateInput.replace(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/, (match, p1, p2, p3) => {
    const a = p1.padStart(2, '0');
    const b = p2.padStart(2, '0');
    let y = p3;
    if (y.length === 2) y = `20${y}`;
    return `${a}-${b}-${y}`;
  });

  const parsedDate = moment(processedInput, FORMATS, true);

  if (parsedDate.isValid()) {
    if (parsedDate.year() < 1900 || parsedDate.year() > 2100) {
      return null;
    }
    return parsedDate.format('YYYY-MM-DD');
  }

  return null;
}

module.exports = { standardizeDate };
