const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS middleware for frontend communication
app.use(cors({
  origin: 'http://localhost:5173', // Vite dev server
  credentials: true
}));

app.use(express.json());

// Configure working directory (default: C:/Users/<username>/working)
const DEFAULT_WORKING_DIR = path.join(os.homedir(), 'working');
const WORKING_DIR = process.env.PHOTO_WORKING_DIR || DEFAULT_WORKING_DIR;

// Ensure working directory exists
if (!fs.existsSync(WORKING_DIR)) {
  fs.mkdirSync(WORKING_DIR, { recursive: true });
  console.log(`Created working directory: ${WORKING_DIR}`);
}

// Configure multer for file upload with original filename preservation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, WORKING_DIR);
  },
  filename: function (req, file, cb) {
    // Generate unique filename if file already exists
    let filename = file.originalname;
    let counter = 1;
    
    while (fs.existsSync(path.join(WORKING_DIR, filename))) {
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
    // Accept all image types and common image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (imageExtensions.includes(ext)) {
      cb(null, true);
    } else {
      console.log(`Rejected file: ${file.originalname}, MIME: ${file.mimetype}`);
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Upload endpoint
app.post('/upload', upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    console.log(`Saved photo: ${req.file.filename} (${req.file.size} bytes)`);
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      workingDir: WORKING_DIR
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save file'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    workingDir: WORKING_DIR,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large'
      });
    }
  }
  
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Photo upload server running on port ${PORT}`);
  console.log(`Working directory: ${WORKING_DIR}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});