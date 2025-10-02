# React Photo Filtering App

A full-screen React application for dynamically filtering and browsing photos by date range with Node.js backend for automatic file storage.

## Features

### Frontend
- **Smart Folder Selection**: Opens directly in your Pictures folder (Chromium browsers) or uses native folder picker
- **Automatic Image Detection**: Automatically filters and displays supported image formats (.jpg, .jpeg, .png, .gif, .heic, .bmp, .tiff, .webp)
- **Robust EXIF Fallback**: Handles EXIF parsing errors gracefully with multiple date extraction methods
- **Dynamic Date Filtering**: Real-time filtering with instant list updates based on start and end date inputs
- **Chronological Sorting**: Photos displayed in chronological order (oldest to newest)
- **GPS Location Display**: Shows GPS coordinates from photo metadata or "none" if unavailable
- **Server Upload**: Upload filtered photos to backend server for automatic local storage
- **List View**: Clean, detailed list format showing filename, date taken, GPS location, and privileges
- **Photo Counter**: Shows filtered count vs total photos
- **Privilege Detection**: Shows file privileges (read/write/none/unknown) for each photo
- **Debug UI for Filtered-Out Files**: Toggle to view files excluded by date filter for troubleshooting
- **Error Toast Messages**: User-friendly error notifications for upload failures
- **Progress Tracking**: Real-time upload progress with cancellation support

### Backend Server
- **Automatic File Storage**: Saves uploaded photos to configurable local directory (`C:/Users/<username>/working` by default)
- **Metadata Preservation**: Preserves original EXIF/XMP data without re-encoding
- **Duplicate Handling**: Automatically generates unique filenames to prevent overwrites
- **Robust Error Handling**: Graceful permission and disk error management
- **File Validation**: Accepts all image types with size limits (50MB per file)
- **CORS Support**: Configured for local React frontend communication

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

This project includes VS Code workspace settings (`.vscode/settings.json`) that disable CSS validation to prevent linting errors with Tailwind CSS directives. The `@tailwind` directives are processed by PostCSS during build and don't need CSS validation.

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Future Enhancements

- Add search functionality by filename
- Implement additional sorting options
- Add zoom/view full-size images
- Export filtered photo list
- Add keyboard shortcuts for navigation
- Add photo preview thumbnails
- Support for more image formats
