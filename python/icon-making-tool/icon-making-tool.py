import sys
import os
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QFileDialog, QCheckBox, QLineEdit, QGroupBox, 
    QMessageBox, QGridLayout, QFrame, QSpacerItem, QSizePolicy
)
from PySide6.QtCore import Qt, QRectF
from PySide6.QtGui import QImage, QPainter, QPixmap, QFont
from PySide6.QtSvg import QSvgRenderer

# 言語辞書 (UIの全テキストを定義)
TRANSLATIONS = {
    'ja': {
        'window_title': "Icon Converter - SVG/PNG/JPG to PNG",
        'drop_zone_default': "ここに画像ファイル (SVG / PNG / JPG) を\nドラッグ＆ドロップ",
        'drop_zone_selected': "選択完了:\n{}",
        'btn_select': "ファイルを選択",
        'lbl_no_file': "ファイルが選択されていません",
        'group_presets': "頻出サイズプリセット (px) - 一括出力可能",
        'group_custom': "任意の希望サイズ (px)",
        'lbl_custom': "サイズ (カンマ区切りで複数可):",
        'placeholder_custom': "例: 24, 72",
        'btn_convert': "PNGに変換して保存",
        'err_title': "エラー",
        'err_unsupported': "対応していないファイル形式です。",
        'err_no_file': "ファイルを選択するかドラッグ＆ドロップしてください。",
        'err_no_size': "出力するサイズを少なくとも1つ指定してください。",
        'err_convert': "変換中にエラーが発生しました:\n{}",
        'info_title': "完了",
        'info_success': "{}個のPNG画像を元ファイルと同じフォルダに保存しました！\n({})",
        'file_dialog_title': "画像ファイルを選択",
        'btn_lang': "English" # ボタンに表示するテキスト（逆の言語）
    },
    'en': {
        'window_title': "Icon Converter - SVG/PNG/JPG to PNG",
        'drop_zone_default': "Drag & Drop image file here\n(SVG / PNG / JPG)",
        'drop_zone_selected': "Selected:\n{}",
        'btn_select': "Select File",
        'lbl_no_file': "No file selected",
        'group_presets': "Common Size Presets (px) - Batch Export",
        'group_custom': "Custom Sizes (px)",
        'lbl_custom': "Sizes (comma-separated):",
        'placeholder_custom': "e.g., 24, 72",
        'btn_convert': "Convert & Save as PNG",
        'err_title': "Error",
        'err_unsupported': "Unsupported file format.",
        'err_no_file': "Please select or drag & drop a file.",
        'err_no_size': "Please specify at least one size to output.",
        'err_convert': "An error occurred during conversion:\n{}",
        'info_title': "Success",
        'info_success': "Saved {} PNG images in the original folder!\n({})",
        'file_dialog_title': "Select Image File",
        'btn_lang': "日本語" # ボタンに表示するテキスト（逆の言語）
    }
}

class DropZone(QFrame):
    """ドラッグ＆ドロップを受け付けるエリア"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.parent_app = parent
        self.setAcceptDrops(True)
        self.setStyleSheet("""
            QFrame {
                border: 2px dashed #aaa;
                border-radius: 8px;
                background-color: #f9f9f9;
            }
        """)
        layout = QVBoxLayout()
        self.label = QLabel("")
        self.label.setAlignment(Qt.AlignCenter)
        self.label.setFont(QFont("Arial", 12))
        self.label.setStyleSheet("border: none; background: transparent; color: #555;")
        layout.addWidget(self.label)
        self.setLayout(layout)
        self.setMinimumHeight(120)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.setStyleSheet("""
                QFrame {
                    border: 2px dashed #4CAF50;
                    border-radius: 8px;
                    background-color: #e8f5e9;
                }
            """)

    def dragLeaveEvent(self, event):
        self.setStyleSheet("""
            QFrame {
                border: 2px dashed #aaa;
                border-radius: 8px;
                background-color: #f9f9f9;
            }
        """)

    def dropEvent(self, event):
        self.dragLeaveEvent(event)
        urls = event.mimeData().urls()
        if urls:
            file_path = urls[0].toLocalFile()
            if file_path.lower().endswith(('.svg', '.png', '.jpg', '.jpeg')):
                self.parent_app.load_file(file_path)
            else:
                lang = self.parent_app.current_lang
                t = TRANSLATIONS[lang]
                QMessageBox.warning(self, t['err_title'], t['err_unsupported'])


class IconConverter(QMainWindow):
    def __init__(self):
        super().__init__()
        self.current_lang = 'ja' # 初期言語
        self.file_path = None
        self.resize(450, 520)
        self.init_ui()
        self.update_ui_text() # 初期言語のテキストを適用

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(15)

        # 0. 言語切り替えボタン (右上に配置)
        lang_layout = QHBoxLayout()
        lang_layout.addSpacerItem(QSpacerItem(40, 20, QSizePolicy.Expanding, QSizePolicy.Minimum))
        self.btn_lang = QPushButton("")
        self.btn_lang.setFixedWidth(80)
        self.btn_lang.setStyleSheet("padding: 5px; font-weight: bold; border-radius: 4px;")
        self.btn_lang.clicked.connect(self.toggle_lang)
        lang_layout.addWidget(self.btn_lang)
        main_layout.addLayout(lang_layout)

        # 1. ドラッグ＆ドロップ領域
        self.drop_zone = DropZone(self)
        main_layout.addWidget(self.drop_zone)

        # 2. ファイル選択ボタンとパス表示
        file_layout = QHBoxLayout()
        self.btn_select = QPushButton("")
        self.btn_select.clicked.connect(self.open_file_dialog)
        self.lbl_file_path = QLabel("")
        self.lbl_file_path.setStyleSheet("color: #666;")
        file_layout.addWidget(self.btn_select)
        file_layout.addWidget(self.lbl_file_path, 1)
        main_layout.addLayout(file_layout)

        # 3. 頻出サイズのプリセット (複数選択可)
        self.group_presets = QGroupBox("")
        preset_layout = QGridLayout()
        self.preset_checkboxes = {}
        
        # 頻出サイズ
        presets = [16, 32, 48, 64, 128, 192, 256, 512, 1024]
        
        for i, size in enumerate(presets):
            cb = QCheckBox(f"{size}x{size}")
            if size in [16, 48, 128]:
                cb.setChecked(True)
            self.preset_checkboxes[size] = cb
            row, col = divmod(i, 3)
            preset_layout.addWidget(cb, row, col)
            
        self.group_presets.setLayout(preset_layout)
        main_layout.addWidget(self.group_presets)

        # 4. カスタムサイズ指定
        self.group_custom = QGroupBox("")
        custom_layout = QHBoxLayout()
        self.lbl_custom = QLabel("")
        self.txt_custom = QLineEdit()
        custom_layout.addWidget(self.lbl_custom)
        custom_layout.addWidget(self.txt_custom)
        self.group_custom.setLayout(custom_layout)
        main_layout.addWidget(self.group_custom)

        # 5. 変換・保存ボタン
        self.btn_convert = QPushButton("")
        self.btn_convert.setMinimumHeight(50)
        self.btn_convert.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                font-size: 15px;
                font-weight: bold;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
        """)
        self.btn_convert.clicked.connect(self.convert)
        main_layout.addWidget(self.btn_convert)

    def toggle_lang(self):
        # 言語を切り替えてテキストを更新
        self.current_lang = 'en' if self.current_lang == 'ja' else 'ja'
        self.update_ui_text()

    def update_ui_text(self):
        """現在の言語設定に合わせてUIのすべてのテキストを更新する"""
        t = TRANSLATIONS[self.current_lang]
        
        self.setWindowTitle(t['window_title'])
        self.btn_lang.setText(t['btn_lang'])
        
        if self.file_path:
            filename = os.path.basename(self.file_path)
            self.drop_zone.label.setText(t['drop_zone_selected'].format(filename))
            self.lbl_file_path.setText(filename)
        else:
            self.drop_zone.label.setText(t['drop_zone_default'])
            self.lbl_file_path.setText(t['lbl_no_file'])
            
        self.btn_select.setText(t['btn_select'])
        self.group_presets.setTitle(t['group_presets'])
        self.group_custom.setTitle(t['group_custom'])
        self.lbl_custom.setText(t['lbl_custom'])
        self.txt_custom.setPlaceholderText(t['placeholder_custom'])
        self.btn_convert.setText(t['btn_convert'])

    def open_file_dialog(self):
        t = TRANSLATIONS[self.current_lang]
        file_path, _ = QFileDialog.getOpenFileName(
            self, t['file_dialog_title'], "", "Image Files (*.svg *.png *.jpg *.jpeg)"
        )
        if file_path:
            self.load_file(file_path)

    def load_file(self, file_path):
        self.file_path = file_path
        filename = os.path.basename(file_path)
        self.lbl_file_path.setText(filename)
        t = TRANSLATIONS[self.current_lang]
        self.drop_zone.label.setText(t['drop_zone_selected'].format(filename))

    def get_selected_sizes(self):
        sizes = set()
        for size, cb in self.preset_checkboxes.items():
            if cb.isChecked():
                sizes.add(size)
                
        custom_text = self.txt_custom.text()
        if custom_text.strip():
            for s in custom_text.split(','):
                s = s.strip()
                if s.isdigit():
                    sizes.add(int(s))
                    
        return sorted(list(sizes))

    def convert(self):
        t = TRANSLATIONS[self.current_lang]
        
        if not self.file_path:
            QMessageBox.warning(self, t['err_title'], t['err_no_file'])
            return
            
        sizes = self.get_selected_sizes()
        if not sizes:
            QMessageBox.warning(self, t['err_title'], t['err_no_size'])
            return
            
        base_dir = os.path.dirname(self.file_path)
        base_name, _ = os.path.splitext(os.path.basename(self.file_path))
        
        success_count = 0
        try:
            for size in sizes:
                out_path = os.path.join(base_dir, f"{base_name}_{size}.png")
                self.render_and_save(self.file_path, out_path, size)
                success_count += 1
            
            QMessageBox.information(self, t['info_title'], t['info_success'].format(success_count, base_dir))
        except Exception as e:
            QMessageBox.critical(self, t['err_title'], t['err_convert'].format(str(e)))

    def render_and_save(self, in_path, out_path, size):
        img = QImage(size, size, QImage.Format_ARGB32)
        img.fill(Qt.transparent)
        
        painter = QPainter(img)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        
        if in_path.lower().endswith('.svg'):
            renderer = QSvgRenderer(in_path)
            default_size = renderer.defaultSize()
            if default_size.width() == 0 or default_size.height() == 0:
                renderer.render(painter)
            else:
                aspect = default_size.width() / default_size.height()
                if aspect > 1.0:
                    w = size
                    h = size / aspect
                else:
                    h = size
                    w = size * aspect
                x = (size - w) / 2
                y = (size - h) / 2
                renderer.render(painter, QRectF(x, y, w, h))
        else:
            pixmap = QPixmap(in_path)
            scaled_pixmap = pixmap.scaled(
                size, size, Qt.KeepAspectRatio, Qt.SmoothTransformation
            )
            x = (size - scaled_pixmap.width()) / 2
            y = (size - scaled_pixmap.height()) / 2
            painter.drawPixmap(int(x), int(y), scaled_pixmap)
            
        painter.end()
        img.save(out_path, "PNG")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = IconConverter()
    window.show()
    sys.exit(app.exec())