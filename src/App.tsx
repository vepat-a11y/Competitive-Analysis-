import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  ShoppingBag, 
  Percent, 
  AlertCircle, 
  Search, 
  Play, 
  RotateCw, 
  Database, 
  TrendingUp, 
  CheckCircle2, 
  Terminal, 
  Info,
  Calendar,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Stats {
  stores: number;
  products: number;
  onSale: number;
  outOfStock: number;
}

interface VelocityItem {
  store: string;
  product: string;
  size: string;
  price: number;
  salePrice: number | null;
  currentStock: number;
  unitsSold: number;
}

interface CatalogItem {
  id: number;
  product: string;
  size: string;
  upc: string | null;
  price: number | null;
  salePrice: number | null;
  stock: number | null;
  addedOn: string;
  storeName: string;
}

interface Store {
  id: number;
  name: string;
  domain: string;
  sitemap_url: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'global' | number>('global');
  const [stats, setStats] = useState<Stats>({ stores: 0, products: 0, onSale: 0, outOfStock: 0 });
  const [velocity, setVelocity] = useState<VelocityItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState('');
  
  // Scraper status & logs state
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const logEndRef = useRef<HTMLDivElement>(null);

  // Sorting state
  const [sortField, setSortField] = useState<string>('product');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Fetch summary and stores on mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Poll scraper logs if running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isScraping) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/scraper/status');
          const data = await res.json();
          if (data.success) {
            setIsScraping(data.isRunning);
            setLogs(data.logs);
            // If it just stopped, refresh data
            if (!data.isRunning) {
              fetchInitialData();
            }
          }
        } catch (err) {
          console.error('Error fetching scraper status:', err);
        }
      }, 1500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScraping]);

  // Fetch catalog whenever active tab, search term, or scraper status changes
  useEffect(() => {
    fetchCatalog();
  }, [activeTab, search]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      
      // 1. Fetch dashboard summaries
      const summaryRes = await fetch('/api/dashboard');
      const summaryData = await summaryRes.json();
      if (summaryData.success) {
        setStats(summaryData.stats);
        setVelocity(summaryData.velocity || []);
      }

      // 2. Fetch stores
      const storesRes = await fetch('/api/stores');
      const storesData = await storesRes.json();
      if (storesData.success) {
        setStores(storesData.stores || []);
      }

      // 3. Fetch current status of scraper
      const statusRes = await fetch('/api/scraper/status');
      const statusData = await statusRes.json();
      if (statusData.success) {
        setIsScraping(statusData.isRunning);
        setLogs(statusData.logs || []);
      }

      await fetchCatalog();
    } catch (err) {
      console.error('Error loading initial dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCatalog = async () => {
    try {
      let url = '/api/catalog';
      const params = new URLSearchParams();
      
      if (activeTab !== 'global') {
        params.append('storeId', String(activeTab));
      }
      if (search.trim()) {
        params.append('search', search.trim());
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCatalog(data.catalog || []);
      }
    } catch (err) {
      console.error('Error fetching catalog data:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchInitialData();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleRunScraper = async () => {
    try {
      const res = await fetch('/api/scraper/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsScraping(true);
        setLogs([`[${new Date().toLocaleTimeString()}] Scraper process triggered...`]);
      } else {
        alert(`Failed to start scraper: ${data.error}`);
      }
    } catch (err) {
      alert('Error starting scraper process');
    }
  };

  const handleResetDb = async () => {
    if (!window.confirm('Are you sure you want to re-seed and reset the stores database? This will clear daily metrics.')) {
      return;
    }
    try {
      const res = await fetch('/api/database/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Database re-seeded successfully!');
        fetchInitialData();
      } else {
        alert(`Error: ${data.output}`);
      }
    } catch (err) {
      alert('Error resetting database');
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getSortedCatalog = () => {
    const sorted = [...catalog];
    sorted.sort((a, b) => {
      let valA: any = a[sortField as keyof CatalogItem];
      let valB: any = b[sortField as keyof CatalogItem];

      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortAsc ? valA - valB : valB - valA;
      }
    });
    return sorted;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Header */}
      <header className="bg-slate-900 text-white py-6 px-8 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 rounded-xl shadow-lg shadow-amber-500/20">
              <Building2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
                Eagle Eye <span className="text-amber-400 font-medium text-sm px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700/50">Competitor Intel</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Real-time store catalog monitoring and sales velocity index</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isScraping}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-700 hover:bg-slate-800 transition-all ${
                isRefreshing ? 'animate-spin opacity-50' : ''
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              Sync Dashboard
            </button>
            <button
              onClick={handleResetDb}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-all"
            >
              <Database className="w-3.5 h-3.5" />
              Reset DB
            </button>
            <button
              onClick={handleRunScraper}
              disabled={isScraping}
              className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-lg text-slate-950 transition-all shadow-lg shadow-amber-500/10 ${
                isScraping 
                  ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed' 
                  : 'bg-amber-400 hover:bg-amber-300 active:scale-95'
              }`}
            >
              {isScraping ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Run Crawler
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        
        {/* Scraper Live Monitor Panel */}
        <AnimatePresence>
          {isScraping && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl shadow-2xl p-4 mb-8 font-mono text-xs overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="font-semibold text-slate-200">Active Scraping Session Logs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[10px] text-slate-400">Headless Playwright Crawler (Chrome)</span>
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1 pr-2 scrollbar-thin">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic">Initializing Playwright scraper instance...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="leading-relaxed">
                      <span className="text-slate-500 select-none">[{i+1}]</span> {log}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[
            { label: 'Monitored Stores', value: stats.stores, icon: Building2, color: 'text-blue-600 bg-blue-50 border-blue-100' },
            { label: 'Unique Products', value: stats.products, icon: ShoppingBag, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
            { label: 'On Sale Today', value: stats.onSale, icon: Percent, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'Out of Stock Items', value: stats.outOfStock, icon: AlertCircle, color: 'text-rose-600 bg-rose-50 border-rose-100' },
          ].map((card, i) => (
            <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{card.label}</p>
                <h3 className="text-2xl font-bold font-display text-slate-900 mt-1">{card.value}</h3>
              </div>
              <div className={`p-3 rounded-xl border ${card.color}`}>
                <card.icon className="w-5 h-5 stroke-[2.2]" />
              </div>
            </div>
          ))}
        </section>

        {/* Catalog Navigation Tabs */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setActiveTab('global'); setSearch(''); }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'global'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                🌎 Global Market
              </button>
              {stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => { setActiveTab(store.id); setSearch(''); }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === store.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {store.name.split("'")[0].split(' ')[0]} Catalog
                </button>
              ))}
            </div>

            {/* Filter Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search catalog products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              {activeTab === 'global' ? (
                <motion.div
                  key="global"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Top Selling Items (Past 24 Hours)</h3>
                  </div>

                  {velocity.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-8 text-center border border-slate-150 text-slate-500 max-w-xl mx-auto my-8">
                      <Info className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                      <h4 className="font-semibold text-slate-800 text-sm">Waiting for Sales Velocity Data</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Top-selling items are calculated by tracking changes in inventory level over consecutive daily crawls (Yesterday's stock - Today's stock). Run the crawler on multiple days to populate velocity logs.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                            <th className="py-3 px-4">Store</th>
                            <th className="py-3 px-4">Product Name</th>
                            <th className="py-3 px-4">Size</th>
                            <th className="py-3 px-4 text-right">Price</th>
                            <th className="py-3 px-4 text-center">Stock Level</th>
                            <th className="py-3 px-4 text-center text-amber-600 font-bold">Units Sold (24h)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {velocity.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-4 font-medium text-slate-900">{item.store}</td>
                              <td className="py-3.5 px-4 text-slate-700 font-medium">{item.product}</td>
                              <td className="py-3.5 px-4 text-slate-500 font-mono">{item.size || 'N/A'}</td>
                              <td className="py-3.5 px-4 text-right">
                                {item.salePrice ? (
                                  <div>
                                    <span className="text-emerald-600 font-semibold">${item.salePrice.toFixed(2)}</span>
                                    <span className="text-slate-400 line-through text-[10px] ml-1.5">${item.price.toFixed(2)}</span>
                                  </div>
                                ) : (
                                  <span className="font-semibold text-slate-800">${item.price.toFixed(2)}</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  item.currentStock === 0 
                                    ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {item.currentStock} in stock
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg text-xs">
                                  +{item.unitsSold}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="catalog"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Monitored Products</p>
                      <h4 className="text-lg font-bold text-slate-800 mt-1">{catalog.length} Items</h4>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Items Currently on Sale</p>
                      <h4 className="text-lg font-bold text-emerald-600 mt-1">
                        {catalog.filter(p => p.salePrice !== null).length} Items
                      </h4>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Out of Stock Warnings</p>
                      <h4 className="text-lg font-bold text-rose-600 mt-1">
                        {catalog.filter(p => p.stock === 0).length} Items
                      </h4>
                    </div>
                  </div>

                  {catalog.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-12 text-center border border-slate-150 text-slate-500 max-w-xl mx-auto my-6">
                      <Search className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                      <h4 className="font-semibold text-slate-800 text-sm">No Matching Catalog Items</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        We couldn't find any products matching your active criteria. If you haven't populated the database yet, run the scraper first.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                            <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('product')}>
                              Product Name <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                            <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('size')}>
                              Size <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                            <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('upc')}>
                              UPC/Barcode <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                            <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-800" onClick={() => handleSort('price')}>
                              Price <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                            <th className="py-3 px-4 text-center cursor-pointer hover:text-slate-800" onClick={() => handleSort('stock')}>
                              Stock Level <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                            <th className="py-3 px-4 text-center cursor-pointer hover:text-slate-800" onClick={() => handleSort('addedOn')}>
                              Added On <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {getSortedCatalog().map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-800">{item.product}</div>
                                {item.salePrice && (
                                  <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md mt-1 border border-emerald-100">
                                    <Percent className="w-2.5 h-2.5" /> ON SALE
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-500">{item.size || 'N/A'}</td>
                              <td className="py-3 px-4 font-mono text-slate-400 text-[10px]">{item.upc || '—'}</td>
                              <td className="py-3 px-4 text-right">
                                {item.salePrice ? (
                                  <div>
                                    <span className="text-emerald-600 font-bold">${item.salePrice.toFixed(2)}</span>
                                    <span className="text-slate-400 line-through text-[10px] ml-1.5">
                                      ${item.price?.toFixed(2)}
                                    </span>
                                  </div>
                                ) : item.price ? (
                                  <span className="font-bold text-slate-800">${item.price.toFixed(2)}</span>
                                ) : (
                                  <span className="text-slate-400 italic">No price data</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  item.stock === 0
                                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                    : item.stock !== null && item.stock < 10
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {item.stock === null ? '—' : `${item.stock} in stock`}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center text-slate-400 font-mono text-[10px]">
                                {item.addedOn}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}
