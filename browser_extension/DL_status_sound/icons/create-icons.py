#!/usr/bin/env python3
"""PNG Icon Generator for Download Status Sound"""

import struct
import zlib
import math

def crc32(data):
    return zlib.crc32(data) & 0xFFFFFFFF

def create_chunk(chunk_type, data):
    chunk = chunk_type + data
    crc = crc32(chunk)
    return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)

def create_png(width, height, draw_func):
    # Create pixel buffer (RGBA)
    pixels = [0] * (width * height * 4)
    
    draw_func(pixels, width, height)
    
    # Filter bytes and raw pixel data
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter byte (none)
        for x in range(width):
            idx = (y * width + x) * 4
            raw.extend(pixels[idx:idx+4])
    
    # Compress
    compressed = zlib.compress(bytes(raw))
    
    # Build PNG
    signature = b'\x89PNG\r\n\x1a\n'
    
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = create_chunk(b'IHDR', ihdr_data)
    
    idat = create_chunk(b'IDAT', compressed)
    
    iend = create_chunk(b'IEND', b'')
    
    return signature + ihdr + idat + iend

def draw_icon(pixels, width, height):
    """Draw the download arrow icon with purple gradient"""
    radius = max(1, round(height * 0.156))
    cx = width / 2
    cy = height / 2
    
    # Pre-compute corner centers
    corners = [
        (radius - 0.5, radius - 0.5),           # top-left
        (width - radius - 0.5, radius - 0.5),   # top-right
        (radius - 0.5, height - radius - 0.5),  # bottom-left
        (width - radius - 0.5, height - radius - 0.5)  # bottom-right
    ]
    
    for y in range(height):
        for x in range(width):
            inside = False
            
            # Check corners first
            corner_dist = float('inf')
            for corner_x, corner_y in corners:
                dist = math.sqrt((x - corner_x)**2 + (y - corner_y)**2)
                if dist <= radius:
                    inside = True
                    break
            
            # Check main rect area
            if not inside:
                if (radius <= x < width - radius and 
                    radius <= y < height - radius):
                    inside = True
            
            if not inside:
                continue
            
            # Purple gradient (#667eea to #764ba2)
            t = math.sqrt(
                ((x - cx)**2 + (y - cy)**2) / 
                ((width/2)**2 + (height/2)**2)
            )
            
            r = int(102 + (118 - 102) * t)
            g = int(126 + (75 - 126) * t)
            b = int(234 + (162 - 234) * t)
            
            idx = (y * width + x) * 4
            pixels[idx] = r
            pixels[idx+1] = g
            pixels[idx+2] = b
            pixels[idx+3] = 255

def draw_arrow(pixels, width, height):
    """Draw white download arrow on top of gradient"""
    c = round(width / 2)
    
    # Arrow dimensions (proportional to icon size)
    arrow_top = round(height * 0.195)
    arrow_mid = round(height * 0.445)
    arrow_bot = round(height * 0.703)
    
    for y in range(arrow_top, arrow_bot + 1):
        # Calculate half-width at this y position
        if y < arrow_mid:
            # Upper part (wider - arrow head)
            progress = (y - arrow_top) / (arrow_mid - arrow_top)
            half_w = round(width * 0.19 * (0.5 + progress * 0.5))
        else:
            # Lower part (shaft - narrower)
            half_w = round(width * 0.08)
        
        for x in range(c - half_w, c + half_w + 1):
            if 0 <= x < width:
                idx = (y * width + x) * 4
                pixels[idx] = 255     # R
                pixels[idx+1] = 255   # G
                pixels[idx+2] = 255   # B
                pixels[idx+3] = 255   # A
    
    # Bottom line
    line_y = round(height * 0.789)
    line_x = round(width * 0.25)
    line_w = round(width * 0.5)
    line_h = max(1, round(height * 0.0625))
    
    for y in range(line_y, line_y + line_h):
        for x in range(line_x, line_x + line_w):
            if 0 <= x < width and 0 <= y < height:
                idx = (y * width + x) * 4
                pixels[idx] = 255
                pixels[idx+1] = 255
                pixels[idx+2] = 255
                pixels[idx+3] = 255

# Generate icons for all sizes
for size in [16, 48, 128]:
    print(f"Generating icon{size}.png...")
    
    # Create combined draw function
    def make_draw_func():
        pixels = [0] * (size * size * 4)
        
        # Draw gradient background
        for y in range(size):
            for x in range(size):
                inside = False
                radius = max(1, round(size * 0.156))
                corners = [
                    (radius - 0.5, radius - 0.5),
                    (size - radius - 0.5, radius - 0.5),
                    (radius - 0.5, size - radius - 0.5),
                    (size - radius - 0.5, size - radius - 0.5)
                ]
                
                for corner_x, corner_y in corners:
                    dist = math.sqrt((x - corner_x)**2 + (y - corner_y)**2)
                    if dist <= radius:
                        inside = True
                        break
                
                if not inside and not (radius <= x < size - radius and radius <= y < size - radius):
                    continue
                
                cx = size / 2
                cy = size / 2
                t = math.sqrt(((x-cx)**2 + (y-cy)**2) / ((size/2)**2 + (size/2)**2))
                
                idx = (y * size + x) * 4
                pixels[idx] = int(102 + (118-102)*t)
                pixels[idx+1] = int(126 + (75-126)*t)
                pixels[idx+2] = int(234 + (162-234)*t)
                pixels[idx+3] = 255
        
        # Draw arrow
        c = round(size / 2)
        arrow_top = round(size * 0.195)
        arrow_mid = round(size * 0.445)
        arrow_bot = round(size * 0.703)
        
        for y in range(arrow_top, arrow_bot + 1):
            if y < arrow_mid:
                progress = (y - arrow_top) / (arrow_mid - arrow_top)
                half_w = round(size * 0.19 * (0.5 + progress * 0.5))
            else:
                half_w = round(size * 0.08)
            
            for x in range(c - half_w, c + half_w + 1):
                if 0 <= x < size:
                    idx = (y * size + x) * 4
                    pixels[idx] = 255
                    pixels[idx+1] = 255
                    pixels[idx+2] = 255
                    pixels[idx+3] = 255
        
        # Bottom line
        line_y = round(size * 0.789)
        line_x = round(size * 0.25)
        line_w = round(size * 0.5)
        line_h = max(1, round(size * 0.0625))
        
        for y in range(line_y, line_y + line_h):
            for x in range(line_x, line_x + line_w):
                if 0 <= x < size and 0 <= y < size:
                    idx = (y * size + x) * 4
                    pixels[idx] = 255
                    pixels[idx+1] = 255
                    pixels[idx+2] = 255
                    pixels[idx+3] = 255
        
        return bytes(pixels)
    
    pixel_data = make_draw_func()
    
    # Create raw data with filter bytes
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            idx = (y * size + x) * 4
            raw.extend(pixel_data[idx:idx+4])
    
    compressed = zlib.compress(bytes(raw))
    
    # Build PNG
    signature = b'\x89PNG\r\n\x1a\n'
    
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    chunk_type = b'IHDR'
    chunk = chunk_type + ihdr_data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    ihdr = struct.pack('>I', len(ihdr_data)) + chunk + struct.pack('>I', crc)
    
    chunk_type = b'IDAT'
    chunk = chunk_type + compressed
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    idat = struct.pack('>I', len(compressed)) + chunk + struct.pack('>I', crc)
    
    chunk_type = b'IEND'
    chunk = chunk_type + b''
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    iend = struct.pack('>I', 0) + chunk + struct.pack('>I', crc)
    
    png_data = signature + ihdr + idat + iend
    
    with open(f'icon{size}.png', 'wb') as f:
        f.write(png_data)
    
    print(f"Created icon{size}.png ({len(png_data)} bytes)")

print("\nAll icons generated successfully!")