# React Photo Filtering App

A full-screen React application for dynamically filtering and browsing photos by date range using Vite and Tailwind CSS.

## Features

- **Smart Folder Selection**: Opens directly in your Pictures folder (Chromium browsers) or uses native folder picker
- **Automatic Image Detection**: Automatically filters and displays supported image formats (.jpg, .jpeg, .png, .gif, .heic, .bmp, .tiff, .webp)
- **EXIF Date Extraction**: Reads photo metadata to determine the accurate date taken
- **Dynamic Date Filtering**: Real-time filtering with instant list updates based on start and end date inputs
- **Chronological Sorting**: Photos displayed in chronological order (oldest to newest)
- **GPS Location Display**: Shows GPS coordinates from photo metadata or "none" if unavailable
- **Copy to Working Folder**: Copy filtered photos to a timestamped working directory
- **List View**: Clean, detailed list format showing filename, date taken, and GPS location
- **Photo Counter**: Shows filtered count vs total photos
- **React Hooks**: Modern React with hooks for state management
- **Vite Build**: Fast development and build process

## Technical Stack

- **React 19**: Latest React with modern hooks
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **EXIF.js**: Library for reading photo metadata
- **File System Access API**: Modern browser API for folder selection
- **ESLint**: Code linting and formatting

## File Structure

```
photo-app/
├── public/
├── src/
│   ├── App.jsx          # Main application component with photo filtering logic
│   ├── index.css        # Tailwind CSS imports
│   └── main.jsx         # React entry point
├── tailwind.config.js   # Tailwind configuration
├── postcss.config.js    # PostCSS configuration
├── vite.config.js       # Vite configuration
├── package.json         # Dependencies and scripts
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

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

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
