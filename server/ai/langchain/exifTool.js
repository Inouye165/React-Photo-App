const exifr = require('exifr');
const { tool } = require('@langchain/core/tools');

// Small EXIF/metadata extraction tool.
// Returns a plain object with parsed metadata (GPS, Make/Model, DateTime, etc.)
async function extractExif(filePath) {
  try {
    const meta = await exifr.parse(filePath, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
    });
    return meta || {};
  } catch {
    // Keep failures non-fatal for the pipeline; caller can decide how to handle missing metadata
    return {};
  }
}

// LangChain Tool version
const exifTool = tool(
  async ({ filePath }) => {
    const metadata = await extractExif(filePath);
    return JSON.stringify(metadata);
  },
  {
    name: 'extract_exif',
    description: 'Extract EXIF metadata from an image file, including GPS, camera info, and timestamps.',
    schema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The absolute path to the image file.',
        },
      },
      required: ['filePath'],
    },
  }
);

module.exports = { extractExif, exifTool };
