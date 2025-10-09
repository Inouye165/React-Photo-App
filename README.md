# React Photo Filtering App


A full-screen React application for filtering, browsing, and uploading photos by date range, with a Node.js Express backend for file storage, deduplication, and AI-powered metadata extraction.

**Author:** Ron Inouye

## Key Features (2025 Update)

- **Backend-driven workflow:** All photo management, metadata, and permissions are handled by the backend server. The React app fetches and displays everything from backend APIs.
- **Folder picker & date filter:** Select a local folder, filter photos by date (using EXIF/file dates), and upload only the filtered files to the backend.
- **Hash-based deduplication:** Every file is hashed (SHA-256) on upload/ingest. Duplicate files (by content) are automatically skipped. The UI shows the last 5 digits of each file's hash.
- **Privileges column:** The app displays actual file system privileges (read/write/execute) for each photo as reported by the backend.
- **Automatic DB migration:** The backend automatically upgrades the database schema (e.g., adds missing columns) on startup, with no data loss.
- **Robust error handling:** All errors and upload messages are shown in a prominent toast at the top of the app.
- **AI-powered captions and descriptions:** The backend uses OpenAI Vision to generate captions, descriptions, and keywords for each photo, including HEIC/HEIF files.
- **HEIC/HEIF support:** Both thumbnails and AI processing support HEIC/HEIF files, with ImageMagick fallback if sharp/libvips lacks support.
- **Upload panel:** The photo upload panel now fills the viewport under the toolbar, with a compact file list and flush-edge layout. No large image previews; file list shows filename, date, size, and type.
- **Interactive Canvas Editor:** Edit photos with an interactive canvas that allows you to position captions directly on images. Drag text to reposition, customize font size and color, and save your layout preferences. Text styling persists across editing sessions.

## Usage (2025)

1. Start the backend server (`cd server && npm start`).
2. Start the frontend (`npm run dev`).
3. In the app, click "Select Folder for Upload" to pick a local folder.
4. Filter/select photos by date, then upload to the backend.
5. The backend view shows all photos, metadata, privileges, and hash info. No duplicates are stored.
6. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry.
7. The upload panel is now flush with the viewport edges, matching other views. The file list is compact and readable.

## File Hashing & Deduplication

- Every photo is hashed (SHA-256) on upload or server start.
- If a file with the same hash already exists, it is skipped (not re-uploaded or re-indexed).
- The UI shows a ✔ and the last 5 digits of the hash for each photo.

## Technical Stack

### Frontend
- **React 19**: Latest React with modern hooks
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **exifr**: Library for reading photo metadata
- **File System Access API**: Modern browser API for folder selection
- **react-konva**: Canvas library for interactive image editing with draggable text overlays
- **ESLint**: Code linting and formatting
   - **PhotoUploadForm.jsx**: Upload panel with compact file list, flush-edge layout
   - **ImageCanvasEditor.jsx**: Interactive canvas editor for positioning captions on images
   - **EditPage.jsx**: Photo editing interface with canvas, metadata forms, and AI chat placeholder

### Backend
- **Node.js**: JavaScript runtime for server
- **Express**: Web framework for REST API
- **Multer**: Middleware for handling multipart/form-data file uploads
- **CORS**: Cross-origin resource sharing support
- **Sharp**: Image processing (with fallback to ImageMagick for HEIC/HEIF)
- **ImageMagick**: Fallback for HEIC/HEIF conversion if sharp/libvips lacks support

## File Structure

```
photo-app/
├── public/
├── src/
│   ├── App.jsx                # Main application component with photo filtering logic
│   ├── EditPage.jsx           # Photo editing interface with canvas and metadata forms
│   ├── ImageCanvasEditor.jsx  # Interactive canvas for positioning captions on images
│   ├── PhotoUploadForm.jsx    # Upload panel with compact file list
│   ├── PhotoGallery.jsx       # Photo gallery display component
│   ├── Toolbar.jsx            # Fixed navigation toolbar
│   ├── api.js                 # Backend API communication utilities
│   ├── index.css              # Tailwind CSS imports
│   └── main.jsx               # React entry point
├── server/                     # Backend Node.js server
│   ├── server.js              # Express server with upload endpoints
│   ├── package.json           # Server dependencies
│   └── README.md              # Server documentation
├── tailwind.config.js         # Tailwind configuration
├── postcss.config.js          # PostCSS configuration
├── vite.config.js             # Vite configuration
├── package.json               # Frontend dependencies and scripts
└── README.md                  # This documentation
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Modern web browser (Chrome, Edge recommended for full features)
- [ImageMagick](https://imagemagick.org/) installed and available in your system PATH (for HEIC/HEIF support)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Inouye165/React-Photo-App.git
   cd React-Photo-App
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install backend dependencies:
   ```bash
   cd server
   npm install
   cd ..
   ```

### Development

1. Start the backend server:
   ```bash
   cd server
   npm start
   ```
   Server will run on `http://localhost:3001`

2. Start the frontend development server (in new terminal):
   ```bash
   npm run dev
   ```
   Frontend will be available at `http://localhost:5173`

### Build

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Usage

1. Open the application in a modern web browser
2. Click "Select Folder for Upload" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Upload" to send filtered photos to the backend
7. The backend view shows all photos, metadata, privileges, and hash info
8. Click on a photo to edit it - the interactive canvas editor allows you to position captions on the image:
   - Drag the text to reposition it anywhere on the image
   - Use the controls to adjust font size and color
   - Edit the caption text directly in the editor
   - Click "Save Captioned Image" to persist your text positioning and styling
9. If a file fails AI processing (shows 'AI processing failed'), POST to `/debug/reset-ai-retry` and click "Recheck Inprogress AI" to retry

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.

## HEIC/HEIF AI Processing Support
- HEIC/HEIF files are now supported for AI processing. If the backend cannot convert HEIC using sharp, it will automatically use ImageMagick as a fallback.
- If a file fails AI processing (shows 'AI processing failed'), you can reset its retry count by POSTing to `/debug/reset-ai-retry` and then clicking 'Recheck Inprogress AI' in the frontend to retry processing.
- For new HEIC files, no manual intervention is needed.

## Troubleshooting
- If you see errors like 'bad seek' or 'compression format not built in' for HEIC files, make sure ImageMagick is installed and available in your system PATH.
- If a file repeatedly fails AI processing, check the backend logs for details.

## Limitations
- Due to browser security restrictions, only works with locally selected files
- Large folders may take time to process initially
- EXIF data reading depends on photo metadata being present
- Falls back to file modification date if EXIF date is unavailable
- File System Access API requires user gesture and HTTPS in production

## Open TODOs
- **Resize and compress all images before sending to OpenAI Vision API to reduce costs. (Convert to JPEG, max 1024x1024, quality 70–80.)**
- If a file fails AI processing (shows 'AI processing failed'), use the /debug/reset-ai-retry endpoint to reset its retry count, then click 'Recheck Inprogress AI' to retry processing.
- Add WebSocket/SSE for live photo state and thumbnail updates — push notifications when files change or thumbnails are created.
- Make thumbnail generation asynchronous and cache-optimized — generate thumbnails in background workers and avoid blocking startup.
- Add client-side content-hash check to avoid uploading duplicates — compute file hash in browser and skip uploads if server already has the hash.
- Add filename search and full-size preview modal in frontend — quick search, sort, and modal for viewing images at full resolution.
- Add automated tests and CI pipeline for build and linting — ensure stability with unit tests and GitHub Actions.

## Progress saved (work-in-progress)

- Modularized gallery and upload UI into `src/PhotoGallery.jsx` and `src/PhotoUploadForm.jsx`.
- Fixed upload callsites to use the backend upload endpoint and added upload/fetch logging.
- Upload panel now fills the viewport under the toolbar, with a compact file list and flush-edge layout. No large image previews; file list shows filename, date, size, and type.
- Server skips non-image files (e.g., desktop.ini) and logs them, instead of exiting. HEIC/HEIF support confirmed with ImageMagick fallback.
- **NEW: Interactive canvas editor implemented** - `ImageCanvasEditor.jsx` provides drag-and-drop text positioning on images with font size/color controls. Text styling persists across editing sessions.
- Remaining open items: CSS grid for thumbnails, live updates, search, automated tests, and backend captioned image file export.

If you want the cleaned app to be the mounted entry, change `src/main.jsx` to import `App_clean.jsx` instead of `App.jsx`.