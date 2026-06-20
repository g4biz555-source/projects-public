// PNG Icon Generator for Download Status Sound
// Generates proper PNG icons from SVG templates
// Usage: node create-png-icons.js (requires npm install canvas)

const fs = require('fs');
const path = require('path');

// Create icon SVG content
function createIconSVG(size) {
  const radius = Math.round(size * 0.156); // ~20px for 128, scaled proportionally
  const arrowTop = Math.round(size * 0.195); // 25/128
  const arrowMid = Math.round(size * 0.445); // 57/128
  const arrowBot = Math.round(size * 0.703); // 90/128
  const lineY = Math.round(size * 0.789); // 101/128
  const lineWidth = Math.round(size * 0.5); // 64/128
  const lineX = Math.round(size * 0.25); // 32/128
  const lineHeight = Math.round(size * 0.0625); // 8/128
  const rx = Math.max(1, Math.round(size * 0.031)); // 4/128
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#grad)"/>
  <g fill="white">
    <path d="M${Math.round(size/2)} ${arrowTop} L${Math.round(size*0.347)} ${arrowMid} L${Math.round(size*0.398)} ${arrowMid} L${Math.round(size*0.398)} ${arrowBot} L${Math.round(size*0.602)} ${arrowBot} L${Math.round(size*0.602)} ${arrowMid} L${Math.round(size*0.656)} ${arrowMid} Z"/>
    <rect x="${lineX}" y="${lineY}" width="${lineWidth}" height="${lineHeight}" rx="${rx}"/>
  </g>
</svg>`;
}

// Minimal PNG generator (no external dependencies)
// Creates a valid PNG file from scratch using zlib
function createPNG(width, height, drawFunc) {
  const zlib = require('zlib');
  
  // Create pixel data
  const pixels = new Uint8Array((width * height * 4) + height); // RGBA + filter bytes
  
  // Fill with transparent background first
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    pixels[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      pixels[pxOffset] = 255;     // R
      pixels[pxOffset + 1] = 255; // G  
      pixels[pxOffset + 2] = 255; // B
      pixels[pxOffset + 3] = 0;   // A (transparent)
    }
  }
  
  // Draw the icon
  drawFunc(pixels, width, height);
  
  // Compress with zlib
  const rawLength = pixels.length;
  const tempBuffer = Buffer.from(pixels);
  const compressed = zlib.deflateSync(tempBuffer);
  
  // Build PNG file
  const pngChunks = [];
  
  // PNG Signature
  pngChunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // Bit depth
  ihdrData[9] = 6;  // Color type (6 = RGBA)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  pngChunks.push(createChunk('IHDR', ihdrData));
  
  // IDAT chunk
  pngChunks.push(createChunk('IDAT', compressed));
  
  // IEND chunk
  pngChunks.push(createChunk('IEND', Buffer.alloc(0)));
  
  // Combine all chunks
  let totalLength = 0;
  for (const chunk of pngChunks) {
    totalLength += chunk.length;
  }
  
  const png = Buffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of pngChunks) {
    chunk.copy(png, offset);
    offset += chunk.length;
  }
  
  return png;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  
  const typeBuf = Buffer.alloc(4);
  for (let i = 0; i < 4; i++) {
    typeBuf[i] = type.charCodeAt(i);
  }
  
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc);
  
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = -306674912 ^ (c >> 1);
      } else {
        c = c >> 1;
      }
    }
    table[i] = c;
  }
  
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Gradient drawing functions
function drawGradientIcon(pixels, width, height) {
  const radius = Math.round(height * 0.156);
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Draw rounded rectangle with gradient
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Check if point is inside rounded rectangle
      let dx = Math.abs(x - centerX + radius);
      let dy = Math.abs(y - centerY + radius);
      
      // Simplified: check if inside main rect area
      const inMainRect = x >= radius && x < width - radius && y >= 0 && y < height;
      const inCorner = false;
      
      if (x < radius && y < radius) {
        // Top-left corner
        const cx = radius - 1;
        const cy = radius - 1;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist > radius) continue;
      } else if (x >= width - radius && y < radius) {
        // Top-right corner
        const cx = width - radius;
        const cy = radius - 1;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist > radius) continue;
      } else if (x < radius && y >= height - radius) {
        // Bottom-left corner
        const cx = radius - 1;
        const cy = height - radius;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist > radius) continue;
      } else if (x >= width - radius && y >= height - radius) {
        // Bottom-right corner
        const cx = width - radius;
        const cy = height - radius;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist > radius) continue;
      } else if (!(x >= radius && x < width - radius && y >= radius && y < height - radius)) {
        continue;
      }
      
      const pxOffset = y * (width * 4 + 1) + 1 + x * 4;
      
      // Gradient: #667eea to #764ba2
      const t = Math.sqrt(
        ((x - centerX) ** 2 + (y - centerY) ** 2) / 
        ((width/2) ** 2 + (height/2) ** 2)
      );
      
      // Purple gradient colors
      pixels[pxOffset] = Math.round(102 + (118 - 102) * t);     // R: #66 -> #76
      pixels[pxOffset + 1] = Math.round(126 + (75 - 126) * t);  // G: #7e -> #4b  
      pixels[pxOffset + 2] = Math.round(234 + (162 - 234) * t); // B: #ea -> #a2
      pixels[pxOffset + 3] = 255; // Opaque
    }
  }
}

function drawWhiteArrow(pixels, width, height) {
  const cx = Math.round(width / 2);
  const arrowTop = Math.round(height * 0.195);
  const arrowMid = Math.round(height * 0.445);
  const arrowBot = Math.round(height * 0.703);
  
  // Draw downward arrow
  for (let y = arrowTop; y <= arrowBot; y++) {
    for (let x = Math.round(width * 0.3) ; x <= Math.round(width * 0.69); x++) {
      const pxOffset = y * (width * 4 + 1) + 1 + x * 4;
      
      // Check if inside arrow shape
      let inArrow = false;
      const relY = y - arrowTop;
      const arrowHeight = arrowBot - arrowTop;
      
      if (relY < arrowHeight * 0.3) {
        // Arrow head (triangle pointing down)
        const progress = relY / (arrowHeight * 0.3);
        const halfWidth = Math.round(width * 0.19 * (0.5 + progress * 0.5));
        if (Math.abs(x - cx) <= halfWidth) inArrow = true;
      } else {
        // Arrow shaft
        const shaftHalfWidth = Math.round(width * 0.08);
        if (Math.abs(x - cx) <= shaftHalfWidth) inArrow = true;
      }
      
      if (inArrow) {
        pixels[pxOffset] = 255;     // R
        pixels[pxOffset + 1] = 255; // G
        pixels[pxOffset + 2] = 255; // B
        pixels[pxOffset + 3] = 255; // A
      }
    }
  }
  
  // Bottom line
  const lineY = Math.round(height * 0.789);
  const lineX = Math.round(width * 0.25);
  const lineWidth = Math.round(width * 0.5);
  
  for (let x = lineX; x < lineX + lineWidth; x++) {
    for (let y = lineY; y < lineY + Math.round(height * 0.0625); y++) {
      const pxOffset = y * (width * 4 + 1) + 1 + x * 4;
      pixels[pxOffset] = 255;
      pixels[pxOffset + 1] = 255;
      pixels[pxOffset + 2] = 255;
      pixels[pxOffset + 3] = 255;
    }
  }
}

// Main execution
const iconSizes = [16, 48, 128];
const iconDir = path.join(__dirname);

for (const size of iconSizes) {
  console.log(`Generating icon${size}.png...`);
  
  const png = createPNG(size, size, (pixels, w, h) => {
    drawGradientIcon(pixels, w, h);
    drawWhiteArrow(pixels, w, h);
  });
  
  fs.writeFileSync(path.join(iconDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
}

console.log('\nAll icons generated successfully!');