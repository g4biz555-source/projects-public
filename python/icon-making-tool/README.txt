# 🎨 Easy Icon Converter

A GUI tool that generates multiple sizes of PNG icons at once, which is essential for developing Chrome/Firefox browser extensions, desktop applications, and mobile apps. 

I created this tool to save developers the hassle of repeatedly resizing and downloading images from web-based conversion sites. When converting from SVG files, it renders directly from vector data, ensuring ultra-crisp output without any blurriness or quality loss, regardless of the target size.

![Screenshot](screenshot.png) <!-- Insert the path or URL of your actual screenshot here -->

## ✨ Features

- 📥 **Drag & Drop Support**: Intuitively load SVG, PNG, or JPG files.
- 💎 **Lossless SVG Rendering**: Utilizes `PySide6`'s SVG engine to draw vectors directly to the specified pixel sizes, resulting in zero quality degradation.
- ⚡ **Batch Export**: Output multiple required sizes (e.g., `16`, `48`, `128`px for browser extensions) simultaneously with a single click.
- 📏 **Custom Size Input**: Easily add specific sizes not found in the presets by entering them as comma-separated values (e.g., `24, 72`).
- 🖼️ **Auto Aspect Ratio & Transparent Padding**: Even if the original image isn't a perfect square, the tool centers the image without distortion and automatically pads the margins with transparency.
- 📂 **Auto-Renaming**: Automatically saves the generated PNGs in the same directory as the original file with formatted names like `icon_16.png`, `icon_128.png`.

## 🛠 Requirements

- Python 3.7 or higher
- PySide6

## 🚀 Installation

1. Clone or download the repository.
```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name

## 💡 How to Use
- Drag and drop the image file (.svg, .png, .jpg) you want to convert into the dashed area of the application window.
- Check the preset sizes you want to output.
- Note: Sizes frequently used in Chrome extensions, such as 16, 48, and 128, are checked by default.
- If you need a specific size not in the presets, enter it in the text box at the bottom (e.g., 24, 64).
-  Click the "Convert and Save as PNG" button.
- Transparent PNG images of all selected sizes will be generated instantly in the same folder as the original image!

![You can convert easily. ](screenshot.png)

##📄 License
This project is licensed under the MIT License - see the LICENSE file for details.