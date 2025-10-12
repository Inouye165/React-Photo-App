# React Photo Filtering App

[![Tests](https://img.shields.io/badge/tests-49%20passing-brightgreen.svg)](https://github.com/Inouye165/React-Photo-App)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646cff.svg)](https://vitejs.dev/)
[![Testing](https://img.shields.io/badge/Testing-Vitest-6e9f18.svg)](https://vitest.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A full-screen React application for filtering, browsing, and uploading photos by date range, with a Node.js Express backend for file storage, deduplication, and AI-powered metadata extraction.

**Author:** Ron Inouye

## Table of Contents

- [🆕 What's New](#-whats-new-october-2025)
- [Key Features](#key-features-2025-update)
- [Usage](#usage-2025)
- [Technical Stack](#technical-stack)
- [File Structure](#file-structure)
- [Getting Started](#getting-started)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🆕 What's New (October 2025)

### Testing & Quality  
- **Comprehensive Test Suite**: 49 tests covering all React components with Vitest and React Testing Library
- **User-Centered Testing**: Focus on real user interactions, accessibility, and error handling
- **CI-Ready**: All tests pass consistently, ready for GitHub Actions integration

### UX Improvements
- **Toolbar Messaging**: Upload success messages now appear in the toolbar for persistent feedback
- **Better User Feedback**: Non-intrusive success notifications that persist until dismissed

### Developer Experience  
- **Modern Testing Stack**: Vitest with native Vite integration for fast test execution  
- **Mock Strategy**: Proper isolation of components with API and filesystem mocking
- **Test Coverage**: State management, user interactions, error scenarios, and accessibility

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
- **Comprehensive Testing Suite:** Production-ready component testing with Vitest and React Testing Library. 49 tests covering user interactions, state management, error handling, and accessibility.

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
- **Vitest**: Modern testing framework with React Testing Library
- **Component Testing**: Comprehensive test coverage with 49 tests across all major components
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
│   ├── test/
│   │   └── setup.js           # Global test configuration and mocks
│   ├── *.test.jsx             # Component test suites (49 tests total)
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

### Environment Configuration

The frontend uses environment variables for configuration:

- `VITE_API_URL`: Base URL for the backend API (default: `http://localhost:3001`)

To override for production or different environments, create a `.env` file in the root directory:

```bash
VITE_API_URL=https://your-production-api.com
```

This allows easy deployment to different environments without code changes.

### Build

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

### Testing

Run the test suite:
```bash
# Run tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run tests with UI dashboard
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

The project includes comprehensive component testing with:
- **49 tests** across all major components
- **User interaction testing** (clicks, form inputs, navigation)
- **State management testing** (photo loading, filtering, uploads)
- **Error handling testing** (API failures, validation errors)
- **Accessibility testing** (ARIA attributes, keyboard navigation)
- **Mock integration** for external dependencies (APIs, file systems)

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

## Known Limitations

- **Browser Security**: Only works with locally selected files due to browser security restrictions
- **Performance**: Large folders may take time to process initially  
- **EXIF Dependency**: EXIF data reading depends on photo metadata being present
- **Date Fallback**: Falls back to file modification date if EXIF date is unavailable
- **API Requirements**: File System Access API requires user gesture and HTTPS in production
- **Browser Support**: Modern browsers required for full feature set (Chrome, Edge recommended)

## Testing & Quality Assurance

### Test Coverage
- **Component Tests**: 49 comprehensive tests covering all React components
- **User Interaction**: Click handlers, form inputs, navigation workflows
- **State Management**: Photo loading, filtering, upload processes  
- **Error Handling**: API failures, network issues, validation errors
- **Accessibility**: ARIA attributes, keyboard navigation, screen reader support
- **Performance**: Loading states, async operations, user feedback

### Test Architecture  
- **Vitest**: Modern testing framework with native Vite integration
- **React Testing Library**: User-centric component testing approach
- **Mock Strategy**: Isolated unit tests with API and filesystem mocking
- **CI Ready**: All tests pass consistently for automated deployment

## Open TODOs
- **Resize and compress all images before sending to OpenAI Vision API to reduce costs. (Convert to JPEG, max 1024x1024, quality 70–80.)**
- If a file fails AI processing (shows 'AI processing failed'), use the /debug/reset-ai-retry endpoint to reset its retry count, then click 'Recheck Inprogress AI' to retry processing.
- Add WebSocket/SSE for live photo state and thumbnail updates — push notifications when files change or thumbnails are created.
- Make thumbnail generation asynchronous and cache-optimized — generate thumbnails in background workers and avoid blocking startup.
- Add client-side content-hash check to avoid uploading duplicates — compute file hash in browser and skip uploads if server already has the hash.
- Add filename search and full-size preview modal in frontend — quick search, sort, and modal for viewing images at full resolution.
- ~~Add automated tests and CI pipeline for build and linting~~ ✅ **COMPLETED**: Comprehensive component testing implemented with 49 tests
- Add GitHub Actions CI pipeline for automated testing and deployment

## Progress saved (work-in-progress)

- Modularized gallery and upload UI into `src/PhotoGallery.jsx` and `src/PhotoUploadForm.jsx`.
- Fixed upload callsites to use the backend upload endpoint and added upload/fetch logging.
- Upload panel now fills the viewport under the toolbar, with a compact file list and flush-edge layout. No large image previews; file list shows filename, date, size, and type.
- Server skips non-image files (e.g., desktop.ini) and logs them, instead of exiting. HEIC/HEIF support confirmed with ImageMagick fallback.
- **NEW: Interactive canvas editor implemented** - `ImageCanvasEditor.jsx` provides drag-and-drop text positioning on images with font size/color controls. Text styling persists across editing sessions.
- **NEW: Comprehensive testing suite implemented** - 49 tests covering all React components with Vitest and React Testing Library. Includes user interaction, state management, error handling, and accessibility testing.
- **NEW: Toolbar messaging system** - Upload success messages now appear in the toolbar instead of popup toasts, providing persistent feedback until dismissed or page reload.
- Remaining open items: CSS grid for thumbnails, live updates, search, GitHub Actions CI, and backend captioned image file export.

If you want the cleaned app to be the mounted entry, change `src/main.jsx` to import `App_clean.jsx` instead of `App.jsx`.

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests: `npm run test:run`
5. Ensure build passes: `npm run build`
6. Commit with descriptive messages
7. Push to your fork and submit a pull request

### Code Quality Standards
- All new components must include comprehensive tests
- Follow existing code patterns and naming conventions
- Ensure accessibility compliance (ARIA attributes, keyboard navigation)
- Update README documentation for new features
- Maintain test coverage above 95%

### Testing Requirements  
- Write tests for new components using Vitest and React Testing Library
- Test user interactions, not implementation details
- Include error handling and edge case scenarios
- Mock external dependencies appropriately
- Verify accessibility features work correctly

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- React team for the excellent framework and developer tools
- Vite team for the fast build system  
- Testing Library community for user-centric testing approaches
- OpenAI for AI-powered image analysis capabilities
- Sharp and ImageMagick teams for robust image processing