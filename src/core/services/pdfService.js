// pdfService using wkhtmltopdf with path checking validation to prevent node process crash
const wkhtmltopdf = require('wkhtmltopdf');
const { exec } = require('child_process');

let isWkhtmltopdfAvailable = null;

/**
 * Checks if the wkhtmltopdf command-line tool is installed and accessible in the system path.
 */
const checkWkhtmltopdf = () => {
  return new Promise((resolve) => {
    if (isWkhtmltopdfAvailable !== null) {
      return resolve(isWkhtmltopdfAvailable);
    }
    exec('wkhtmltopdf -V', (err) => {
      if (err) {
        isWkhtmltopdfAvailable = false;
      } else {
        isWkhtmltopdfAvailable = true;
      }
      resolve(isWkhtmltopdfAvailable);
    });
  });
};

const generatePdf = async (htmlContent, outputPath) => {
  // First, verify that wkhtmltopdf is available to prevent spawning errors that trigger uncatchable process-level exceptions.
  const available = await checkWkhtmltopdf();
  if (!available) {
    throw new Error('wkhtmltopdf binary is not installed or not available in the system PATH.');
  }

  return new Promise((resolve, reject) => {
    try {
      const stream = wkhtmltopdf(htmlContent, { output: outputPath }, (err) => {
        if (err) return reject(err);
        resolve(outputPath);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generatePdf,
  checkWkhtmltopdf
};
