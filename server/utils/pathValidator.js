const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Validates that a file path is within the allowed temp directory.
 * Throws an error if the path is outside the allowed directory (prevents path traversal).
 * @param {string} filePath - The file path to validate.
 * @param {string[]} [allowedDirs] - Optional list of allowed directories.
 * @returns {string} The resolved safe path (if valid).
 */
function validateSafePath(filePath, allowedDirs) {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid file path: not a string');
  }
  
  const resolvedPath = path.resolve(filePath);
  
  // Allow custom allowedDirs, default to working dir and OS temp dir
  if (!allowedDirs) {
    allowedDirs = [
      path.resolve(__dirname, '../working'),
      path.resolve(os.tmpdir())
    ];
  } else {
    // Ensure all provided allowedDirs are resolved
    allowedDirs = allowedDirs.map(dir => path.resolve(dir));
  }

  // Pre-check: Ensure resolved path starts with one of the allowed dirs
  // This prevents passing obviously malicious paths to realpathSync
  const preCheckSafe = allowedDirs.some(dir => {
    const base = dir.endsWith(path.sep) ? dir : dir + path.sep;
    return resolvedPath === dir || resolvedPath.startsWith(base);
  });

  if (!preCheckSafe) {
     throw new Error(`Unsafe file path detected (pre-check): ${filePath}`);
  }

  let realPath;
  try {
    realPath = fs.realpathSync(resolvedPath);
  } catch {
    throw new Error(`Unsafe or invalid file path detected (realpath failed): ${filePath}`);
  }

  // Post-check: Ensure real path starts with one of the real allowed dirs
  const realAllowedDirs = allowedDirs.map(dir => {
      try {
          return fs.realpathSync(dir);
      } catch {
          return dir; 
      }
  });

  const isSafe = realAllowedDirs.some(dir => {
    const base = dir.endsWith(path.sep) ? dir : dir + path.sep;
    return realPath === dir || realPath.startsWith(base);
  });

  if (!isSafe) {
    throw new Error(`Unsafe file path detected (post-check): ${filePath}`);
  }
  
  return realPath;
}

module.exports = { validateSafePath };
