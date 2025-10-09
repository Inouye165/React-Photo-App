import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Text as KonvaText } from 'react-konva';

export default function ImageCanvasEditor({ imageUrl, caption, textStyle, onSave }) {
  const [image, setImage] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, scale: 1 });
  const [textProps, setTextProps] = useState({
    x: textStyle?.x ?? 50,
    y: textStyle?.y ?? 50,
    text: caption || '',
    fontSize: textStyle?.fontSize ?? 32,
    fill: textStyle?.fill ?? '#ffffff',
    fontFamily: 'Arial',
    draggable: true,
    shadowColor: 'black',
    shadowBlur: 10,
    shadowOpacity: 0.8,
  });
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  // Load image and calculate dimensions
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    
    img.onload = () => {
      setImage(img);
      
      // Calculate dimensions to fit container while maintaining aspect ratio
      const container = containerRef.current;
      if (container) {
        const containerWidth = container.offsetWidth - 40; // padding
        const containerHeight = container.offsetHeight - 40;
        
        const imgAspect = img.width / img.height;
        const containerAspect = containerWidth / containerHeight;
        
        let width, height, scale;
        if (imgAspect > containerAspect) {
          // Image is wider - fit to width
          width = containerWidth;
          height = containerWidth / imgAspect;
          scale = containerWidth / img.width;
        } else {
          // Image is taller - fit to height
          height = containerHeight;
          width = containerHeight * imgAspect;
          scale = containerHeight / img.height;
        }
        
        setDimensions({ width, height, scale, imgWidth: img.width, imgHeight: img.height });
        
        // Position text - use saved position if available, otherwise center initially
        if (!textStyle?.x && !textStyle?.y) {
          setTextProps(prev => ({
            ...prev,
            x: width / 2,
            y: height - 100, // Bottom area
          }));
        }
      }
    };
  }, [imageUrl, textStyle]);

  // Update caption text when prop changes
  useEffect(() => {
    setTextProps(prev => ({ ...prev, text: caption || '' }));
  }, [caption]);

  // Drag bound function to constrain text within image boundaries
  const handleDragBound = (pos) => {
    const textNode = stageRef.current?.findOne('.caption-text');
    if (!textNode || !dimensions.width) return pos;
    
    const textWidth = textNode.width();
    const textHeight = textNode.height();
    
    return {
      x: Math.max(0, Math.min(pos.x, dimensions.width - textWidth)),
      y: Math.max(0, Math.min(pos.y, dimensions.height - textHeight)),
    };
  };

  // Handle save
  const handleSave = () => {
    if (!stageRef.current) return;
    
    // Export canvas as data URL
    const dataURL = stageRef.current.toDataURL({
      pixelRatio: 1 / dimensions.scale, // Export at original resolution
      mimeType: 'image/jpeg',
      quality: 0.9,
    });
    
    console.log('Canvas exported:', dataURL.substring(0, 100) + '...');
    if (onSave) {
      // Pass both the image data and the text styling for persistence
      onSave(dataURL, {
        x: textProps.x,
        y: textProps.y,
        fontSize: textProps.fontSize,
        fill: textProps.fill,
      });
    }
  };

  if (!image || !dimensions.width) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading image...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-gray-100 p-4" style={{ overflow: 'hidden' }}>
      {/* Controls */}
      <div className="p-3 bg-white rounded border shadow-sm flex flex-wrap gap-3 items-center" style={{ flexShrink: 0, marginBottom: '12px' }}>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold">Font Size:</label>
          <input
            type="range"
            min="16"
            max="72"
            value={textProps.fontSize}
            onChange={(e) => setTextProps(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
            className="w-32"
          />
          <span className="text-sm">{textProps.fontSize}px</span>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold">Color:</label>
          <input
            type="color"
            value={textProps.fill}
            onChange={(e) => setTextProps(prev => ({ ...prev, fill: e.target.value }))}
            className="w-16 h-8 cursor-pointer"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold">Text:</label>
          <input
            type="text"
            value={textProps.text}
            onChange={(e) => setTextProps(prev => ({ ...prev, text: e.target.value }))}
            className="border rounded px-2 py-1 text-sm flex-1 min-w-[200px]"
            placeholder="Enter caption text..."
          />
        </div>
        
        <button
          onClick={handleSave}
          className="ml-auto px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold text-sm"
        >
          Save Captioned Image
        </button>
      </div>

      {/* Canvas */}
      <div className="flex items-center justify-center" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          style={{ background: '#f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
        >
          <Layer>
            <KonvaImage
              image={image}
              width={dimensions.width}
              height={dimensions.height}
            />
            <KonvaText
              name="caption-text"
              {...textProps}
              dragBoundFunc={handleDragBound}
              onDragMove={(e) => {
                setTextProps(prev => ({
                  ...prev,
                  x: e.target.x(),
                  y: e.target.y(),
                }));
              }}
            />
          </Layer>
        </Stage>
      </div>
      
      <p className="text-xs text-gray-600 text-center" style={{ flexShrink: 0, marginTop: '8px', marginBottom: '4px' }}>
        Drag the text to reposition • Use controls above to customize
      </p>
    </div>
  );
}
