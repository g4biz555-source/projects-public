import os
import time
import requests
import zipfile
import threading
import hashlib
import re
import shutil
import mimetypes
import random
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
from concurrent.futures import ThreadPoolExecutor, as_completed

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from PIL import Image

# ⑧ UAリスト
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0"
]

class UltimateImageScraper:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Scraper - Ultimate Perfection Edition")
        self.root.geometry("950x850")

        self.rate_lock = threading.Lock()
        self.hash_lock = threading.Lock()
        self.last_request_time = 0
        self.seen_hashes = set()
        
        # ③ Driverインストール (起動時1回のみ)
        print("[*] WebDriverを確認中...")
        try:
            self.driver_path = ChromeDriverManager().install()
        except Exception as e:
            print(f"[!] Driver取得失敗: {e}")
            self.driver_path = None

        self.url_var = tk.StringVar()
        self.selector_var = tk.StringVar(value="img")
        self.max_scroll_var = tk.IntVar(value=10)
        self.direction_var = tk.StringVar(value="vertical")
        self.min_width_var = tk.IntVar(value=300)
        self.min_height_var = tk.IntVar(value=300)
        self.min_bytes_var = tk.IntVar(value=5000)
        self.workers_var = tk.IntVar(value=5)
        self.interval_var = tk.DoubleVar(value=0.5)
        self.filename_var = tk.StringVar(value="final_collection.zip")
        self.check_robots_var = tk.BooleanVar(value=True)

        self.create_widgets()

    def create_widgets(self):
        p = {'padx': 10, 'pady': 5}
        tk.Label(self.root, text="対象URL:").pack(anchor="w", **p)
        tk.Entry(self.root, textvariable=self.url_var, width=110).pack(**p)
        
        f_mid = tk.LabelFrame(self.root, text="高度なプロフェッショナル設定")
        f_mid.pack(fill="x", **p)

        tk.Label(f_mid, text="CSSセレクタ:").grid(row=0, column=0, padx=5, pady=5)
        tk.Entry(f_mid, textvariable=self.selector_var, width=15).grid(row=0, column=1)
        tk.Label(f_mid, text="方向:").grid(row=0, column=2, padx=5)
        ttk.Combobox(f_mid, textvariable=self.direction_var, values=["vertical", "horizontal"], width=10).grid(row=0, column=3)
        tk.Label(f_mid, text="最大スクロール:").grid(row=0, column=4, padx=5)
        tk.Spinbox(f_mid, from_=0, to=1000, textvariable=self.max_scroll_var, width=5).grid(row=0, column=5)

        tk.Label(f_mid, text="最小解像度(px):").grid(row=1, column=0, padx=5, pady=5)
        f_res = tk.Frame(f_mid); f_res.grid(row=1, column=1, columnspan=2, sticky="w")
        tk.Entry(f_res, textvariable=self.min_width_var, width=5).pack(side="left")
        tk.Label(f_res, text=" x ").pack(side="left")
        tk.Entry(f_res, textvariable=self.min_height_var, width=5).pack(side="left")
        tk.Label(f_mid, text="最小サイズ(B):").grid(row=1, column=3, padx=5)
        tk.Entry(f_mid, textvariable=self.min_bytes_var, width=10).grid(row=1, column=4)

        tk.Label(f_mid, text="全体間隔(秒):").grid(row=2, column=0, padx=5, pady=5)
        tk.Entry(f_mid, textvariable=self.interval_var, width=5).grid(row=2, column=1)
        tk.Label(f_mid, text="並列数:").grid(row=2, column=2, padx=5)
        tk.Spinbox(f_mid, from_=1, to=32, textvariable=self.workers_var, width=5).grid(row=2, column=3)
        tk.Checkbutton(f_mid, text="robots.txt遵守", variable=self.check_robots_var).grid(row=2, column=4, columnspan=2)

        tk.Label(self.root, text="保存ZIP名:").pack(anchor="w", **p)
        tk.Entry(self.root, textvariable=self.filename_var, width=40).pack(**p)

        self.btn_run = tk.Button(self.root, text="🚀 スクレイピング実行", command=self.start_task, bg="#1B5E20", fg="white", font=("Arial", 11, "bold"))
        self.btn_run.pack(fill="x", padx=30, pady=10)
        self.progress = ttk.Progressbar(self.root, orient="horizontal", mode="determinate")
        self.progress.pack(fill="x", padx=30, pady=5)
        self.log_area = scrolledtext.ScrolledText(self.root, height=20, bg="#0D0D0D", fg="#00E676", font=("Consolas", 9))
        self.log_area.pack(fill="both", expand=True, **p)

    def log(self, msg):
        self.root.after(0, lambda: self._update_log(msg))

    def _update_log(self, msg):
        self.log_area.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {msg}\n")
        self.log_area.see(tk.END)

    def parse_srcset(self, srcset):
        if not srcset: return None
        candidates = []
        for part in srcset.split(','):
            pieces = part.strip().split()
            if not pieces: continue
            url = pieces[0]
            val = 0
            if len(pieces) > 1:
                size_str = pieces[1].lower()
                num_match = re.search(r'(\d+(\.\d+)?)', size_str)
                if num_match:
                    num = float(num_match.group(1))
                    val = num if 'w' in size_str else num * 1000
            candidates.append((url, val))
        return sorted(candidates, key=lambda x: x[1], reverse=True)[0][0] if candidates else None

    def start_task(self):
        self.btn_run.config(state="disabled")
        threading.Thread(target=self.main_process, daemon=True).start()

    def main_process(self):
        driver = None; save_dir = ""; session = None
        try:
            target_url = self.url_var.get()
            base_ua = random.choice(USER_AGENTS) # セッション固定UA
            
            # robots.txt 解析 (UAを合わせる)
            parsed_base = urlparse(target_url)
            rp = RobotFileParser()
            rp.set_url(f"{parsed_base.scheme}://{parsed_base.netloc}/robots.txt")
            try: rp.read()
            except: rp = None

            save_dir = "tmp_perfect_" + hashlib.md5(target_url.encode()).hexdigest()[:6]
            if not os.path.exists(save_dir): os.makedirs(save_dir)

            # Selenium UA を Requests と一致させる & 軽量化
            opts = Options()
            opts.add_argument("--headless=new")
            opts.add_argument(f"user-agent={base_ua}")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
            opts.add_argument("--disable-gpu")
            opts.add_argument("--blink-settings=imagesEnabled=false") # RAM削減
            opts.add_argument("--disable-blink-features=AutomationControlled")
            
            self.log("[*] ブラウザ起動中...")
            driver = webdriver.Chrome(service=Service(self.driver_path), options=opts)
            driver.get(target_url)

            # スクロール
            last_pos, same_count = 0, 0
            for i in range(self.max_scroll_var.get()):
                self.log(f"[*] スクロール中 ({i+1}/{self.max_scroll_var.get()})")
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);" if self.direction_var.get() == "vertical" else "window.scrollBy(1200, 0);")
                time.sleep(2.0)
                new_pos = driver.execute_script("return document.body.scrollHeight" if self.direction_var.get() == "vertical" else "return window.pageXOffset || document.documentElement.scrollLeft")
                if new_pos == last_pos:
                    same_count += 1
                    if same_count >= 3: break
                else: same_count = 0
                last_pos = new_pos

            # URL抽出
            elements = driver.find_elements(By.CSS_SELECTOR, self.selector_var.get())
            raw_urls = set()
            for el in elements:
                ss = el.get_attribute("srcset") or el.get_attribute("data-srcset")
                u = self.parse_srcset(ss) or el.get_attribute("src") or el.get_attribute("data-src")
                if u: raw_urls.add(urljoin(driver.current_url, u))
            
            self.log(f"[*] 解析完了: {len(raw_urls)}件。ブラウザ終了。")
            driver.quit(); driver = None

            # 並列ダウンロード準備
            sorted_urls = sorted(list(raw_urls))
            self.root.after(0, lambda: self.progress.config(maximum=len(sorted_urls), value=0))
            
            retry_strategy = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
            session = requests.Session()
            session.mount("http://", HTTPAdapter(max_retries=retry_strategy))
            session.mount("https://", HTTPAdapter(max_retries=retry_strategy))

            downloaded_files = []

            def download_task(idx, url):
                # グローバルレート制限 (Lock)
                with self.rate_lock:
                    now = time.time(); wait = self.interval_var.get() - (now - self.last_request_time)
                    if wait > 0: time.sleep(wait)
                    self.last_request_time = time.time()

                # robots.txt (UAを合わせる)
                if self.check_robots_var.get() and rp and not rp.can_fetch(base_ua, url): return None

                try:
                    headers = {"User-Agent": random.choice(USER_AGENTS)}
                    temp_path = os.path.join(save_dir, f"dl_{idx}.tmp")
                    hasher = hashlib.md5()
                    
                    with session.get(url, stream=True, timeout=(10, 60), headers=headers) as r:
                        if r.status_code != 200: return None
                        cl = r.headers.get("Content-Length")
                        if cl and int(cl) < self.min_bytes_var.get(): return None
                        
                        ctype = r.headers.get("Content-Type", "").split(';')[0].lower()
                        ext = mimetypes.guess_extension(ctype)
                        ext = ext.replace(".", "") if ext else "jpg"
                        if ext == "jpe": ext = "jpg"

                        with open(temp_path, "wb") as f:
                            for chunk in r.iter_content(8192):
                                if chunk: f.write(chunk); hasher.update(chunk)
                    
                    # ハッシュ重複排除 & メモリ管理
                    img_hash = hasher.hexdigest()
                    with self.hash_lock:
                        if len(self.seen_hashes) > 50000: self.seen_hashes.clear()
                        if img_hash in self.seen_hashes:
                            if os.path.exists(temp_path): os.remove(temp_path)
                            return None
                        self.seen_hashes.add(img_hash)

                    # 画像品質チェック
                    try:
                        with Image.open(temp_path) as img: img.verify()
                        with Image.open(temp_path) as img:
                            w, h = img.size
                            if w < self.min_width_var.get() or h < self.min_height_var.get():
                                os.remove(temp_path); return None
                        if os.path.getsize(temp_path) < self.min_bytes_var.get():
                            os.remove(temp_path); return None
                    except:
                        if os.path.exists(temp_path): os.remove(temp_path)
                        return None

                    final_path = os.path.join(save_dir, f"img_{idx:04d}_{w}x{h}.{ext}")
                    # Windowsファイルロック/リネームエラー対策
                    try: os.rename(temp_path, final_path)
                    except: shutil.move(temp_path, final_path)
                    return final_path

                except Exception as e:
                    self.log(f"[DL Error] {url[:50]}... : {e}")
                    return None

            with ThreadPoolExecutor(max_workers=self.workers_var.get()) as executor:
                futures = [executor.submit(download_task, i, u) for i, u in enumerate(sorted_urls)]
                # ThreadPool内例外の確実なキャッチ (謎停止防止)
                for i, f in enumerate(as_completed(futures)):
                    try:
                        res = f.result()
                        if res: downloaded_files.append(res)
                    except Exception as e:
                        self.log(f"[Future Error] {e}")
                    
                    self.root.after(0, lambda v=i+1: self.progress.config(value=v))

            # ZIP格納 (ソート済み)
            out_zip = self.filename_var.get()
            self.log(f"[*] ZIPアーカイブ作成中...")
            with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for f in sorted(downloaded_files):
                    z.write(f, os.path.basename(f))
            
            self.log(f"【完了】 合計 {len(downloaded_files)}枚を保存しました。")
            messagebox.showinfo("成功", f"ZIP作成完了: {len(downloaded_files)}枚")

        except Exception as e:
            self.log(f"[Fatal] {e}")
            messagebox.showerror("Error", str(e))
        finally:
            if driver:
                try: driver.quit()
                except: pass
            # セッションの確実なクローズ
            if session:
                try: session.close()
                except: pass
            if save_dir and os.path.exists(save_dir):
                shutil.rmtree(save_dir, ignore_errors=True)
            self.btn_run.config(state="normal")

if __name__ == "__main__":
    root = tk.Tk(); app = UltimateImageScraper(root); root.mainloop()