import asyncio
import json
import re
import urllib.parse
import xml.etree.ElementTree as ET
import os
import tempfile
import shutil
from datetime import date
import httpx
from playwright.async_api import async_playwright
import database

try:
    from playwright_stealth import stealth_async
    HAVE_STEALTH = True
except ImportError:
    HAVE_STEALTH = False

# --- PLAYWRIGHT SITEMAP FETCH AND PARSE ---
async def fetch_sitemap_content(page, url: str) -> str:
    try:
        # Check if this is the primary sitemap and needs warmup
        if url.lower().endswith("/sitemap.xml") or url.lower().endswith("sitemap.xml"):
            try:
                parsed = urllib.parse.urlparse(url)
                homepage = f"{parsed.scheme}://{parsed.netloc}/"
                print(f"    [+] Session warm-up: Visiting homepage {homepage}...")
                # Visit homepage with a short timeout to set session/cookies
                await page.goto(homepage, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(2000)
            except Exception as e:
                print(f"    [!] Session warm-up skipped/failed: {e}")

        print(f"    [+] Loading sitemap page: {url}")
        # Try navigating directly to sitemap XML URL
        await page.goto(url, wait_until="domcontentloaded", timeout=40000)
        content = await page.content()
        
        # In case the browser parses XML into HTML elements or wraps it in <pre>,
        # let's try to extract raw text first as well.
        try:
            raw_xml = await page.evaluate("""async (target_url) => {
                try {
                    const res = await fetch(target_url);
                    return await res.text();
                } catch (e) {
                    return "";
                }
            }""", url)
            if raw_xml and ("<urlset" in raw_xml or "<sitemapindex" in raw_xml or "<loc" in raw_xml):
                return raw_xml
        except Exception:
            pass
            
        return content
    except Exception as e:
        print(f"    [!] Failed to load sitemap {url} via browser: {e}")
        # Final fallback to standard httpx request
        try:
            r = httpx.get(url, timeout=15, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                return r.text
        except Exception as ex:
            print(f"    [!] httpx fallback also failed: {ex}")
        return ""

async def collect_product_urls_async(page, sitemap_url: str, visited=None) -> list:
    if visited is None:
        visited = set()
        
    if sitemap_url in visited:
        return []
    visited.add(sitemap_url)
    
    content = await fetch_sitemap_content(page, sitemap_url)
    if not content:
        return []
        
    # Standard XML namespace mapping
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = []
    
    # High-tolerance parsing:
    # 1. Try to parse using ElementTree
    try:
        root = ET.fromstring(content.encode('utf-8', errors='ignore'))
        tag = root.tag.lower()
        
        if tag.endswith("sitemapindex"):
            # Recurse into sub-sitemaps
            for loc in root.findall(".//sm:loc", ns):
                if loc.text:
                    urls.extend(await collect_product_urls_async(page, loc.text.strip(), visited))
            # Fallback for no namespace
            if not urls:
                for loc in root.findall(".//loc"):
                    if loc.text:
                        urls.extend(await collect_product_urls_async(page, loc.text.strip(), visited))
        elif tag.endswith("urlset"):
            for loc in root.findall(".//sm:loc", ns):
                if loc.text and "/shop/product/" in loc.text:
                    urls.append(loc.text.strip())
            # Fallback for no namespace
            if not urls:
                for loc in root.findall(".//loc"):
                    if loc.text and "/shop/product/" in loc.text:
                        urls.append(loc.text.strip())
    except Exception as e:
        # XML parsing failed (e.g. if the browser wrapped XML in HTML).
        # Fallback to ultra-robust Regex extraction!
        print(f"    [!] XML parsing failed for {sitemap_url} (or HTML wrapper detected). Falling back to Regex parser.")
        
    # 2. Regex fallback (always run or use as fallback to extract ALL <loc> content)
    regex_locs = re.findall(r'<loc>(.*?)</loc>', content, re.IGNORECASE)
    clean_locs = []
    for loc in regex_locs:
        loc = loc.strip()
        if loc.startswith('<![CDATA['):
            loc = loc[9:-3].strip()
        clean_locs.append(loc)
        
    sitemaps_to_recurse = []
    product_urls = []
    
    for loc in clean_locs:
        if ".xml" in loc.lower() or "sitemap" in loc.lower():
            sitemaps_to_recurse.append(loc)
        elif "/shop/product/" in loc:
            product_urls.append(loc)
            
    # Process nested sitemaps found via regex
    for sub in sitemaps_to_recurse:
        if sub not in visited:
            sub_urls = await collect_product_urls_async(page, sub, visited)
            product_urls.extend(sub_urls)
            
    urls.extend(product_urls)
    return list(sorted(set(urls)))

# --- CORE EXTRACTION ---
async def scrape_one_product(context, url: str):
    page = await context.new_page()
    if HAVE_STEALTH: 
        await stealth_async(page)

    try:
        # Block heavy resources (images, styles, fonts, media) for rapid page loads
        async def block_resources(route):
            if route.request.resource_type in ["image", "stylesheet", "font", "media"]:
                await route.abort()
            else:
                await route.continue_()
        await page.route("**/*", block_resources)

        # Optimize load time by using domcontentloaded
        await page.goto(url, wait_until="domcontentloaded", timeout=40000)
        html = await page.content()
        title_text = await page.title()
    except Exception as e:
        print(f"      [!] Timeout or navigation error on {url}: {e}")
        await page.close()
        return None
    finally:
        await page.close()

    # Extract ID and variant
    product_id = url.split('?')[0].strip('/').split('/')[-1]
    variant_id = url.split('option-id=')[1].split('&')[0] if 'option-id=' in url else product_id
    
    name = title_text.split('|')[0].strip()
    name = re.sub(r'\s*-\s*[^,]+,\s*[A-Z]{2}.*$', '', name).strip()
    
    reg_price, sale_price, upc, stock, size = None, None, None, None, None

    # HTML DECODING ENGINE
    for match in re.finditer(r'decodeURIComponent\([\'"](%7B.*?)[\'"]\)', html):
        try:
            obj = json.loads(urllib.parse.unquote(match.group(1)))
            if isinstance(obj, dict) and str(obj.get('id', '')) == product_id:
                if 'name' in obj and obj['name']: 
                    name = obj['name']
                merchants = obj.get('merchants', [])
                if merchants and isinstance(merchants, list):
                    m_data = merchants[0]
                    c_price = m_data.get('price')
                    o_price = m_data.get('original_price')
                    stock = m_data.get('quantity')
                    
                    options = m_data.get('product_options', [])
                    for opt in options:
                        if str(opt.get('option_id', '')) == variant_id or len(options) == 1:
                            if 'price' in opt: 
                                c_price = opt['price']
                            if 'original_price' in opt: 
                                o_price = opt['original_price']
                            if 'quantity' in opt: 
                                stock = opt['quantity']
                            if 'inventory' in opt: 
                                stock = opt['inventory']
                            upc = opt.get('upc', opt.get('barcode', opt.get('sku')))
                            
                            size_obj = opt.get('option_params', {}).get('size', {})
                            if isinstance(size_obj, dict):
                                size = f"{size_obj.get('quantity','')}{size_obj.get('measure','')}".upper()
                            break
                    
                    if c_price is not None:
                        if o_price is not None and float(o_price) > float(c_price):
                            reg_price, sale_price = o_price, c_price
                        else:
                            reg_price = c_price

                if not size:
                    size_obj = obj.get('size', {})
                    if isinstance(size_obj, dict):
                        size = f"{size_obj.get('quantity','')}{size_obj.get('measure','')}".upper()
                break
        except Exception: 
            pass

    if not size:
        m = re.search(r"\b(\d+(?:\.\d+)?\s*(?:ML|L|OZ))\b", name, re.IGNORECASE)
        size = m.group(1).upper().replace(" ", "") if m else None

    return {
        "variant_id": variant_id, 
        "name": name, 
        "size": size, 
        "upc": upc,
        "regular_price": float(reg_price) if reg_price else None,
        "sale_price": float(sale_price) if sale_price else None,
        "stock_level": int(stock) if stock is not None else None
    }

# --- DATABASE INGESTION ---
def save_to_db(store_id, data):
    conn = database.get_db_connection()
    c = conn.cursor()
    today = date.today().isoformat()

    # Insert or Update Product
    c.execute('''
        INSERT INTO products (store_id, variant_id, name, size, upc)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(store_id, variant_id) DO UPDATE SET
            name=excluded.name, size=excluded.size, upc=COALESCE(excluded.upc, products.upc)
    ''', (store_id, data['variant_id'], data['name'], data['size'], data['upc']))
    
    # Get strict product_id
    c.execute('SELECT id FROM products WHERE store_id=? AND variant_id=?', (store_id, data['variant_id']))
    row = c.fetchone()
    if not row:
        conn.close()
        return
    product_id = row[0]

    # Insert Daily Metrics
    c.execute('''
        INSERT INTO daily_metrics (product_id, scrape_date, regular_price, sale_price, stock_level)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(product_id, scrape_date) DO UPDATE SET
            regular_price=excluded.regular_price, sale_price=excluded.sale_price, stock_level=excluded.stock_level
    ''', (product_id, today, data['regular_price'], data['sale_price'], data['stock_level']))

    conn.commit()
    conn.close()

# --- CORE CRALWER RUNNER ---
async def run_crawl(target_store_id: int = None):
    database.init_db() # Ensure DB is initialized
    
    conn = database.get_db_connection()
    if target_store_id is not None:
        stores = conn.cursor().execute("SELECT id, name, sitemap_url FROM stores WHERE id = ?", (target_store_id,)).fetchall()
    else:
        stores = conn.cursor().execute("SELECT id, name, sitemap_url FROM stores").fetchall()
    conn.close()

    if not stores:
        print("[!] No stores found to scrape.")
        return

    for store in stores:
        store_id, store_name, sitemap_url = store
        print(f"\n[+] Starting scrape for: {store_name} (ID: {store_id})")
        print(f"    Resolving sitemap: {sitemap_url}")
        
        # Use a completely clean temporary profile directory to isolate crawls and allow parallel safety
        profile_dir = tempfile.mkdtemp(prefix=f"playwright_store_{store_id}_")
        
        async with async_playwright() as pw:
            browser_args = [
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            context = await pw.chromium.launch_persistent_context(
                profile_dir, 
                headless=True, 
                user_agent=ua,
                viewport={"width": 1366, "height": 900},
                args=browser_args
            )
            
            try:
                page = await context.new_page()
                if HAVE_STEALTH: 
                    await stealth_async(page)
                
                # Fetch product URLs via our robust Playwright-driven sitemap parser
                urls = await collect_product_urls_async(page, sitemap_url)
                urls = sorted(set(urls))
                
                print(f"    [+] Found {len(urls)} products for {store_name}.")
                
                # Concurrency Control: scrape up to 3 pages in parallel to keep things lightning fast yet low memory
                semaphore = asyncio.Semaphore(3)
                
                async def scrape_task(url, index):
                    async with semaphore:
                        try:
                            data = await scrape_one_product(context, url)
                            if data:
                                save_to_db(store_id, data)
                                print(f"      [{index}/{len(urls)}] Saved: {data['name'][:35]} | Stock: {data['stock_level']} | Price: ${data['regular_price']}")
                        except Exception as ex:
                            print(f"      [!] Error on product [{index}] {url}: {ex}")

                tasks = [scrape_task(url, idx) for idx, url in enumerate(urls, 1)]
                if tasks:
                    await asyncio.gather(*tasks)
                else:
                    print("    [!] No product URLs were extracted from this sitemap.")
                    
            finally:
                await context.close()
                # Clean up temporary browser profile directories to save disk space
                try:
                    shutil.rmtree(profile_dir)
                except Exception:
                    pass

        print(f"[+] Finished scraping store: {store_name}\n")

    print("[+] All target store crawls completed!")

if __name__ == "__main__":
    import sys
    target_id = None
    if len(sys.argv) > 1:
        try:
            target_id = int(sys.argv[1])
        except ValueError:
            pass
    asyncio.run(run_crawl(target_id))
