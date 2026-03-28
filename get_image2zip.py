import os
import time
import httpx
import zipfile
import threading
import hashlib
import re
import random
import uuid
import collections
import json
import psutil
import gc
import io
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from urllib.parse import urljoin, urlparse, parse_qs, urlencode
from urllib.robotparser import RobotFileParser
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
from PIL import Image, ImageFile

# 安定稼働用設定
Image.MAX_IMAGE_PIXELS = 50_000_000
ImageFile.LOAD_TRUNCATED_IMAGES = True

BOT_NAME = "IndustrialApexBot/17.0"
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

NEXT_XPATHS = ["//a[contains(text(),'次')]", "//a[contains(text(),'Next')]", "//a[@rel='next']", "//a[contains(@class,'next')]"]
ROBOTS_CACHE_FILE = "robots_cache.json"

class IndustrialApexScraper:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Scraper - Industrial Apex v17 (High-Efficiency Engine)")
        self.root.geometry("950x920")

        # --- 同期・管理オブジェクト ---
        self.hash_lock = threading.Lock()
        self.robots_lock = threading.Lock()
        self.zip_lock = threading.Lock()
        self.thread_local = threading.local()
        self.thread_clients = []
        
        # ⑤ 改善：同時HTTP接続数を制御するセマフォ（並列数の半分程度が理想）
        self.net_semaphore = None 
        
        self.seen_hashes = set()
        self.seen_hash_queue = collections.deque(maxlen=200000)
        self.seen_url_set = set()
        self.seen_url_queue = collections.deque(maxlen=500000)
        
        self.robots_cache_data = collections.OrderedDict(self._load_robots_cache())
        self.robots_parsers = {}
        
        self.total_submitted = 0
        self.total_done = 0
        
        self.stop_event = threading.Event()
        self.executor = None
        self.current_zip = None

        try:
            self.driver_path = ChromeDriverManager().install()
        except:
            self.driver_path = None

        default_workers = min(32, (os.cpu_count() or 1) * 4)

        # GUI変数
        self.url_var = tk.StringVar()
        self.selector_var = tk.StringVar(value="img, source, picture")
        self.max_scroll_var = tk.IntVar(value=30)
        self.max_pages_var = tk.IntVar(value=1)
        self.min_width_var = tk.IntVar(value=100)
        self.min_height_var = tk.IntVar(value=100)
        self.min_bytes_var = tk.IntVar(value=5000)
        self.workers_var = tk.IntVar(value=default_workers)
        self.filename_var = tk.StringVar(value="apex_v17_collection.zip")
        self.check_robots_var = tk.BooleanVar(value=True)
        self.enable_images_var = tk.BooleanVar(value=False) 
        self.use_head_var = tk.BooleanVar(value=False)

        self.create_widgets()

    def create_widgets(self):
        p = {'padx': 10, 'pady': 5}
        tk.Label(self.root, text="対象URL:").pack(anchor="w", **p)
        tk.Entry(self.root, textvariable=self.url_var, width=110).pack(**p)
        
        f_mid = tk.LabelFrame(self.root, text="Apex v17 Settings (HTTP Semaphore / Direct PNG-to-JPG / robots強化)")
        f_mid.pack(fill="x", **p)

        grid_params = {'padx': 5, 'pady': 5}
        tk.Label(f_mid, text="CSSセレクタ:").grid(row=0, column=0, **grid_params)
        tk.Entry(f_mid, textvariable=self.selector_var, width=15).grid(row=0, column=1)
        tk.Label(f_mid, text="最大ページ:").grid(row=0, column=2)
        tk.Spinbox(f_mid, from_=1, to=10000, textvariable=self.max_pages_var, width=5).grid(row=0, column=3)
        tk.Label(f_mid, text="並列数:").grid(row=0, column=4)
        tk.Spinbox(f_mid, from_=1, to=128, textvariable=self.workers_var, width=5).grid(row=0, column=5)

        tk.Label(f_mid, text="最小解像度:").grid(row=1, column=0)
        f_res = tk.Frame(f_mid); f_res.grid(row=1, column=1, columnspan=2, sticky="w")
        tk.Entry(f_res, textvariable=self.min_width_var, width=5).pack(side="left")
        tk.Label(f_res, text="x").pack(side="left")
        tk.Entry(f_res, textvariable=self.min_height_var, width=5).pack(side="left")
        tk.Label(f_mid, text="最小(B):").grid(row=1, column=3)
        tk.Entry(f_mid, textvariable=self.min_bytes_var, width=10).grid(row=1, column=4)

        tk.Checkbutton(f_mid, text="robots遵守", variable=self.check_robots_var).grid(row=2, column=0)
        tk.Checkbutton(f_mid, text="ブラウザ画像表示", variable=self.enable_images_var).grid(row=2, column=1)
        tk.Checkbutton(f_mid, text="HEAD先読み", variable=self.use_head_var).grid(row=2, column=2)

        f_zip = tk.Frame(self.root); f_zip.pack(fill="x", **p)
        tk.Label(f_zip, text="保存ZIP名:").pack(side="left")
        tk.Entry(f_zip, textvariable=self.filename_var, width=40).pack(side="left", padx=10)

        f_btns = tk.Frame(self.root); f_btns.pack(fill="x", pady=10)
        self.btn_run = tk.Button(f_btns, text="🚀 エイペックス起動", command=self.start_task, bg="#1B5E20", fg="white", font=("Arial", 11, "bold"), width=35)
        self.btn_run.pack(side="left", padx=30)
        self.btn_stop = tk.Button(f_btns, text="🛑 停止", command=self.stop_task, bg="#B71C1C", fg="white", font=("Arial", 11, "bold"), width=15)
        self.btn_stop.pack(side="left")

        self.progress = ttk.Progressbar(self.root, orient="horizontal", mode="determinate")
        self.progress.pack(fill="x", padx=30, pady=5)
        self.log_area = scrolledtext.ScrolledText(self.root, height=20, bg="#000000", fg="#00FF41", font=("Consolas", 9))
        self.log_area.pack(fill="both", expand=True, **p)

    def log(self, msg):
        self.root.after(0, lambda: (self.log_area.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {msg}\n"), self.log_area.see(tk.END)))

    def stop_task(self):
        self.stop_event.set()
        if self.executor:
            try: self.executor.shutdown(wait=True, cancel_futures=True)
            except: pass
        self.log("[!] 停止処理完了。")

    def _load_robots_cache(self):
        if os.path.exists(ROBOTS_CACHE_FILE):
            try:
                with open(ROBOTS_CACHE_FILE, "r") as f: return json.load(f)
            except: return {}
        return {}

    def _save_robots_cache(self):
        MAX_ROBOTS = 500
        while len(self.robots_cache_data) > MAX_ROBOTS:
            self.robots_cache_data.popitem(last=False)
        try:
            with open(ROBOTS_CACHE_FILE, "w") as f: json.dump(self.robots_cache_data, f)
        except: pass

    # ① 改善：robots.txt 判定を独立メソッド化
    def allowed_by_robots(self, client, url):
        if not self.check_robots_var.get(): return True
        try:
            parsed = urlparse(url)
            base = f"{parsed.scheme}://{parsed.netloc}"
            with self.robots_lock:
                if base in self.robots_cache_data:
                    self.robots_cache_data.move_to_end(base)
                
                if base not in self.robots_parsers:
                    rp = RobotFileParser()
                    if base in self.robots_cache_data:
                        rp.parse(self.robots_cache_data[base].splitlines())
                    else:
                        try:
                            resp = client.get(urljoin(base, "/robots.txt"), timeout=5.0)
                            if resp.status_code == 200:
                                self.robots_cache_data[base] = resp.text
                                rp.parse(resp.text.splitlines())
                                self._save_robots_cache()
                        except: pass
                    self.robots_parsers[base] = rp
            return self.robots_parsers[base].can_fetch(BOT_NAME, url)
        except: return True

    def get_thread_client(self, cookies):
        if not hasattr(self.thread_local, "client"):
            limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)
            client = httpx.Client(http2=True, timeout=httpx.Timeout(10.0, read=30.0), follow_redirects=True, limits=limits)
            for ck in cookies:
                client.cookies.set(ck['name'], ck['value'], domain=ck.get('domain'))
            self.thread_local.client = client
            with self.hash_lock:
                if client not in self.thread_clients: self.thread_clients.append(client)
        return self.thread_local.client

    def normalize_url(self, url):
        try:
            p = urlparse(url)
            qs = parse_qs(p.query)
            AD_PARAMS = ("utm_", "fbclid", "ref", "aff", "click_id", "gclid")
            filtered_qs = {k: v for k, v in qs.items() if not any(k.lower().startswith(pre) for pre in AD_PARAMS)}
            return p._replace(query=urlencode(filtered_qs, doseq=True), fragment="").geturl()
        except: return url

    def pick_best_src(self, srcset):
        if not srcset: return None
        best_url, best_size = None, 0
        try:
            items = re.split(r',\s*', srcset.strip())
            for item in items:
                parts = item.strip().split()
                if len(parts) == 2:
                    url, size_str = parts[0], parts[1].lower()
                    if size_str.endswith('w'):
                        size = int(re.search(r'\d+', size_str).group())
                        if size > best_size: best_size, best_url = size, url
                    elif size_str.endswith('x'):
                        size = float(re.search(r'[\d.]+', size_str).group()) * 1000
                        if size > best_size: best_size, best_url = int(size), url
                elif len(parts) == 1 and not best_url:
                    best_url = parts[0]
            return best_url or items[0].split(' ')[0]
        except: return srcset.split(',')[0].strip().split(' ')[0]

    def start_task(self):
        self.stop_event.clear()
        self.seen_url_set.clear()
        self.seen_url_queue.clear()
        self.seen_hashes.clear()
        self.seen_hash_queue.clear()
        self.total_submitted = 0
        self.total_done = 0
        self.btn_run.config(state="disabled")
        # ⑤ 改善：HTTP同時接続数をWorkersの半分程度に制御
        self.net_semaphore = threading.Semaphore(max(4, self.workers_var.get() // 2))
        threading.Thread(target=self.main_process, daemon=True).start()

    def main_process(self):
        driver = None; client = None
        try:
            target_url = self.url_var.get()
            opts = Options()
            opts.add_argument("--headless=new")
            opts.add_argument(f"user-agent={random.choice(USER_AGENTS)}")
            opts.add_argument("--disable-gpu")
            opts.add_argument("--disable-blink-features=AutomationControlled")
            if not self.enable_images_var.get(): opts.add_argument("--blink-settings=imagesEnabled=false")

            service = Service(self.driver_path) if self.driver_path else Service()
            driver = webdriver.Chrome(service=service, options=opts)
            driver.set_page_load_timeout(30)
            driver.get(target_url)

            out_zip = self.filename_var.get()
            self.current_zip = zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=4)

            self.executor = ThreadPoolExecutor(max_workers=self.workers_var.get())
            download_futures = []
            max_pages = self.max_pages_var.get()
            selector = self.selector_var.get()
            workers = self.workers_var.get()

            for p_idx in range(max_pages):
                if self.stop_event.is_set(): break
                if psutil.Process().memory_info().rss > 1.2 * 1024**3:
                    self.log("[*] Driverリフレッシュ...")
                    curr = driver.current_url
                    latest_cookies = driver.get_cookies() 
                    driver.quit()
                    gc.collect(); time.sleep(2)
                    driver = webdriver.Chrome(service=service, options=opts)
                    driver.get(urlparse(curr).scheme + "://" + urlparse(curr).netloc)
                    for ck in latest_cookies:
                        try: driver.add_cookie(ck)
                        except: pass
                    driver.get(curr)

                current_before = driver.current_url
                self.log(f"[*] 解析中 ({p_idx+1}/{max_pages})")
                
                # ④ 改善：スクロールを高速化 (0.4-0.8s)
                last_pos, no_change = 0, 0
                for _ in range(self.max_scroll_var.get()):
                    driver.execute_script("window.scrollTo(0, document.body ? document.body.scrollHeight : 0);")
                    time.sleep(random.uniform(0.4, 0.8))
                    new_pos = driver.execute_script("return document.body ? document.body.scrollHeight : 0")
                    if new_pos == last_pos:
                        no_change += 1
                        if no_change >= 3: break
                    else: no_change = 0
                    last_pos = new_pos

                latest_cookies = driver.get_cookies()

                urls_js = driver.execute_script("""
                return Array.from(document.querySelectorAll(arguments[0])).map(e => ({
                    src: e.src, srcset: e.srcset, ds: e.dataset ? Object.assign({}, e.dataset) : {}
                }));
                """, selector)

                for entry in urls_js:
                    raw_src = self.pick_best_src(entry['srcset']) if entry['srcset'] else (entry['src'] or entry['ds'].get('src') or entry['ds'].get('original'))
                    if raw_src:
                        full_url = self.normalize_url(urljoin(driver.current_url, raw_src))
                        url_hash = hashlib.md5(full_url.encode()).hexdigest()
                        
                        with self.hash_lock:
                            if url_hash in self.seen_url_set: continue
                            if len(self.seen_url_queue) >= self.seen_url_queue.maxlen:
                                self.seen_url_set.discard(self.seen_url_queue.popleft())
                            self.seen_url_set.add(url_hash); self.seen_url_queue.append(url_hash)
                            
                        self.total_submitted += 1
                        f = self.executor.submit(self.download_task, full_url, driver.current_url, p_idx, latest_cookies)
                        download_futures.append(f)
                        
                        # ② 改善：キュー飽和保護ロジックを workers * 3 に修正
                        if len(download_futures) >= workers * 3:
                            self.process_futures_safe(download_futures)
                            download_futures.clear()

                if p_idx < max_pages - 1:
                    next_ok = False
                    for xp in NEXT_XPATHS:
                        try:
                            btn = driver.find_element(By.XPATH, xp)
                            btn.click()
                            WebDriverWait(driver, 10).until(lambda d: d.current_url != current_before)
                            next_ok = True; break
                        except: continue
                    if not next_ok: break
                else: break

            if driver: driver.quit(); driver = None
            if download_futures: self.process_futures_safe(download_futures)

            if self.executor: self.executor.shutdown(wait=True); self.executor = None
            if self.current_zip:
                with self.zip_lock: self.current_zip.close(); self.current_zip = None
            
            self.log(f"【完了】 保存完了: {out_zip}")

        except Exception as e:
            self.log(f"[Fatal] {e}")
            messagebox.showerror("Error", str(e))
        finally:
            if driver:
                try: driver.quit()
                except: pass
            if self.current_zip:
                try: 
                    with self.zip_lock: self.current_zip.close()
                except: pass
            for c in self.thread_clients:
                try: c.close()
                except: pass
            if self.executor: self.executor.shutdown(wait=True, cancel_futures=True)
            self.btn_run.config(state="normal")

    def process_futures_safe(self, futures):
        while futures and not self.stop_event.is_set():
            completed = []
            try:
                for f in as_completed(futures, timeout=5.0):
                    completed.append(f)
                    try: f.result()
                    except: pass
                    self.total_done += 1
                    prog = (self.total_done / max(1, self.total_submitted)) * 100
                    self.root.after(0, lambda v=prog: self.progress.config(value=v, maximum=100))
            except TimeoutError: pass
            for f in completed:
                if f in futures: futures.remove(f)

    def download_task(self, url, referer, p_idx, cookies):
        if self.stop_event.is_set(): return None
        client = self.get_thread_client(cookies)
        
        # ① 改善：robots.txt チェック
        if not self.allowed_by_robots(client, url): return None

        # ⑤ 改善：同時HTTPリクエスト数をセマフォで厳格制御
        with self.net_semaphore:
            uid = uuid.uuid4().hex
            headers = {"User-Agent": random.choice(USER_AGENTS), "Referer": referer}
            img_buffer = io.BytesIO()
            try:
                for attempt in range(3):
                    try:
                        img_buffer.seek(0); img_buffer.truncate(0)
                        md5 = hashlib.md5()
                        
                        if self.use_head_var.get():
                            try:
                                head = client.head(url, headers=headers, timeout=5.0)
                                if head.status_code == 200:
                                    cl = head.headers.get("content-length")
                                    if cl and int(cl) < self.min_bytes_var.get(): return None
                            except: pass

                        with client.stream("GET", url, headers=headers, timeout=httpx.Timeout(10.0, read=60.0)) as r:
                            if r.status_code == 429:
                                time.sleep(random.uniform(3.0, 8.0) * (attempt + 1))
                                raise Exception("429")
                            if r.status_code != 200: return None
                            
                            cl = r.headers.get("content-length")
                            if cl and int(cl) < self.min_bytes_var.get(): return None
                            
                            ctype = r.headers.get("content-type", "").lower()
                            if "image" not in ctype and not url.lower().endswith(('.jpg','.png','.webp','.gif')): return None
                            
                            for chunk in r.iter_raw(chunk_size=65536):
                                if self.stop_event.is_set(): raise Exception("Stop")
                                img_buffer.write(chunk); md5.update(chunk)
                        
                        img_hash = md5.hexdigest()
                        with self.hash_lock:
                            if img_hash in self.seen_hashes: return None
                            if len(self.seen_hash_queue) >= self.seen_hash_queue.maxlen:
                                self.seen_hashes.discard(self.seen_hash_queue.popleft())
                            self.seen_hashes.add(img_hash); self.seen_hash_queue.append(img_hash)

                        img_buffer.seek(0)
                        with Image.open(img_buffer) as img:
                            img.load()
                            w, h = img.size
                            if w < self.min_width_var.get() or h < self.min_height_var.get(): return None
                            
                            if img.mode in ("RGBA", "P"): img = img.convert("RGB")
                            fmt = img.format
                            ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif"}.get(fmt, "jpg")
                            filename = f"page_{p_idx+1:03d}_{uid[:10]}.{ext}"
                            
                            # ③ 改善：PNG/WEBPをJPEG変換してZIP軽量化
                            with self.zip_lock:
                                if self.current_zip:
                                    if fmt == "JPEG":
                                        self.current_zip.writestr(filename, img_buffer.getbuffer(), compress_type=zipfile.ZIP_STORED)
                                    elif fmt in ("PNG", "WEBP"):
                                        img = img.convert("RGB")
                                        save_buffer = io.BytesIO()
                                        img.save(save_buffer, format="JPEG", quality=85, optimize=True)
                                        new_filename = filename.rsplit('.', 1)[0] + ".jpg"
                                        self.current_zip.writestr(new_filename, save_buffer.getbuffer(), compress_type=zipfile.ZIP_STORED)
                                        save_buffer.close()
                                    else:
                                        save_buffer = io.BytesIO()
                                        img.save(save_buffer, format=fmt)
                                        self.current_zip.writestr(filename, save_buffer.getbuffer(), compress_type=zipfile.ZIP_DEFLATED)
                                        save_buffer.close()
                                    
                        return filename
                    except Exception:
                        time.sleep(2 ** attempt)
                return None
            finally:
                img_buffer.close()

if __name__ == "__main__":
    root = tk.Tk(); app = IndustrialApexScraper(root); root.mainloop()