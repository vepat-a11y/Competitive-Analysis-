import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { 
  db, 
  initDatabaseAndSeedIfEmpty, 
  triggerDailyScrape,
  Store,
  Product,
  DailyMetric 
} from './src/db.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// API Endpoints - Keep them FIRST
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Helper to get past dates as YYYY-MM-DD
function getPastDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// 1. Get all stores
app.get('/api/competitors', async (req, res) => {
  try {
    const stores = await db.all<Store>('SELECT * FROM stores');
    res.json(stores);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Fetch Global Dashboard Statistics & Feeds
app.get('/api/global-dashboard', async (req, res) => {
  try {
    const todayStr = getPastDateString(0);
    const sevenDaysAgoStr = getPastDateString(7);
    const thirtyDaysAgoStr = getPastDateString(30);

    // Fetch stores and products
    const stores = await db.all<Store>('SELECT * FROM stores');
    const storeMap = new Map(stores.map(s => [s.id, s]));
    
    const products = await db.all<Product>('SELECT * FROM products');
    const productMap = new Map(products.map(p => [p.id, p]));

    // Fetch all daily metrics for the past 30 days
    const metrics = await db.all<DailyMetric>(
      'SELECT * FROM daily_metrics WHERE scrape_date >= ? ORDER BY product_id, scrape_date ASC',
      [thirtyDaysAgoStr]
    );

    // Group metrics by product ID
    const metricsByProduct: { [productId: number]: DailyMetric[] } = {};
    for (const m of metrics) {
      if (!metricsByProduct[m.product_id]) {
        metricsByProduct[m.product_id] = [];
      }
      metricsByProduct[m.product_id].push(m);
    }

    // Analytics Engine
    const productAnalytics: any[] = [];
    const priceAlerts: any[] = [];

    for (const prod of products) {
      const prodMetrics = metricsByProduct[prod.id] || [];
      if (prodMetrics.length === 0) continue;

      // Current values (latest date)
      const latestMetric = prodMetrics[prodMetrics.length - 1];
      const regularPrice = latestMetric.regular_price;
      const salePrice = latestMetric.sale_price;
      const currentPrice = salePrice !== null ? salePrice : regularPrice;
      const stockLevel = latestMetric.stock_level;

      // Calculate Sales Velocity (Yesterday's stock - Today's stock, ignoring restocks)
      let velocity7Day = 0;
      let velocity30Day = 0;

      for (let i = 1; i < prodMetrics.length; i++) {
        const prev = prodMetrics[i - 1];
        const curr = prodMetrics[i];
        
        const depletion = prev.stock_level - curr.stock_level;
        if (depletion > 0) {
          if (curr.scrape_date >= sevenDaysAgoStr) {
            velocity7Day += depletion;
          }
          velocity30Day += depletion;
        }
      }

      const store = storeMap.get(prod.store_id);

      productAnalytics.push({
        id: prod.id,
        store_id: prod.store_id,
        store_name: store?.name || 'Unknown Store',
        variant_id: prod.variant_id,
        name: prod.name,
        size: prod.size,
        upc: prod.upc,
        first_seen_date: prod.first_seen_date,
        regular_price: regularPrice,
        sale_price: salePrice,
        current_price: currentPrice,
        stock_level: stockLevel,
        velocity_7d: velocity7Day,
        velocity_30d: velocity30Day
      });

      // Price Alerts Logic (Compare latest metric with yesterday's metric)
      if (prodMetrics.length >= 2) {
        const todayMetric = prodMetrics[prodMetrics.length - 1];
        const yesterdayMetric = prodMetrics[prodMetrics.length - 2];

        // 1. New Sale Alert: Today has a sale price that yesterday didn't, or it's lower
        const todayOnSale = todayMetric.sale_price !== null;
        const yesterdayOnSale = yesterdayMetric.sale_price !== null;
        
        if (todayOnSale) {
          const todayPrice = todayMetric.sale_price!;
          const yesterdayPrice = yesterdayOnSale ? yesterdayMetric.sale_price! : yesterdayMetric.regular_price;
          
          if (todayPrice < yesterdayPrice) {
            priceAlerts.push({
              type: 'New Sale',
              product_id: prod.id,
              name: prod.name,
              size: prod.size,
              store_name: store?.name || 'Unknown Store',
              old_price: yesterdayPrice,
              new_price: todayPrice,
              date: todayMetric.scrape_date,
              savings: parseFloat((yesterdayPrice - todayPrice).toFixed(2))
            });
          }
        } 
        
        // 2. Price Adjustment Alert: Regular price shifted
        if (todayMetric.regular_price !== yesterdayMetric.regular_price) {
          priceAlerts.push({
            type: 'Price Adjustment',
            product_id: prod.id,
            name: prod.name,
            size: prod.size,
            store_name: store?.name || 'Unknown Store',
            old_price: yesterdayMetric.regular_price,
            new_price: todayMetric.regular_price,
            date: todayMetric.scrape_date,
            savings: parseFloat((yesterdayMetric.regular_price - todayMetric.regular_price).toFixed(2))
          });
        }
      }
    }

    // 1. Top 10 Best Sellers Across All 3 Stores (sort by 30-day velocity)
    const topBestSellers = [...productAnalytics]
      .sort((a, b) => b.velocity_30d - a.velocity_30d)
      .slice(0, 10);

    // 2. New Products Added This Week (first_seen_date within last 7 days)
    const newProductsThisWeek = productAnalytics
      .filter(p => p.first_seen_date >= sevenDaysAgoStr)
      .sort((a, b) => b.first_seen_date.localeCompare(a.first_seen_date));

    // 3. Out of stock items count
    const outOfStockCount = productAnalytics.filter(p => p.stock_level === 0).length;

    res.json({
      summary: {
        total_competitors: stores.length,
        total_tracked_items: products.length,
        out_of_stock_items: outOfStockCount,
        price_alerts_today: priceAlerts.length,
        new_products_week: newProductsThisWeek.length
      },
      top_best_sellers: topBestSellers,
      recent_price_drops: priceAlerts.slice(0, 15), // Top 15 recent alerts
      new_products: newProductsThisWeek.slice(0, 15) // Top 15 new additions
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Specific Store's Catalog and Metrics
app.get('/api/store/:id', async (req, res) => {
  try {
    const storeId = parseInt(req.params.id);
    const store = await db.get<Store>('SELECT * FROM stores WHERE id = ?', [storeId]);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const sevenDaysAgoStr = getPastDateString(7);
    const thirtyDaysAgoStr = getPastDateString(30);

    // Fetch this store's products
    const products = await db.all<Product>('SELECT * FROM products WHERE store_id = ?', [storeId]);

    // Fetch daily metrics for these products over past 30 days
    const productIds = products.map(p => p.id);
    if (productIds.length === 0) {
      return res.json({ store, products: [] });
    }

    // Construct comma separated placeholders for SQLite query
    const placeholders = productIds.map(() => '?').join(',');
    const metrics = await db.all<DailyMetric>(
      `SELECT * FROM daily_metrics WHERE product_id IN (${placeholders}) AND scrape_date >= ? ORDER BY product_id, scrape_date ASC`,
      [...productIds, thirtyDaysAgoStr]
    );

    const metricsByProduct: { [productId: number]: DailyMetric[] } = {};
    for (const m of metrics) {
      if (!metricsByProduct[m.product_id]) {
        metricsByProduct[m.product_id] = [];
      }
      metricsByProduct[m.product_id].push(m);
    }

    const catalog = products.map(prod => {
      const prodMetrics = metricsByProduct[prod.id] || [];
      const latestMetric = prodMetrics[prodMetrics.length - 1] || { regular_price: 0, sale_price: null, stock_level: 0 };
      
      // Calculate sales velocity
      let velocity7Day = 0;
      let velocity30Day = 0;

      for (let i = 1; i < prodMetrics.length; i++) {
        const prev = prodMetrics[i - 1];
        const curr = prodMetrics[i];
        
        const depletion = prev.stock_level - curr.stock_level;
        if (depletion > 0) {
          if (curr.scrape_date >= sevenDaysAgoStr) {
            velocity7Day += depletion;
          }
          velocity30Day += depletion;
        }
      }

      return {
        id: prod.id,
        variant_id: prod.variant_id,
        name: prod.name,
        size: prod.size,
        upc: prod.upc,
        first_seen_date: prod.first_seen_date,
        regular_price: latestMetric.regular_price,
        sale_price: latestMetric.sale_price,
        current_price: latestMetric.sale_price !== null ? latestMetric.sale_price : latestMetric.regular_price,
        stock_level: latestMetric.stock_level,
        velocity_7d: velocity7Day,
        velocity_30d: velocity30Day,
        // Include full 30-day historical chart data
        history: prodMetrics.map(m => ({
          date: m.scrape_date,
          price: m.sale_price !== null ? m.sale_price : m.regular_price,
          stock: m.stock_level
        }))
      };
    });

    res.json({
      store,
      catalog: catalog.sort((a, b) => b.velocity_7d - a.velocity_7d) // sort by hot items first
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Trigger Manual Competitor Scrape Run
app.post('/api/scrape/trigger', async (req, res) => {
  try {
    await triggerDailyScrape();
    res.json({ success: true, message: "Competitor Intelligence Scraper ran successfully! Today's stock and price levels updated." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Configure Express + Vite middleware
async function startServer() {
  // Ensure DB is seeded and ready
  try {
    await initDatabaseAndSeedIfEmpty();
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }

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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
