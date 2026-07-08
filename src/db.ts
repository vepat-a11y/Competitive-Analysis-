import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve(process.cwd(), 'competitor_intelligence.sqlite');

export interface Store {
  id: number;
  name: string;
  domain: string;
  sitemap_url: string;
}

export interface Product {
  id: number;
  store_id: number;
  variant_id: string;
  name: string;
  size: string;
  upc: string;
  first_seen_date: string;
}

export interface DailyMetric {
  id: number;
  product_id: number;
  scrape_date: string;
  regular_price: number;
  sale_price: number | null;
  stock_level: number;
}

class DatabaseWrapper {
  private db: Database.Database;
  public isSeeding = false; // Kept for API compatibility

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
  }

  public getRawDb() {
    return this.db;
  }

  public forceSave(): void {
    // No-op for real SQLite, data is written automatically
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    try {
      const stmt = this.db.prepare(sql);
      const info = stmt.run(...params);
      return { lastID: Number(info.lastInsertRowid), changes: info.changes };
    } catch (e) {
      console.error('[DB Run Error]', e, sql, params);
      return { lastID: 0, changes: 0 };
    }
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (e) {
      console.error('[DB All Error]', e, sql, params);
      return [];
    }
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    try {
      const stmt = this.db.prepare(sql);
      const res = stmt.get(...params);
      return (res as T) ?? undefined;
    } catch (e) {
      console.error('[DB Get Error]', e, sql, params);
      return undefined;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export const db = new DatabaseWrapper(DB_PATH);

function generateAllSampleProducts(): Array<{ name: string; size: string; upc: string; base_price: number; is_sale: boolean }> {
  const brands = [
    "Tito's", "Jameson", "Jack Daniel's", "Maker's Mark", "Grey Goose", "Josh Cellars",
    "Santa Margherita", "Meiomi", "Yellow Tail", "Crown Royal", "Hennessy", "Aperol",
    "Casamigos", "Patron", "Captain Morgan", "The Macallan", "Kim Crawford", "Veuve Clicquot",
    "Hendrick's", "La Marca", "Bombay Sapphire", "Woodford Reserve", "Espolon", "Bulleit",
    "Glenmorangie", "Absolut", "Bacardi", "Tanqueray", "Don Julio", "Decoy"
  ];
  const categories = [
    "Handmade Vodka", "Irish Whiskey", "Tennessee Whiskey", "Kentucky Straight Bourbon",
    "French Premium Vodka", "Cabernet Sauvignon", "Chardonnay", "Pinot Grigio", "Pinot Noir",
    "Shiraz", "Blended Canadian Whisky", "VS Cognac", "Aperitivo Liqueur", "Blanco Tequila",
    "Reposado Tequila", "Spiced Gold Rum", "Single Malt Scotch 12 Year", "Sauvignon Blanc",
    "Brut Champagne", "Botanical Gin", "Prosecco", "London Dry Gin", "Double Oak Bourbon",
    "Silver Tequila", "Rye Whiskey", "Highland Single Malt", "Swedish Vodka", "Superior White Rum",
    "Anejo Tequila", "Merlot"
  ];
  const variations = [
    "Original", "Reserve", "Select", "Small Batch", "Single Barrel", "Special Edition",
    "Double Cask", "Triple Distilled", "Legacy", "Signature Blend", "Master's Edition",
    "Private Selection", "Founders Reserve", "Old No. 7", "Classic", "Premium", "Platinum"
  ];
  const sizes = ["375ml", "750ml", "1L", "1.75L"];

  const list: Array<{ name: string; size: string; upc: string; base_price: number; is_sale: boolean }> = [];
  
  let state = 12345;
  function nextRand() {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  }

  // Generate ALL possible combinations without limiting to 1100
  for (const brand of brands) {
    for (const cat of categories) {
      for (const variant of variations) {
        for (const size of sizes) {
          const name = `${brand} ${variant} ${cat}`;
          
          const upcNum = Math.floor(100000000000 + nextRand() * 800000000000);
          const upc = String(upcNum);
          
          let base_price = 15.99 + nextRand() * 85.00;
          if (size === "375ml") base_price *= 0.6;
          else if (size === "1L") base_price *= 1.3;
          else if (size === "1.75L") base_price *= 1.7;
          base_price = parseFloat(base_price.toFixed(2));

          const is_sale = nextRand() < 0.35;
          
          list.push({ name, size, upc, base_price, is_sale });
        }
      }
    }
  }

  return list;
}

const SAMPLE_PRODUCTS = generateAllSampleProducts();

// Helper to generate custom pseudo-random values based on seed numbers
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

export async function initDatabaseAndSeedIfEmpty(): Promise<void> {
  console.log('[DB] Ensuring database tables are initialized...');
  
  // Create tables
  await db.run(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      sitemap_url TEXT NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      variant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size TEXT,
      upc TEXT,
      first_seen_date TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      UNIQUE(store_id, variant_id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      scrape_date TEXT NOT NULL,
      regular_price REAL NOT NULL,
      sale_price REAL,
      stock_level INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, scrape_date)
    )
  `);

  // Seed Stores
  const storeCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM stores');
  if (storeCount && storeCount.count === 0) {
    console.log('[DB] Seeding competitor stores...');
    await db.run(`
      INSERT INTO stores (name, domain, sitemap_url) VALUES 
      ('Butler''s Wine & Spirits', 'butlerswineandspirits.com', 'https://butlerswineandspirits.com/sitemap.xml'),
      ('Midnight Liquor', 'midnightliquors.com', 'https://midnightliquors.com/sitemap.xml'),
      ('Straight Up Wines & Liquors', 'straightupliquor.com', 'https://straightupliquor.com/sitemap.xml')
    `);
  }

  // Seed Products and Daily Metrics if empty or not fully synchronized
  const productCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM products');
  
  // Since we have 3 stores and 61,200 products each, total expected products > 180,000
  if (productCount && productCount.count < 180000) {
    console.log('[DB] Database has fewer than expected full products (has ' + productCount.count + '). Resetting and performing 30-day historical high-fidelity seeding cycle... This may take a moment to insert millions of rows.');
    
    // Clear legacy collections first
    await db.run('DELETE FROM daily_metrics');
    await db.run('DELETE FROM products');

    const storesList = await db.all<Store>('SELECT * FROM stores');
    const today = new Date();
    const daysOfHistory = 30;

    const rawDb = db.getRawDb();

    // Use a transaction for extreme high-speed bulk inserts
    const seedEverything = rawDb.transaction(() => {
      const insertProduct = rawDb.prepare(`
        INSERT INTO products (store_id, variant_id, name, size, upc, first_seen_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMetric = rawDb.prepare(`
        INSERT OR REPLACE INTO daily_metrics (product_id, scrape_date, regular_price, sale_price, stock_level)
        VALUES (?, ?, ?, ?, ?)
      `);

      // 1. Create product catalog first
      for (const store of storesList) {
        console.log(`[DB] Generating products for ${store.name}...`);
        let seed = store.id * 100;
        
        for (let i = 0; i < SAMPLE_PRODUCTS.length; i++) {
          const item = SAMPLE_PRODUCTS[i];
          const variant_id = `v_${store.id}_${1000 + i}`;
          
          // Randomize first seen date within the last 30 days
          const firstSeenDelta = Math.floor(seededRandom(seed++) * daysOfHistory);
          let firstSeenDateStr = '';
          
          // Stagger some items to test "New Product Added" features
          if (firstSeenDelta <= 7 && seededRandom(seed++) < 0.4) {
            const firstSeenDate = new Date();
            firstSeenDate.setDate(today.getDate() - Math.floor(seededRandom(seed++) * 6) - 1);
            firstSeenDateStr = firstSeenDate.toISOString().split('T')[0];
          } else {
            const firstSeenDate = new Date();
            firstSeenDate.setDate(today.getDate() - daysOfHistory);
            firstSeenDateStr = firstSeenDate.toISOString().split('T')[0];
          }

          insertProduct.run(store.id, variant_id, item.name, item.size, item.upc, firstSeenDateStr);
        }
      }

      // 2. Fetch all products to write daily_metrics
      const allProducts = rawDb.prepare('SELECT * FROM products').all() as Product[];
      
      console.log('[DB] Writing multi-day depletion metrics... (Processing ~5.5M records)');
      
      const currentStockLevels: { [productId: number]: number } = {};
      
      for (let dayIdx = daysOfHistory; dayIdx >= 0; dayIdx--) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() - dayIdx);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        const dateSeedValue = parseInt(targetDateStr.replace(/-/g, ''));

        for (const prod of allProducts) {
          if (prod.first_seen_date > targetDateStr) {
            continue;
          }

          // We'll use a fast binary-search or just deterministic logic for item prices to avoid huge array lookups
          const prodPriceSeed = prod.id * 73;
          const basePrice = 15.99 + (seededRandom(prodPriceSeed) * 85.00); 
          const priceVariance = (seededRandom(prodPriceSeed + 1) * 2.5) - 1.0; 
          const regular_price = parseFloat((basePrice + priceVariance).toFixed(2));
          
          let sale_price: number | null = null;
          // Determine if it was "is_sale"
          const is_sale = seededRandom(prod.id * 89) < 0.35;
          
          if (is_sale) {
            const dayNum = targetDate.getDate();
            if ((dayNum % 10) < 4) {
              const saleDiff = 1.5 + seededRandom(prod.id + dateSeedValue) * 2.5;
              sale_price = parseFloat((regular_price - saleDiff).toFixed(2));
            }
          }

          let prevStock = currentStockLevels[prod.id];
          let stock_level = 0;

          if (prevStock !== undefined) {
            if (prevStock === 0) {
              if (seededRandom(prod.id * 13 + dateSeedValue) < 0.4) {
                stock_level = Math.floor(12 + seededRandom(prod.id * 19 + dateSeedValue) * 36); 
              } else {
                stock_level = 0;
              }
            } else {
              const maxDepletion = Math.min(5, prevStock);
              const depletion = Math.floor(seededRandom(prod.id * 3 + dateSeedValue) * (maxDepletion + 1));
              stock_level = prevStock - depletion;
              if (seededRandom(prod.id * 11 + dateSeedValue) < 0.12) {
                stock_level += Math.floor(12 + seededRandom(prod.id * 4 + dateSeedValue) * 24);
              }
            }
          } else {
            stock_level = Math.floor(10 + seededRandom(prod.id * 29 + dateSeedValue) * 50); 
          }

          currentStockLevels[prod.id] = stock_level;
          insertMetric.run(prod.id, targetDateStr, regular_price, sale_price, stock_level);
        }
      }
    });

    // Execute the bulk seeding
    seedEverything();

    console.log('[DB] Seeding cycle complete! High-fidelity competitor intelligence dataset ready.');
  } else {
    console.log('[DB] SQLite database already populated with full product catalog.');
  }
}

/**
 * Perform manual background scrape update from Express
 */
export async function triggerDailyScrape(): Promise<void> {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  console.log(`[Manual Scrape] Starting trigger on date ${todayStr}`);
  const stores = await db.all<Store>('SELECT * FROM stores');
  const products = await db.all<Product>('SELECT * FROM products');

  const rawDb = db.getRawDb();
  
  const scrapeTransaction = rawDb.transaction(() => {
    const insertMetric = rawDb.prepare(`
      INSERT OR REPLACE INTO daily_metrics (product_id, scrape_date, regular_price, sale_price, stock_level)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const getYesterdayMetric = rawDb.prepare(`
      SELECT * FROM daily_metrics WHERE product_id = ? AND scrape_date = ?
    `);

    for (const store of stores) {
      const storeProds = products.filter(p => p.store_id === store.id);
      const dateSeedValue = parseInt(todayStr.replace(/-/g, ''));
      
      for (const prod of storeProds) {
        const yesterdayMetric = getYesterdayMetric.get(prod.id, yesterdayStr) as DailyMetric | undefined;
        
        const prodPriceSeed = prod.id * 73;
        const basePrice = 15.99 + (seededRandom(prodPriceSeed) * 85.00); 
        const priceVariance = (seededRandom(prodPriceSeed + 1) * 2.5) - 1.0; 
        const regular_price = parseFloat((basePrice + priceVariance).toFixed(2));
        
        let sale_price: number | null = null;
        const is_sale = seededRandom(prod.id * 89) < 0.35;
        if (is_sale) {
          const dayNum = new Date().getDate();
          if ((dayNum % 10) < 4) {
            const saleDiff = 1.5 + seededRandom(prod.id + dateSeedValue) * 2.5;
            sale_price = parseFloat((regular_price - saleDiff).toFixed(2));
          }
        }

        let stock_level = 15;

        if (yesterdayMetric) {
          const prevStock = yesterdayMetric.stock_level;
          if (prevStock === 0) {
            stock_level = seededRandom(prod.id + dateSeedValue) < 0.5 ? Math.floor(10 + seededRandom(prod.id + dateSeedValue) * 30) : 0;
          } else {
            const depletion = Math.floor(seededRandom(prod.id * 2 + dateSeedValue) * 4);
            stock_level = Math.max(0, prevStock - depletion);
            if (seededRandom(prod.id * 3 + dateSeedValue) < 0.15) {
              stock_level += Math.floor(15 + seededRandom(prod.id * 4 + dateSeedValue) * 25);
            }
          }
        }
        
        insertMetric.run(prod.id, todayStr, regular_price, sale_price, stock_level);
      }
    }
  });

  scrapeTransaction();
  console.log('[Manual Scrape] Completed successfully!');
}

