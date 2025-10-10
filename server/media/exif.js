const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

async function copyExifMetadata(sourcePath, destPath) {
  try {
    const exiftoolBin = path.join(__dirname, '..', 'node_modules', 'exiftool-vendored.exe', 'bin', 'exiftool.exe');
    const command = `"${exiftoolBin}" -TagsFromFile "${sourcePath}" -all:all -overwrite_original "${destPath}"`;
    await execPromise(command, { windowsHide: true, timeout: 30000 });
    console.log(`✓ Copied EXIF metadata: ${path.basename(sourcePath)} → ${path.basename(destPath)}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to copy EXIF metadata: ${error.message}`);
    return false;
  }
}

async function removeExifOrientation(destPath) {
  try {
    const exiftoolBin = path.join(__dirname, '..', 'node_modules', 'exiftool-vendored.exe', 'bin', 'exiftool.exe');
    await execPromise(`"${exiftoolBin}" -Orientation= -overwrite_original "${destPath}"`, { windowsHide: true, timeout: 10000 });
    console.log('✓ Removed EXIF orientation from edited file');
    return true;
  } catch (error) {
    console.warn('✗ Failed to remove EXIF orientation:', error.message);
    return false;
  }
}

module.exports = { copyExifMetadata, removeExifOrientation };