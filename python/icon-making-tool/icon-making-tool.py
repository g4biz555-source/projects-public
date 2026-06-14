import sys
import os
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QFileDialog, QCheckBox, QLineEdit, QGroupBox, 
    QMessageBox, QGridLayout, QFrame
)
from PySide6.QtCore import Qt, QRectF
from PySide6.QtGui import QImage, QPainter, QPixmap, QFont
from PySide6.QtSvg import QSvgRenderer

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
        self.label = QLabel("ここに画像ファイル (SVG / PNG / JPG) を\nドラッグ＆ドロップ")
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
                QMessageBox.warning(self, "エラー", "対応していないファイル形式です。")


class IconConverter(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Icon Converter - SVG/PNG/JPG to PNG")
        self.resize(450, 480)
        self.file_path = None
        self.init_ui()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(15)

        # 1. ドラッグ＆ドロップ領域
        self.drop_zone = DropZone(self)
        main_layout.addWidget(self.drop_zone)

        # 2. ファイル選択ボタンとパス表示
        file_layout = QHBoxLayout()
        self.btn_select = QPushButton("ファイルを選択")
        self.btn_select.clicked.connect(self.open_file_dialog)
        self.lbl_file_path = QLabel("ファイルが選択されていません")
        self.lbl_file_path.setStyleSheet("color: #666;")
        file_layout.addWidget(self.btn_select)
        file_layout.addWidget(self.lbl_file_path, 1)
        main_layout.addLayout(file_layout)

        # 3. 頻出サイズのプリセット (複数選択可)
        group_presets = QGroupBox("頻出サイズプリセット (px) - 一括出力可能")
        preset_layout = QGridLayout()
        self.preset_checkboxes = {}
        
        # Chrome拡張, Firefox拡張, アプリアイコンでよく使うサイズ
        presets = [16, 32, 48, 64, 128, 192, 256, 512, 1024]
        
        for i, size in enumerate(presets):
            cb = QCheckBox(f"{size}x{size}")
            # Chrome拡張で必須なサイズにデフォルトでチェック
            if size in [16, 48, 128]:
                cb.setChecked(True)
            self.preset_checkboxes[size] = cb
            row, col = divmod(i, 3)
            preset_layout.addWidget(cb, row, col)
            
        group_presets.setLayout(preset_layout)
        main_layout.addWidget(group_presets)

        # 4. カスタムサイズ指定
        group_custom = QGroupBox("任意の希望サイズ (px)")
        custom_layout = QHBoxLayout()
        lbl_custom = QLabel("サイズ (カンマ区切りで複数可):")
        self.txt_custom = QLineEdit()
        self.txt_custom.setPlaceholderText("例: 24, 72")
        custom_layout.addWidget(lbl_custom)
        custom_layout.addWidget(self.txt_custom)
        group_custom.setLayout(custom_layout)
        main_layout.addWidget(group_custom)

        # 5. 変換・保存ボタン
        self.btn_convert = QPushButton("PNGに変換して保存")
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

    def open_file_dialog(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "画像ファイルを選択", "", "Image Files (*.svg *.png *.jpg *.jpeg)"
        )
        if file_path:
            self.load_file(file_path)

    def load_file(self, file_path):
        self.file_path = file_path
        self.lbl_file_path.setText(os.path.basename(file_path))
        self.drop_zone.label.setText(f"選択完了:\n{os.path.basename(file_path)}")

    def get_selected_sizes(self):
        sizes = set()
        # プリセットから取得
        for size, cb in self.preset_checkboxes.items():
            if cb.isChecked():
                sizes.add(size)
                
        # カスタム入力から取得
        custom_text = self.txt_custom.text()
        if custom_text.strip():
            for s in custom_text.split(','):
                s = s.strip()
                if s.isdigit():
                    sizes.add(int(s))
                    
        return sorted(list(sizes))

    def convert(self):
        if not self.file_path:
            QMessageBox.warning(self, "エラー", "ファイルを選択するかドラッグ＆ドロップしてください。")
            return
            
        sizes = self.get_selected_sizes()
        if not sizes:
            QMessageBox.warning(self, "エラー", "出力するサイズを少なくとも1つ指定してください。")
            return
            
        base_dir = os.path.dirname(self.file_path)
        base_name, _ = os.path.splitext(os.path.basename(self.file_path))
        
        success_count = 0
        try:
            for size in sizes:
                out_path = os.path.join(base_dir, f"{base_name}_{size}.png")
                self.render_and_save(self.file_path, out_path, size)
                success_count += 1
            
            QMessageBox.information(self, "完了", f"{success_count}個のPNG画像を元ファイルと同じフォルダに保存しました！\n({base_dir})")
        except Exception as e:
            QMessageBox.critical(self, "エラー", f"変換中にエラーが発生しました:\n{str(e)}")

    def render_and_save(self, in_path, out_path, size):
        # 透過背景のキャンバス (正方形) を作成
        img = QImage(size, size, QImage.Format_ARGB32)
        img.fill(Qt.transparent)
        
        painter = QPainter(img)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        
        if in_path.lower().endswith('.svg'):
            # SVGの場合はベクターデータから直接指定サイズにレンダリング（ぼやけない）
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
            # PNG/JPGの場合は高品質縮小/拡大
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