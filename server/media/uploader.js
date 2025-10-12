const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

/**
 * Creates a multer upload middleware with consistent configuration
 * @param {string} workingDir - Directory where uploaded files will be stored
 * @returns {multer} Configured multer middleware
 */
function createUploadMiddleware(workingDir) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, workingDir);
    },
    filename: function (req, file, cb) {
      let filename = file.originalname;
      let counter = 1;
      
      // Generate unique filename if file already exists
      while (fs.existsSync(path.join(workingDir, filename))) {
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        filename = `${basename}(${counter})${ext}`;
        counter++;
      }
      
      cb(null, filename);
    }
  });

  const upload = multer({
    storage: storage,
    limits: { 
      fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      
      // Accept files with image MIME type or allowed image extensions
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'), false);
      }
    }
  });

  return upload;
}

module.exports = {
  createUploadMiddleware,
  ALLOWED_IMAGE_EXTENSIONS
};