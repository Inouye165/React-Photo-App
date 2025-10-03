# React Photo Filtering App

A full-screen React application for dynamically filtering and browsing photos by date range with Node.js backend for automatic file storage.

## Key Features (2025 Update)

- **Backend-driven workflow:** All photo management, metadata, and permissions are handled by the backend server. The React app fetches and displays everything from backend APIs.
- **Folder picker & date filter:** Select a local folder, filter photos by date (using EXIF/file dates), and upload only the filtered files to the backend.
- **Hash-based deduplication:** Every file is hashed (SHA-256) on upload/ingest. Duplicate files (by content) are automatically skipped. The UI shows the last 5 digits of each file's hash.
- **Privileges column:** The app displays actual file system privileges (read/write/execute) for each photo as reported by the backend.
- **Automatic DB migration:** The backend automatically upgrades the database schema (e.g., adds missing columns) on startup, with no data loss.
- **Robust error handling:** All errors and upload messages are shown in a prominent toast at the top of the app.

## Usage (2025)

1. Start the backend server (`cd server && npm start`).
2. Start the frontend (`npm run dev`).
3. In the app, click "Select Folder for Upload" to pick a local folder.
4. Filter/select photos by date, then upload to the backend.
5. The backend view shows all photos, metadata, privileges, and hash info. No duplicates are stored.

## File Hashing & Deduplication

- Every photo is hashed (SHA-256) on upload or server start.
- If a file with the same hash already exists, it is skipped (not re-uploaded or re-indexed).
- The UI shows a ✔ and the last 5 digits of the hash for each photo.

## Technical Stack

### Frontend
- **React 19**: Latest React with modern hooks
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **EXIF.js (exifr)**: Library for reading photo metadata
- **File System Access API**: Modern browser API for folder selection
- **ESLint**: Code linting and formatting

### Backend
- **Node.js**: JavaScript runtime for server
- **Express**: Web framework for REST API
- **Multer**: Middleware for handling multipart/form-data file uploads
- **CORS**: Cross-origin resource sharing support

## File Structure

```
photo-app/
├── public/
├── src/
│   ├── App.jsx          # Main application component with photo filtering logic
│   ├── api.js           # Backend API communication utilities
│   ├── index.css        # Tailwind CSS imports
│   └── main.jsx         # React entry point
├── server/              # Backend Node.js server
│   ├── server.js        # Express server with upload endpoints
│   ├── package.json     # Server dependencies
│   └── README.md        # Server documentation
├── tailwind.config.js   # Tailwind configuration
├── postcss.config.js    # PostCSS configuration
├── vite.config.js       # Vite configuration
├── package.json         # Frontend dependencies and scripts
└── README.md            # This documentation
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Modern web browser (Chrome, Edge recommended for full features)

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
2. Click "Select Photos Folder" - the folder picker will open in your Pictures folder (on supported browsers)
3. The application will scan and display all supported image files in chronological order
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. The list updates instantly as you change dates, showing the filtered count
6. Click "Copy to Working" to copy all filtered photos to a new timestamped folder in your Documents directory

## Copy to Working Feature

- **Automatic Folder Creation**: Creates a folder named `PhotoWorking_YYYY-MM-DD` in your Documents
- **Filtered Photos Only**: Only copies photos that match your current date filter
- **Progress Updates**: Shows real-time progress during copying
- **File System Access**: Uses modern browser APIs for direct file system access
- **Browser Support**: Requires Chromium-based browsers (Chrome, Edge) for full functionality

## Browser Compatibility

- **Full Support**: Chrome, Edge (File System Access API - opens in Pictures folder)
- **Basic Support**: Firefox, Safari (standard folder picker)
- **Requirements**: File API, ES6+ JavaScript, React 19

## Limitations

- Due to browser security restrictions, only works with locally selected files
- Large folders may take time to process initially
- EXIF data reading depends on photo metadata being present
- Falls back to file modification date if EXIF date is unavailable
- File System Access API requires user gesture and HTTPS in production

## Development

### Code Quality

- ESLint configuration for consistent code style
- React hooks best practices
- Modern JavaScript (ES6+)
- Functional components with hooks

### VS Code Configuration

This project includes VS Code workspace settings (`.vscode/settings.json`) that disable CSS validation to prevent linting errors with Tailwind CSS directives. The `@tailwind`

## Thumbnails

- **Automatic thumbnail generation**: The backend generates thumbnails for every image in the `working` folder and serves them from `/thumbnails/<hash>.jpg` so the frontend can display fast previews without re-reading original files.
- **HEIC/HEIF support and fallback**: Thumbnails are generated with `sharp` when possible. If `sharp`/libvips lacks HEIF/HEIC support, the server will attempt a fallback conversion using ImageMagick (the `magick` command) to create thumbnails. Install ImageMagick with HEIF delegates on your system to enable the fallback.