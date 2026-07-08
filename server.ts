import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createRequire } from 'module';

// ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
const PORT = 3000;

app.use(express.json());

const DB_FILE = 'competitor_intel.db';

// Multi-fallback SQLite helper
interface QueryResult {
  rows: any[];
}

let sqliteDb: any = null;
let useBetterSqlite = false;

function initDatabaseConnection() {
  try {
    // Try importing better-sqlite3 dynamically
    const Database = require('better-sqlite3');
    sqliteDb = new Database(DB_FILE);
    useBetterSqlite = true;
    console.log('[+] Connected to SQLite database using better-sqlite3');
  } catch (err) {
    console.log('[!] better-sqlite3 failed or not available, falling back to sqlite3 package');
    try {
      const sqlite3 = require('sqlite3').verbose();
      sqliteDb = new sqlite3.Database(DB_FILE);
      useBetterSqlite = false;
      console.log('[+] Connected to SQLite database using sqlite3');
    } catch (err2) {
      console.error('[CRITICAL] Failed to initialize any SQLite package:', err2);
    }
  }
}

initDatabaseConnection();

// Safe async database query helper
function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!sqliteDb) {
      return reject(new Error('No database connection available'));
    }

    if (useBetterSqlite) {
      try {
        const stmt = sqliteDb.prepare(sql);
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          const rows = stmt.all(...params);
          resolve(rows);
        } else {
          const info = stmt.run(...params);
          resolve([info]);
        }
      } catch (err) {
        reject(err);
      }
    } else {
      // Use standard sqlite3 (callbacks)
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        sqliteDb.all(sql, params, (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      } else {
        sqliteDb.run(sql, params, function (this: any, err: any) {
          if (err) reject(err);
          else resolve([{ lastID: this.lastID, changes: this.changes }]);
        });
      }
    }
  });
}

// Scraper execution states mapped by key (storeId or 'global')
interface ScraperState {
  process: any;
  isRunning: boolean;
  logs: string[];
}
const scrapers = new Map<string | number, ScraperState>();

// --- API ENDPOINTS ---

// 1. Dashboard summary stats (optimized to fetch latest metrics, not date-locked)
app.get('/api/dashboard', async (req, res) => {
  try {
    // Total Stores
    const storesCount = await dbQuery('SELECT COUNT(*) as count FROM stores');
    
    // Total Products
    const productsCount = await dbQuery('SELECT COUNT(*) as count FROM products');

    // On Sale (using latest daily metrics for each product)
    const saleCount = await dbQuery(
      `SELECT COUNT(*) as count FROM daily_metrics m
       WHERE m.scrape_date = (SELECT MAX(scrape_date) FROM daily_metrics WHERE product_id = m.product_id)
         AND m.sale_price IS NOT NULL AND m.sale_price < m.regular_price`
    );

    // Out of Stock (using latest daily metrics for each product)
    const oosCount = await dbQuery(
      `SELECT COUNT(*) as count FROM daily_metrics m
       WHERE m.scrape_date = (SELECT MAX(scrape_date) FROM daily_metrics WHERE product_id = m.product_id)
         AND m.stock_level = 0`
    );

    // Sales Velocity (Top Selling between two most recent crawls)
    const velocityData = await dbQuery(
      `SELECT 
        s.name as store, p.name as product, p.size as size,
        m_today.regular_price as price, m_today.sale_price as salePrice,
        m_today.stock_level as currentStock,
        (m_yesterday.stock_level - m_today.stock_level) as unitsSold
      FROM products p
      JOIN stores s ON p.store_id = s.id
      JOIN daily_metrics m_today ON p.id = m_today.product_id AND m_today.scrape_date = (
        SELECT MAX(scrape_date) FROM daily_metrics WHERE product_id = p.id
      )
      JOIN daily_metrics m_yesterday ON p.id = m_yesterday.product_id AND m_yesterday.scrape_date = (
        SELECT MAX(scrape_date) FROM daily_metrics WHERE product_id = p.id AND scrape_date < m_today.scrape_date
      )
      WHERE (m_yesterday.stock_level - m_today.stock_level) > 0
      ORDER BY unitsSold DESC
      LIMIT 20`
    );

    res.json({
      success: true,
      stats: {
        stores: storesCount[0]?.count || 0,
        products: productsCount[0]?.count || 0,
        onSale: saleCount[0]?.count || 0,
        outOfStock: oosCount[0]?.count || 0
      },
      velocity: velocityData
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Get all stores
app.get('/api/stores', async (req, res) => {
  try {
    const stores = await dbQuery('SELECT * FROM stores ORDER BY name ASC');
    res.json({ success: true, stores });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/Add a new store
app.post('/api/stores', async (req, res) => {
  try {
    const { name, domain, sitemap_url } = req.body;
    if (!name || !domain || !sitemap_url) {
      return res.status(400).json({ success: false, error: 'Missing name, domain, or sitemap_url' });
    }
    await dbQuery(
      'INSERT INTO stores (name, domain, sitemap_url) VALUES (?, ?, ?)',
      [name, domain, sitemap_url]
    );
    res.json({ success: true, message: 'Store added successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a store
app.delete('/api/stores/:id', async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'Invalid Store ID' });
    }
    // Perform manual cascaded deletion
    await dbQuery('DELETE FROM daily_metrics WHERE product_id IN (SELECT id FROM products WHERE store_id = ?)', [storeId]);
    await dbQuery('DELETE FROM products WHERE store_id = ?', [storeId]);
    await dbQuery('DELETE FROM stores WHERE id = ?', [storeId]);
    res.json({ success: true, message: 'Store and all related products and metrics deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Get catalog for a specific store (Optimized to pull the latest daily metrics)
app.get('/api/catalog', async (req, res) => {
  try {
    const { storeId, search } = req.query;

    let query = `
      SELECT p.id, p.name as product, p.size as size, p.upc as upc, 
             m.regular_price as price, m.sale_price as salePrice, m.stock_level as stock,
             p.first_seen_date as addedOn, s.name as storeName
      FROM products p
      JOIN stores s ON p.store_id = s.id
      LEFT JOIN daily_metrics m ON p.id = m.product_id AND m.scrape_date = (
        SELECT MAX(scrape_date) FROM daily_metrics WHERE product_id = p.id
      )
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (storeId) {
      conditions.push('p.store_id = ?');
      params.push(Number(storeId));
    }

    if (search) {
      conditions.push('p.name LIKE ?');
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.name ASC';

    const catalog = await dbQuery(query, params);
    res.json({ success: true, catalog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Trigger Scraper (supports individual storeId run)
app.post('/api/scraper/run', (req, res) => {
  const storeId = req.body?.storeId || req.query?.storeId || 'global';
  const key = storeId === 'global' ? 'global' : Number(storeId);

  const existing = scrapers.get(key);
  if (existing?.isRunning) {
    return res.status(400).json({ success: false, error: 'Scraper is already running for this target' });
  }

  const args = ['scraper.py'];
  if (storeId !== 'global') {
    args.push(String(storeId));
  }

  const logs: string[] = [`[${new Date().toLocaleTimeString()}] Spawning headless browser session...`];
  const proc = spawn('python3', args);

  scrapers.set(key, {
    process: proc,
    isRunning: true,
    logs
  });

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        logs.push(`[${new Date().toLocaleTimeString()}] ${line}`);
      }
    });
  });

  proc.stderr.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        logs.push(`[${new Date().toLocaleTimeString()}] [ERROR] ${line}`);
      }
    });
  });

  proc.on('close', (code: number) => {
    const state = scrapers.get(key);
    if (state) {
      state.isRunning = false;
      state.logs.push(`[${new Date().toLocaleTimeString()}] Crawl process finished with exit code ${code}`);
    }
  });

  res.json({ success: true, message: 'Scraper triggered successfully' });
});

// 5. Get scraper status and logs for specific storeId
app.get('/api/scraper/status', (req, res) => {
  const storeId = req.query?.storeId || 'global';
  const key = storeId === 'global' ? 'global' : Number(storeId);
  const state = scrapers.get(key);

  res.json({
    success: true,
    isRunning: state?.isRunning || false,
    logs: state?.logs ? state.logs.slice(-100) : []
  });
});

// 6. Reset database/seed
app.post('/api/database/reset', async (req, res) => {
  try {
    const initDbProcess = spawn('python3', ['database.py']);
    let output = '';
    initDbProcess.stdout.on('data', (data) => output += data.toString());
    initDbProcess.stderr.on('data', (data) => output += data.toString());

    initDbProcess.on('close', (code) => {
      // Re-initialize sqlite connection
      if (sqliteDb && typeof sqliteDb.close === 'function') {
        try { sqliteDb.close(); } catch (e) {}
      }
      initDatabaseConnection();

      res.json({ success: code === 0, output });
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Vite / static file serving middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] Fullstack Server running on http://localhost:${PORT}`);
  });
}

startServer();
