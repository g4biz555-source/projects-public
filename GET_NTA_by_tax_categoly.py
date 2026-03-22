import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser
import os
import time
import re
import io
import hashlib
import pdfplumber
import unicodedata
from markdownify import markdownify as md
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes
from collections import deque

# =========================
# 1. 基本設定
# =========================
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
OUTPUT_DIR = "tax_db_comprehensive_final"
os.makedirs(OUTPUT_DIR, exist_ok=True)

MAX_CHARS_PER_FILE = 500000 
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TaxCrawler/3.0)"}
REQUEST_DELAY = 1.5 
MAX_DEPTH = 3 
MAX_PDF_MB = 100 

# 改正・履歴系キーワード
REVISION_KEYWORDS = ["改正通達", "改正履歴", "新旧対照表", "沿革", "改正案", "一部改正", "履歴"]
REVISION_PATH_PART = ["/kaisei/", "reki.htm", "shinkyu"]

session = requests.Session()
retries = Retry(total=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
session.mount("https://", HTTPAdapter(max_retries=retries))

# 各種キャッシュ・重複チェック
# downloaded_hashes = set() # 指摘に基づきここから削除
image_ocr_cache = {}      
robots_cache = {}

# =========================
# 2. 補助ロジック
# =========================
def normalize_url(url):
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))

def can_fetch(url):
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    if base_url not in robots_cache:
        rp = RobotFileParser()
        try:
            resp = session.get(base_url, timeout=10)
            rp.parse(resp.text.splitlines())
            robots_cache[base_url] = rp
        except: return True 
    return robots_cache[base_url].can_fetch(HEADERS["User-Agent"], url)

def normalize_text(text):
    if not text: return ""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n\n', text)
    return text.strip()

def is_revision(url, text=""):
    """改正通達（ノイズ）かどうかを判定"""
    url_lower = url.lower()
    text_norm = normalize_text(text)
    if any(p in url_lower for p in REVISION_PATH_PART): return True
    if any(k in text_norm for k in REVISION_KEYWORDS): return True
    return False

def extract_pdf_content(content, url):
    if len(content) > MAX_PDF_MB * 1024 * 1024:
        return f"\n> [PDF原本URL]: {url}\n> 【注意】巨大PDFのため解析スキップ。\n"

    text = f"\n> [PDF原本URL]: {url}\n"
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text: text += page_text + "\n"
        
        if len(text.strip()) < 300: # スキャンPDF対策
            images = convert_from_bytes(content)
            ocr_result = ""
            for img in images:
                ocr_result += pytesseract.image_to_string(img, lang='jpn+jpn_vert')
            text += "\n[OCR結果]\n" + ocr_result
    except Exception as e:
        text += f"\n[PDF解析エラー]: {e}\n"
    return text

# =========================
# 3. 出力管理クラス
# =========================
class NotebookLMPacker:
    def __init__(self, category_id, category_label):
        self.category_id = category_id
        self.category_label = category_label
        self.file_index = 1
        self.buffer = f"# {category_label} データベース\n\n"
        self.manifest_path = os.path.join(OUTPUT_DIR, f"{category_id}_url_index.txt")

    def add(self, url, title, content, source_desc):
        content = normalize_text(content)
        full_title = f"{self.category_label} > {source_desc} > {title}"
        entry = f"\n\n## {full_title}\n- URL: {url}\n\n{content}\n\n---\n"
        
        if len(self.buffer) + len(entry) > MAX_CHARS_PER_FILE:
            self.save()
        self.buffer += entry

        with open(self.manifest_path, "a", encoding="utf-8") as f:
            f.write(f"{self.category_id}_{self.file_index:02d}.md\t{url}\t{title}\n")

    def save(self):
        if len(self.buffer) < 100: return
        filename = f"{self.category_id}_{self.file_index:02d}.md"
        path = os.path.join(OUTPUT_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.buffer)
        print(f"   [保存] {filename}")
        self.file_index += 1
        self.buffer = f"# {self.category_label} データベース (続き)\n\n"

    def finalize(self): self.save()

# =========================
# 4. クローリング本体（全機能統合版）
# =========================
def crawl_category(cat_id, cat_label, target_list):
    print(f"\n🚀 カテゴリ開始: {cat_label}")
    packer = NotebookLMPacker(cat_id, cat_label)
    visited_urls = set()
    downloaded_hashes = set() # 指摘反映：カテゴリごとにリセットされるようここに移動

    for start_url, source_desc in target_list:
        queue = deque([(normalize_url(start_url), 0)])
        
        while queue:
            url, depth = queue.popleft()
            if url in visited_urls or depth > MAX_DEPTH: continue
            if not can_fetch(url): continue
            visited_urls.add(url)
            
            try:
                time.sleep(REQUEST_DELAY)
                res = session.get(url, headers=HEADERS, timeout=30)
                if res.status_code != 200: continue
                
                content_hash = hashlib.sha256(res.content).hexdigest()
                if content_hash in downloaded_hashes: continue
                downloaded_hashes.add(content_hash)

                # PDF処理
                if url.lower().endswith(".pdf") or "pdf" in res.headers.get("Content-Type", "").lower():
                    # 改正通達PDFは中身を読み取らずリンクのみ保存（当初の要望）
                    if is_revision(url, source_desc):
                        print(f"   [ADD Link] {url}") # 指摘反映：診断ログ
                        packer.add(url, f"改正通達(リンクのみ): {os.path.basename(url)}", f"改正履歴のため内容取得をスキップ。リンク: {url}", source_desc)
                    else:
                        content = extract_pdf_content(res.content, url)
                        print(f"   [ADD PDF] {url}") # 指摘反映：診断ログ
                        packer.add(url, f"通達本文(PDF): {os.path.basename(url)}", content, source_desc)
                    continue

                # HTML処理
                soup = BeautifulSoup(res.content, "lxml")
                
                # 画像のOCR（キャッシュ・縦書き対応）
                for img in soup.find_all("img"):
                    img_src = img.get("src")
                    if not img_src: continue
                    img_url = normalize_url(urljoin(url, img_src))
                    try:
                        img_res = session.get(img_url, headers=HEADERS, timeout=10)
                        if img_res.status_code == 200:
                            img_hash = hashlib.md5(img_res.content).hexdigest()
                            if img_hash in image_ocr_cache:
                                ocr_txt = image_ocr_cache[img_hash]
                            else:
                                ocr_txt = pytesseract.image_to_string(Image.open(io.BytesIO(img_res.content)), lang='jpn+jpn_vert')
                                image_ocr_cache[img_hash] = ocr_txt
                            img.replace_with(f"\n\n> [画像URL]: {img_url}\n> [画像OCR]: {ocr_txt}\n\n")
                    except: pass

                for s in soup(["script", "style", "nav", "footer", "header"]): s.decompose()
                main = soup.find("main") or soup.find("div", id="contents") or soup.body
                if not main: continue

                title = normalize_text(soup.title.string) if soup.title else url
                content_md = md(str(main), heading_style="ATX")
                
                if len(content_md.strip()) > 50:
                    print(f"   [ADD Content] {url}") # 指摘反映：診断ログ
                    packer.add(url, title, content_md, source_desc)

                # リンク抽出と「改正フィルタリング」
                for a in main.find_all("a", href=True):
                    link_url = normalize_url(urljoin(url, a['href']))
                    link_text = a.get_text()
                    
                    if "nta.go.jp" in link_url and "/law/tsutatsu/" in link_url:
                        # 【重要】改正通達リンクの場合
                        if is_revision(link_url, link_text):
                            # 本体には取り込まないが「リンクがあること」だけ記録してキューには入れない
                            print(f"   [ADD Revision Link] {link_url}") # 指摘反映：診断ログ
                            packer.add(link_url, f"改正通達参照リンク: {normalize_text(link_text)}", f"改正履歴につき内容省略。URL: {link_url}", source_desc)
                            continue
                        
                        if link_url not in visited_urls:
                            queue.append((link_url, depth + 1))
                            
            except Exception as e:
                print(f"   [Error] {url}: {e}")
                
    packer.finalize()

# =========================
# 5. 実行ターゲット（全27URLを完全網羅）
# =========================
target_groups = {
    "01_Shotoku": ("所得税", [
        ("https://www.nta.go.jp/law/tsutatsu/kihon/shotoku/01.htm", "所得税基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/shinkoku/sinkoku.htm", "申告所得税個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/gensen/gensen.htm", "源泉所得税個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/joto-sanrin/sanrin.htm", "譲渡所得・山林所得個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/sochiho/sotihou.htm", "所得税措置法通達"),
    ]),
    "02_Sisan": ("相続・資産税", [
        ("https://www.nta.go.jp/law/tsutatsu/kihon/sisan/sozoku2/01.htm", "相続税法基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kihon/sisan/hyoka_new/01.htm", "相続税財産評価"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/sozoku/souzoku.htm", "相続税関係個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/hyoka/zaisan.htm", "財産評価関係個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/sozoku/sochiho/sotihou.htm", "相続・贈与税措置法通達"),
    ]),
    "03_Hojin": ("法人税", [
        ("https://www.nta.go.jp/law/tsutatsu/kihon/hojin/01.htm", "法人税法基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kihon/renketsu/01.htm", "連結納税基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/hojin/houzin.htm", "法人税個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/hojin/sochiho/sotihou.htm", "法人税措置法通達"),
    ]),
    "04_Shohi": ("消費税", [
        ("https://www.nta.go.jp/law/tsutatsu/kihon/shohi/01.htm", "消費税法基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/syouhi.htm", "消費税個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/sochiho/sotihou.htm", "消費税措置法通達"),
    ]),
    "05_Inshi_Choshu": ("印紙税・徴収・不服", [
        ("https://www.nta.go.jp/law/tsutatsu/kihon/inshi/mokuji.htm", "印紙税法基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kihon/igi/01.htm", "不服審査基本通達（国税庁）"),
        ("https://www.nta.go.jp/law/tsutatsu/kihon/shinsaseikyu/00.htm", "不服審査（不服審判所）"),
    ]),
    "06_Sonota": ("その他", [
        ("https://www.nta.go.jp/law/tsutatsu/kihon/zeirishi/01.htm", "税理士法基本通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/zeimuchosa/zeimuchosa.htm", "税務調査等個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/hotei/shiryo.htm", "法定資料個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/zeirishi/zeirishi2.htm", "税理士関係個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/denshichoubo/index.htm", "電子帳簿保存法個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/sonota/sonota.htm", "雑則個別通達"),
        ("https://www.nta.go.jp/law/tsutatsu/kobetsu/sonota/sochiho/sotihou.htm", "その他措置法通達"),
    ])
}

if __name__ == "__main__":
    start_time = time.time()
    for cat_id, (cat_label, targets) in target_groups.items():
        crawl_category(cat_id, cat_label, targets)
    print(f"\n✅ 完了！ 実行時間: {round((time.time() - start_time) / 60, 1)} 分")