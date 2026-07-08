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

// Global scraper execution state
let scraperProcess: any = null;
let scraperLogs: string[] = [];
let scraperIsRunning = false;

// --- API ENDPOINTS ---

// 1. Dashboard summary stats
app.get('/api/dashboard', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Total Stores
    const storesCount = await dbQuery('SELECT COUNT(*) as count FROM stores');
    
    // Total Products
    const productsCount = await dbQuery('SELECT COUNT(*) as count FROM products');

    // On Sale Today
    const saleCount = await dbQuery(
      `SELECT COUNT(*) as count FROM daily_metrics 
       WHERE scrape_date = ? AND sale_price IS NOT NULL AND sale_price < regular_price`,
      [todayStr]
    );

    // Out of Stock Today
    const oosCount = await dbQuery(
      `SELECT COUNT(*) as count FROM daily_metrics 
       WHERE scrape_date = ? AND stock_level = 0`,
      [todayStr]
    );

    // Sales Velocity (Top Selling Yesterday vs Today)
    const velocityData = await dbQuery(
      `SELECT 
        s.name as store, p.name as product, p.size as size,
        m_today.regular_price as price, m_today.sale_price as salePrice,
        m_today.stock_level as currentStock,
        (m_yesterday.stock_level - m_today.stock_level) as unitsSold
      FROM products p
      JOIN stores s ON p.store_id = s.id
      JOIN daily_metrics m_today ON p.id = m_today.product_id AND m_today.scrape_date = ?
      JOIN daily_metrics m_yesterday ON p.id = m_yesterday.product_id AND m_yesterday.scrape_date = ?
      WHERE (m_yesterday.stock_level - m_today.stock_level) > 0
      ORDER BY unitsSold DESC
      LIMIT 20`,
      [todayStr, yesterdayStr]
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

// 3. Get catalog for a specific store
app.get('/api/catalog', async (req, res) => {
  try {
    const { storeId, search } = req.query;
    const todayStr = new Date().toISOString().split('T')[0];

    let query = `
      SELECT p.id, p.name as product, p.size as size, p.upc as upc, 
             m.regular_price as price, m.sale_price as salePrice, m.stock_level as stock,
             p.first_seen_date as addedOn, s.name as storeName
      FROM products p
      JOIN stores s ON p.store_id = s.id
      LEFT JOIN daily_metrics m ON p.id = m.product_id AND m.scrape_date = ?
    `;
    const params: any[] = [todayStr];

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

// 4. Trigger Scraper
app.post('/api/scraper/run', (req, res) => {
  if (scraperIsRunning) {
    return res.status(400).json({ success: false, error: 'Scraper is already running' });
  }

  scraperIsRunning = true;
  scraperLogs = [`[${new Date().toLocaleTimeString()}] Starting scraper process...`];

  // Spawn python3 scraper.py
  scraperProcess = spawn('python3', ['scraper.py']);

  scraperProcess.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        scraperLogs.push(`[${new Date().toLocaleTimeString()}] ${line}`);
      }
    });
  });

  scraperProcess.stderr.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        scraperLogs.push(`[${new Date().toLocaleTimeString()}] [ERROR] ${line}`);
      }
    });
  });

  scraperProcess.on('close', (code: number) => {
    scraperIsRunning = false;
    scraperLogs.push(`[${new Date().toLocaleTimeString()}] Scraper process finished with exit code ${code}`);
    scraperProcess = null;
  });

  res.json({ success: true, message: 'Scraper triggered successfully' });
});

// 5. Get scraper status and logs
app.get('/api/scraper/status', (req, res) => {
  res.json({
    success: true,
    isRunning: scraperIsRunning,
    logs: scraperLogs.slice(-100) // return last 100 log lines
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
      // Re-initialize sqlite connection in case schema changed or database was re-created
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
