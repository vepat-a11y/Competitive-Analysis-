import asyncio
import json
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
import httpx
from playwright.async_api import async_playwright
import database

try:
    from playwright_stealth import stealth_async
    HAVE_STEALTH = True
except ImportError:
    HAVE_STEALTH = False

# --- SITEMAP PARSER ---
def fetch_xml(url: str) -> ET.Element:
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        return ET.fromstring(r.content)
    except Exception as e:
        print(f"    [!] Failed to fetch sitemap {url}: {e}")
        return None

def collect_product_urls(sitemap_url: str) -> list:
    root = fetch_xml(sitemap_url)
    if root is None: return []
    
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    tag = root.tag.lower()
    urls = []

    if tag.endswith("sitemapindex"):
        for loc in root.findall(".//sm:loc", ns):
            if loc.text:
                urls.extend(collect_product_urls(loc.text.strip()))
    elif tag.endswith("urlset"):
        for loc in root.findall(".//sm:loc", ns):
            if loc.text and "/shop/product/" in loc.text:
                urls.append(loc.text.strip())
    return urls

# --- CORE EXTRACTION ---
async def scrape_one_product(context, url: str):
    page = await context.new_page()
    if HAVE_STEALTH: await stealth_async(page)

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        html = await page.content()
        title_text = await page.title()
    except Exception:
        await page.close()
        return None
    finally:
        await page.close()

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
                if 'name' in obj and obj['name']: name = obj['name']
                merchants = obj.get('merchants', [])
                if merchants and isinstance(merchants, list):
                    m_data = merchants[0]
                    c_price = m_data.get('price')
                    o_price = m_data.get('original_price')
                    stock = m_data.get('quantity')
                    
                    options = m_data.get('product_options', [])
                    for opt in options:
                        if str(opt.get('option_id', '')) == variant_id or len(options) == 1:
                            if 'price' in opt: c_price = opt['price']
                            if 'original_price' in opt: o_price = opt['original_price']
                            if 'quantity' in opt: stock = opt['quantity']
                            if 'inventory' in opt: stock = opt['inventory']
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
        except: pass

    if not size:
        m = re.search(r"\b(\d+(?:\.\d+)?\s*(?:ML|L|OZ))\b", name, re.IGNORECASE)
        size = m.group(1).upper().replace(" ", "") if m else None

    return {
        "variant_id": variant_id, "name": name, "size": size, "upc": upc,
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
    
    # Get the strict product_id
    c.execute('SELECT id FROM products WHERE store_id=? AND variant_id=?', (store_id, data['variant_id']))
    product_id = c.fetchone()[0]

    # Insert Daily Metrics
    c.execute('''
        INSERT INTO daily_metrics (product_id, scrape_date, regular_price, sale_price, stock_level)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(product_id, scrape_date) DO UPDATE SET
            regular_price=excluded.regular_price, sale_price=excluded.sale_price, stock_level=excluded.stock_level
    ''', (product_id, today, data['regular_price'], data['sale_price'], data['stock_level']))

    conn.commit()
    conn.close()

async def run_crawl():
    database.init_db() # Ensure DB exists
    conn = database.get_db_connection()
    stores = conn.cursor().execute("SELECT id, name, sitemap_url FROM stores").fetchall()
    conn.close()

    async with async_playwright() as pw:
        context = await pw.chromium.launch_persistent_context("./chrome_profile", headless=True, viewport={"width": 1366, "height": 900})
        
        for store in stores:
            store_id, store_name, sitemap_url = store
            print(f"\n[+] Starting scrape for: {store_name}")
            print(f"    Resolving sitemap: {sitemap_url}")
            
            urls = collect_product_urls(sitemap_url)
            urls = sorted(set(urls))
            
            # REMOVE THIS LINE FOR PRODUCTION (TESTING 10 ITEMS ONLY)
            urls = urls[:10] 
            
            print(f"    Found {len(urls)} products.")

            for i, url in enumerate(urls, 1):
                print(f"    [{i}/{len(urls)}] Scraping: {url.split('/')[-1][:30]}")
                data = await scrape_one_product(context, url)
                if data:
                    save_to_db(store_id, data)
                    print(f"      -> {data['name'][:30]} | Stock: {data['stock_level']}")

        await context.close()
    print("\n[+] Multi-Store Scrape Complete!")

if __name__ == "__main__":
    asyncio.run(run_crawl())
