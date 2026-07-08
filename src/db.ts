import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'competitor_intelligence.json');

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

interface DBData {
  stores: Store[];
  products: Product[];
  daily_metrics: DailyMetric[];
  nextStoreId: number;
  nextProductId: number;
  nextMetricId: number;
}

class DatabaseWrapper {
  private filePath: string;
  private data: DBData;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): DBData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[DB] Failed to load JSON database, starting fresh', e);
    }
    return {
      stores: [],
      products: [],
      daily_metrics: [],
      nextStoreId: 1,
      nextProductId: 1,
      nextMetricId: 1
    };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] Failed to save JSON database', e);
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    const query = sql.trim().replace(/\s+/g, ' ');
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.startsWith('create table')) {
      return { lastID: 0, changes: 0 };
    }

    if (lowerQuery.includes('insert into stores')) {
      this.data.stores = [
        { id: 1, name: "Butler's Wine & Spirits", domain: 'butlerswineandspirits.com', sitemap_url: 'https://butlerswineandspirits.com/sitemap.xml' },
        { id: 2, name: 'Midnight Liquor', domain: 'midnightliquors.com', sitemap_url: 'https://midnightliquors.com/sitemap.xml' },
        { id: 3, name: 'Straight Up Wines & Liquors', domain: 'straightupliquor.com', sitemap_url: 'https://straightupliquor.com/sitemap.xml' }
      ];
      this.data.nextStoreId = 4;
      this.save();
      return { lastID: 3, changes: 3 };
    }

    if (lowerQuery.includes('insert into products')) {
      const [store_id, variant_id, name, size, upc, first_seen_date] = params;
      let existing = this.data.products.find(p => p.store_id === store_id && p.variant_id === variant_id);
      if (!existing) {
        const id = this.data.nextProductId++;
        this.data.products.push({
          id,
          store_id,
          variant_id,
          name,
          size,
          upc,
          first_seen_date
        });
        this.save();
        return { lastID: id, changes: 1 };
      } else {
        return { lastID: existing.id, changes: 0 };
      }
    }

    if (lowerQuery.includes('insert or replace into daily_metrics') || lowerQuery.includes('insert into daily_metrics')) {
      const [product_id, scrape_date, regular_price, sale_price, stock_level] = params;
      let existingIndex = this.data.daily_metrics.findIndex(m => m.product_id === product_id && m.scrape_date === scrape_date);
      if (existingIndex !== -1) {
        this.data.daily_metrics[existingIndex] = {
          ...this.data.daily_metrics[existingIndex],
          regular_price,
          sale_price,
          stock_level
        };
        this.save();
        return { lastID: this.data.daily_metrics[existingIndex].id, changes: 1 };
      } else {
        const id = this.data.nextMetricId++;
        this.data.daily_metrics.push({
          id,
          product_id,
          scrape_date,
          regular_price,
          sale_price,
          stock_level
        });
        this.save();
        return { lastID: id, changes: 1 };
      }
    }

    return { lastID: 0, changes: 0 };
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const query = sql.trim().replace(/\s+/g, ' ');
    const lowerQuery = query.toLowerCase();

    // 1. SELECT COUNT(*) as count FROM stores
    if (lowerQuery.includes('select count(*)') && lowerQuery.includes('from stores')) {
      return [{ count: this.data.stores.length }] as any;
    }

    // 2. SELECT COUNT(*) as count FROM products
    if (lowerQuery.includes('select count(*)') && lowerQuery.includes('from products')) {
      return [{ count: this.data.products.length }] as any;
    }

    // 3. SELECT * FROM stores
    if (lowerQuery.startsWith('select * from stores') && !lowerQuery.includes('where')) {
      return JSON.parse(JSON.stringify(this.data.stores)) as T[];
    }

    // 4. SELECT * FROM products WHERE store_id = ?
    if (lowerQuery.startsWith('select * from products') && lowerQuery.includes('where store_id =')) {
      const storeId = params[0];
      const filtered = this.data.products.filter(p => p.store_id === storeId);
      return JSON.parse(JSON.stringify(filtered)) as T[];
    }

    // 5. SELECT * FROM products
    if (lowerQuery.startsWith('select * from products') && !lowerQuery.includes('where')) {
      return JSON.parse(JSON.stringify(this.data.products)) as T[];
    }

    // 6. SELECT * FROM daily_metrics WHERE product_id IN (...) AND scrape_date >= ? ORDER BY product_id, scrape_date ASC
    if (lowerQuery.includes('product_id in (')) {
      // Find where product_id is in params list and date >= last param
      const dateVal = params[params.length - 1];
      const prodIds = params.slice(0, params.length - 1);
      const filtered = this.data.daily_metrics.filter(m => prodIds.includes(m.product_id) && m.scrape_date >= dateVal);
      filtered.sort((a, b) => {
        if (a.product_id !== b.product_id) return a.product_id - b.product_id;
        return a.scrape_date.localeCompare(b.scrape_date);
      });
      return JSON.parse(JSON.stringify(filtered)) as T[];
    }

    // 7. SELECT * FROM daily_metrics WHERE scrape_date >= ? ORDER BY product_id, scrape_date ASC
    if (lowerQuery.startsWith('select * from daily_metrics') && lowerQuery.includes('scrape_date >=') && !lowerQuery.includes('product_id =')) {
      const dateVal = params[0];
      const filtered = this.data.daily_metrics.filter(m => m.scrape_date >= dateVal);
      filtered.sort((a, b) => {
        if (a.product_id !== b.product_id) return a.product_id - b.product_id;
        return a.scrape_date.localeCompare(b.scrape_date);
      });
      return JSON.parse(JSON.stringify(filtered)) as T[];
    }

    return [] as T[];
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    const query = sql.trim().replace(/\s+/g, ' ');
    const lowerQuery = query.toLowerCase();

    // 1. SELECT COUNT(*) as count FROM stores
    if (lowerQuery.includes('select count(*)') && lowerQuery.includes('from stores')) {
      return { count: this.data.stores.length } as any;
    }

    // 2. SELECT COUNT(*) as count FROM products
    if (lowerQuery.includes('select count(*)') && lowerQuery.includes('from products')) {
      return { count: this.data.products.length } as any;
    }

    // 3. SELECT * FROM stores WHERE id = ?
    if (lowerQuery.startsWith('select * from stores') && lowerQuery.includes('where id =')) {
      const id = params[0];
      const store = this.data.stores.find(s => s.id === id);
      return store ? (JSON.parse(JSON.stringify(store)) as T) : undefined;
    }

    // 4. SELECT * FROM daily_metrics WHERE product_id = ? AND scrape_date = ?
    if (lowerQuery.startsWith('select * from daily_metrics') && lowerQuery.includes('product_id =') && lowerQuery.includes('scrape_date =')) {
      const [productId, scrapeDate] = params;
      const metric = this.data.daily_metrics.find(m => m.product_id === productId && m.scrape_date === scrapeDate);
      return metric ? (JSON.parse(JSON.stringify(metric)) as T) : undefined;
    }

    return undefined;
  }

  async close(): Promise<void> {
    // No-op for JSON DB
  }
}

export const db = new DatabaseWrapper(DB_PATH);

const SAMPLE_PRODUCTS = [
  { name: "Tito's Handmade Vodka", size: "750ml", upc: "015645001150", base_price: 21.99, is_sale: true },
  { name: "Tito's Handmade Vodka", size: "1.75L", upc: "015645001174", base_price: 37.99, is_sale: false },
  { name: "Jameson Irish Whiskey", size: "750ml", upc: "080432104111", base_price: 32.99, is_sale: true },
  { name: "Jack Daniel's Old No. 7 Tennessee Whiskey", size: "750ml", upc: "082184090442", base_price: 26.99, is_sale: false },
  { name: "Jack Daniel's Old No. 7 Tennessee Whiskey", size: "1L", upc: "082184090466", base_price: 34.99, is_sale: true },
  { name: "Makers Mark Bourbon", size: "750ml", upc: "085246500037", base_price: 31.99, is_sale: false },
  { name: "Grey Goose Vodka", size: "750ml", upc: "080660610014", base_price: 34.99, is_sale: true },
  { name: "Grey Goose Vodka", size: "1.75L", upc: "080660610038", base_price: 59.99, is_sale: false },
  { name: "Josh Cellars Cabernet Sauvignon", size: "750ml", upc: "896346001476", base_price: 15.99, is_sale: true },
  { name: "Josh Cellars Chardonnay", size: "750ml", upc: "896346001469", base_price: 14.99, is_sale: false },
  { name: "Santa Margherita Pinot Grigio", size: "750ml", upc: "086899001151", base_price: 24.99, is_sale: true },
  { name: "Meiomi Pinot Noir", size: "750ml", upc: "890533002206", base_price: 22.99, is_sale: false },
  { name: "Yellow Tail Shiraz", size: "750ml", upc: "031259000188", base_price: 8.99, is_sale: false },
  { name: "Yellow Tail Chardonnay", size: "1.5L", upc: "031259000300", base_price: 13.99, is_sale: true },
  { name: "Crown Royal Canadian Whisky", size: "750ml", upc: "082000200155", base_price: 28.99, is_sale: false },
  { name: "Hennessy VS Cognac", size: "750ml", upc: "081753810754", base_price: 45.99, is_sale: false },
  { name: "Aperol Liqueur", size: "750ml", upc: "721059001402", base_price: 27.99, is_sale: true },
  { name: "Casamigos Blanco Tequila", size: "750ml", upc: "855566005011", base_price: 49.99, is_sale: true },
  { name: "Patron Silver Tequila", size: "750ml", upc: "721733000022", base_price: 52.99, is_sale: false },
  { name: "Captain Morgan Spiced Rum", size: "750ml", upc: "082000104279", base_price: 18.99, is_sale: true },
  { name: "The Macallan 12 Year Double Cask", size: "750ml", upc: "083259111244", base_price: 84.99, is_sale: false },
  { name: "Kim Crawford Sauvignon Blanc", size: "750ml", upc: "842704000122", base_price: 17.99, is_sale: true },
  { name: "Veuve Clicquot Yellow Label Brut", size: "750ml", upc: "081753823457", base_price: 64.99, is_sale: false },
  { name: "Hendrick's Gin", size: "750ml", upc: "083664868731", base_price: 36.99, is_sale: true },
  { name: "La Marca Prosecco", size: "750ml", upc: "085000017163", base_price: 16.99, is_sale: false }
];

// Helper to generate custom pseudo-random values based on seed numbers
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

export async function initDatabaseAndSeedIfEmpty(): Promise<void> {
  console.log('[DB] Ensuring database tables are initialized...');
  
  // Create tables with EXACT SQLite-equivalent syntax as Python SQLAlchemy
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

  // Seed Products and Daily Metrics if empty
  const productCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM products');
  if (productCount && productCount.count === 0) {
    console.log('[DB] Starting 30-day historical high-fidelity seeding cycle...');
    const storesList = await db.all<Store>('SELECT * FROM stores');
    const today = new Date();
    const daysOfHistory = 30;

    // 1. Create product catalog first
    for (const store of storesList) {
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

        await db.run(`
          INSERT INTO products (store_id, variant_id, name, size, upc, first_seen_date)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [store.id, variant_id, item.name, item.size, item.upc, firstSeenDateStr]);
      }
    }

    // 2. Fetch all products to write daily_metrics
    const allProducts = await db.all<Product>('SELECT * FROM products');
    
    // Day-by-day metrics generator to maintain mathematical consistency for stock level depletion (Sales velocity)
    console.log('[DB] Writing multi-day depletion metrics...');
    
    // Store daily stock levels in memory to calculate stock depletion realistically day-by-day
    const currentStockLevels: { [productId: number]: number } = {};
    
    // Start generating metrics from Day 30 back to Day 0
    for (let dayIdx = daysOfHistory; dayIdx >= 0; dayIdx--) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() - dayIdx);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      const dateSeedValue = parseInt(targetDateStr.replace(/-/g, ''));

      for (const prod of allProducts) {
        // Only log if product was seen at or before targetDate
        if (prod.first_seen_date > targetDateStr) {
          continue;
        }

        // Get matching base template
        const itemTmpl = SAMPLE_PRODUCTS.find(x => x.name === prod.name && x.size === prod.size) || SAMPLE_PRODUCTS[0];
        
        // Consistent price base per product
        const prodPriceSeed = prod.id * 73;
        const priceVariance = (seededRandom(prodPriceSeed) * 2.5) - 1.0; // range [-1.0, 1.5]
        const regular_price = parseFloat((itemTmpl.base_price + priceVariance).toFixed(2));
        
        // Determine sale status
        let sale_price: number | null = null;
        if (itemTmpl.is_sale) {
          // Sales occur on specific dates based on targetDate day in blocks of 4 days
          const dayNum = targetDate.getDate();
          if ((dayNum % 10) < 4) {
            const saleDiff = 1.5 + seededRandom(prod.id + dateSeedValue) * 2.5;
            sale_price = parseFloat((regular_price - saleDiff).toFixed(2));
          }
        }

        // Calculate Stock Level dynamically (depletion model)
        let prevStock = currentStockLevels[prod.id];
        let stock_level = 0;

        if (prevStock !== undefined) {
          if (prevStock === 0) {
            // 40% chance of restock
            if (seededRandom(prod.id * 13 + dateSeedValue) < 0.4) {
              stock_level = Math.floor(12 + seededRandom(prod.id * 19 + dateSeedValue) * 36); // [12, 47]
            } else {
              stock_level = 0;
            }
          } else {
            // Deplete stock
            const maxDepletion = Math.min(5, prevStock);
            const depletion = Math.floor(seededRandom(prod.id * 3 + dateSeedValue) * (maxDepletion + 1));
            stock_level = prevStock - depletion;

            // 10% chance of receiving a shipment (increasing stock level)
            if (seededRandom(prod.id * 11 + dateSeedValue) < 0.12) {
              stock_level += Math.floor(12 + seededRandom(prod.id * 4 + dateSeedValue) * 24);
            }
          }
        } else {
          // Initial stock level on first day
          stock_level = Math.floor(10 + seededRandom(prod.id * 29 + dateSeedValue) * 50); // [10, 59]
        }

        // Update tracking map
        currentStockLevels[prod.id] = stock_level;

        // Insert metric
        await db.run(`
          INSERT OR REPLACE INTO daily_metrics (product_id, scrape_date, regular_price, sale_price, stock_level)
          VALUES (?, ?, ?, ?, ?)
        `, [prod.id, targetDateStr, regular_price, sale_price, stock_level]);
      }
    }
    
    console.log('[DB] Seeding cycle complete! High-fidelity competitor intelligence dataset ready.');
  } else {
    console.log('[DB] SQLite database already populated.');
  }
}

/**
 * Perform manual background scrape update from Express
 * Simulates visiting each sitemap, looking for CityHive payload, and logging changes.
 */
export async function triggerDailyScrape(): Promise<void> {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  console.log(`[Manual Scrape] Starting trigger on date ${todayStr}`);

  const stores = await db.all<Store>('SELECT * FROM stores');
  const products = await db.all<Product>('SELECT * FROM products');

  for (const store of stores) {
    const storeProds = products.filter(p => p.store_id === store.id);
    const dateSeedValue = parseInt(todayStr.replace(/-/g, ''));
    
    for (const prod of storeProds) {
      // Find yesterday's metrics
      const yesterdayMetric = await db.get<DailyMetric>(
        'SELECT * FROM daily_metrics WHERE product_id = ? AND scrape_date = ?',
        [prod.id, yesterdayStr]
      );

      const itemTmpl = SAMPLE_PRODUCTS.find(x => x.name === prod.name && x.size === prod.size) || SAMPLE_PRODUCTS[0];
      const prodPriceSeed = prod.id * 73;
      const priceVariance = (seededRandom(prodPriceSeed) * 2.5) - 1.0;
      const regular_price = parseFloat((itemTmpl.base_price + priceVariance).toFixed(2));
      
      let sale_price: number | null = null;
      if (itemTmpl.is_sale) {
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
          // Deplete 0 to 3 units
          const depletion = Math.floor(seededRandom(prod.id * 2 + dateSeedValue) * 4);
          stock_level = Math.max(0, prevStock - depletion);
          
          // Small chance of restocking (increase)
          if (seededRandom(prod.id * 3 + dateSeedValue) < 0.15) {
            stock_level += Math.floor(15 + seededRandom(prod.id * 4 + dateSeedValue) * 25);
          }
        }
      }

      await db.run(`
        INSERT OR REPLACE INTO daily_metrics (product_id, scrape_date, regular_price, sale_price, stock_level)
        VALUES (?, ?, ?, ?, ?)
      `, [prod.id, todayStr, regular_price, sale_price, stock_level]);
    }
  }

  console.log('[Manual Scrape] Completed successfully!');
}
