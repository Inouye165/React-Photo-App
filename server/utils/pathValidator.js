const path = require('path');
const os = require('os');

/**
 * Validates that a file path is within the allowed temp directory.
 * Throws an error if the path is outside the allowed directory (prevents path traversal).
 * @param {string} filePath - The file path to validate.
 * @returns {string} The resolved safe path (if valid).
 */
function validateSafePath(filePath) {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid file path: not a string');
  }
  const resolved = path.resolve(filePath);
  // Allow both the working dir and OS temp dir for flexibility
  const allowedDirs = [
    path.resolve(__dirname, '../working'),
    os.tmpdir()
  ];
  const isSafe = allowedDirs.some(dir => resolved.startsWith(dir));
  if (!isSafe) {
    throw new Error(`Unsafe file path detected: ${filePath}`);
  }
  return resolved;
}

module.exports = { validateSafePath };
