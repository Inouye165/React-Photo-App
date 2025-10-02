# Dynamic Photo Filtering UI

A full-screen React application for dynamically filtering photos by date range using Vite and Tailwind CSS.

## Features

- **Folder Selection**: Select a local folder containing photos using the native file explorer
- **Automatic Image Detection**: Automatically filters and displays supported image formats (.jpg, .jpeg, .png, .gif, .heic, .bmp, .tiff, .webp)
- **EXIF Date Extraction**: Reads photo metadata to determine the date taken
- **Dynamic Date Filtering**: Real-time filtering based on start and end date inputs
- **Responsive Grid Layout**: Clean, responsive thumbnail grid using Tailwind CSS
- **React Hooks**: Modern React with hooks for state management
- **Vite Build**: Fast development and build process

## Technical Stack

- **React 19**: Latest React with modern hooks
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **EXIF.js**: Library for reading photo metadata
- **ESLint**: Code linting and formatting

## File Structure

```
photo-app/
├── public/
├── src/
│   ├── App.jsx          # Main application component
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

### Installation

1. Clone or download the project files
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
2. Click "Select Photos Folder" to choose a directory containing photos
3. The application will automatically scan and display thumbnails of all supported image files
4. Use the "Start Date" and "End Date" inputs to filter photos by date taken
5. Filtering happens instantly as you change the dates

## Browser Compatibility

- Modern browsers with support for:
  - File API
  - `webkitdirectory` attribute
  - ES6+ JavaScript features
  - React 19

## Limitations

- Due to browser security restrictions, this application only works with locally selected files
- Large folders may take time to process initially
- EXIF data reading depends on photo metadata being present
- Fallback to file modification date if EXIF date is unavailable

## Development

### Code Quality

- ESLint configuration for consistent code style
- React hooks best practices
- Modern JavaScript (ES6+)

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Future Enhancements

- Add search functionality by filename
- Implement sorting options (date, filename, etc.)
- Add zoom/view full-size images
- Export filtered photo list
- Add keyboard shortcuts for navigation
# React-Photo-App
