import sqlite3
import os

DB_FILE = 'competitor_intel.db'

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()

    # 1. Stores Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            domain TEXT NOT NULL,
            sitemap_url TEXT NOT NULL
        )
    ''')

    # 2. Products Table (Strict Isolation)
    c.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL,
            variant_id TEXT NOT NULL,
            name TEXT,
            size TEXT,
            upc TEXT,
            first_seen_date DATE DEFAULT CURRENT_DATE,
            FOREIGN KEY (store_id) REFERENCES stores (id),
            UNIQUE(store_id, variant_id) -- CRITICAL: Prevents crossover and duplicates
        )
    ''')

    # 3. Daily Metrics Table (For Velocity and Price Tracking)
    c.execute('''
        CREATE TABLE IF NOT EXISTS daily_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            scrape_date DATE DEFAULT CURRENT_DATE,
            regular_price REAL,
            sale_price REAL,
            stock_level INTEGER,
            FOREIGN KEY (product_id) REFERENCES products (id),
            UNIQUE(product_id, scrape_date) -- Only one record per product per day
        )
    ''')

    # Seed the 3 target stores if they don't exist
    stores_data = [
        ("Butler's Wine & Spirits", "butlerswineandspirits.com", "https://butlerswineandspirits.com/sitemap.xml"),
        ("Midnight Liquor", "midnightliquor.com", "https://midnightliquor.com/sitemap.xml"),
        ("Straight Up Wines & Liquors", "straightupwines.com", "https://straightupwines.com/sitemap.xml")
    ]
    
    for store in stores_data:
        c.execute("INSERT OR IGNORE INTO stores (name, domain, sitemap_url) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM stores WHERE domain=?)", (store[0], store[1], store[2], store[1]))

    conn.commit()
    conn.close()
    print("[+] Database initialized successfully.")

if __name__ == '__main__':
    init_db()
