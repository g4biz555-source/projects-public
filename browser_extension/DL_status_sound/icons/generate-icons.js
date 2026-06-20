// Icon Generator for Download Status Sound
// This script generates PNG icons from SVG using canvas API (Node.js with canvas package, or browser)
// For Firefox submission, you need actual PNG files.

// Simple approach: Create inline SVG and convert to PNG
// Run with: node generate-icons.js (requires npm install canvas)

const fs = require('fs');
const path = require('path');

// SVG icon template - download arrow design
function createIconSVG(size, color1, color2) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size/5}" fill="url(#grad)"/>
  <g fill="white">
    <!-- Download arrow -->
    <path d="M${size/2} ${size*0.2} L${size*0.35} ${size*0.45} L${size*0.42} ${size*0.45} L${size*0.42} ${size*0.7} L${size*0.58} ${size*0.7} L${size*0.58} ${size*0.45} L${size*0.65} ${size*0.45} Z"/>
    <!-- Bottom line -->
    <rect x="${size*0.25}" y="${size*0.78}" width="${size*0.5}" height="${size*0.06}" rx="${size/20}"/>
  </g>
</svg>`;
}

// For development, create placeholder PNG files (1x1 pixel colored squares)
// These need to be replaced with proper icons for submission
function createPlaceholderPNG(size, outputPath) {
  // Create a simple buffer for a minimal valid PNG
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
    0x00, 0x00, 0x00, Math.floor(size/256), size%256,  // width
    0x00, 0x00, 0x00, Math.floor(size/256), size%256,  // height
    0x08, 0x02, 0x00, 0x00, 0x00  // bit depth, color type, etc.
  ]);

  // For a proper icon, use an image generation library or manual creation
  console.log(`Placeholder: ${outputPath} - Replace with actual icon for production`);
  
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  
  // Write SVG as placeholder (can be converted to PNG using external tools)
  fs.writeFileSync(outputPath.replace('.png', '.svg'), createIconSVG(size, '#667eea', '#764ba2'));
}

// Create icon directory and generate SVG placeholders
const iconDir = path.join(__dirname);
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

createPlaceholderPNG(16, path.join(iconDir, 'icon16.png'));
createPlaceholderPNG(48, path.join(iconDir, 'icon48.png'));
createPlaceholderPNG(128, path.join(iconDir, 'icon128.png'));

console.log('Icon placeholders created as SVG files.');
console.log('To generate PNG files:');
console.log('  npm install canvas');
console.log('  node generate-icons.js');
console.log('Or use an online tool to convert the SVG files to PNG.');