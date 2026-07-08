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
  ArrowUpDown,
  Plus,
  Trash2,
  Globe,
  FileCode,
  X
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

interface ScraperState {
  isRunning: boolean;
  logs: string[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'global' | number>('global');
  const [stats, setStats] = useState<Stats>({ stores: 0, products: 0, onSale: 0, outOfStock: 0 });
  const [velocity, setVelocity] = useState<VelocityItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState('');
  
  // Scraper states per key (storeId or 'global')
  const [scrapingStates, setScrapingStates] = useState<Record<string | number, ScraperState>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Add Store Modal State
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreDomain, setNewStoreDomain] = useState('');
  const [newStoreSitemap, setNewStoreSitemap] = useState('');
  const [isSubmittingStore, setIsSubmittingStore] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Sorting state
  const [sortField, setSortField] = useState<string>('product');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Fetch summary and stores on mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Poll scraper logs for the currently active tab if running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const currentStatus = scrapingStates[activeTab] || { isRunning: false, logs: [] };

    // We fetch immediately, and poll if it is marked as running or if we don't have its state yet
    const shouldPoll = currentStatus.isRunning || scrapingStates[activeTab] === undefined;

    const pollStatus = async () => {
      try {
        const param = activeTab === 'global' ? 'global' : activeTab;
        const res = await fetch(`/api/scraper/status?storeId=${param}`);
        const data = await res.json();
        if (data.success) {
          setScrapingStates(prev => ({
            ...prev,
            [activeTab]: { isRunning: data.isRunning, logs: data.logs }
          }));
          
          // If it transitions from running to finished, reload data
          if (currentStatus.isRunning && !data.isRunning) {
            fetchInitialData();
          }
        }
      } catch (err) {
        console.error('Error fetching scraper status:', err);
      }
    };

    if (shouldPoll) {
      pollStatus();
      interval = setInterval(pollStatus, 1500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, scrapingStates[activeTab]?.isRunning]);

  // Fetch catalog whenever active tab or search term changes
  useEffect(() => {
    fetchCatalog();
  }, [activeTab, search]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrapingStates[activeTab]?.logs]);

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

      // 3. Fetch status for current active tab
      const param = activeTab === 'global' ? 'global' : activeTab;
      const statusRes = await fetch(`/api/scraper/status?storeId=${param}`);
      const statusData = await statusRes.json();
      if (statusData.success) {
        setScrapingStates(prev => ({
          ...prev,
          [activeTab]: { isRunning: statusData.isRunning, logs: statusData.logs || [] }
        }));
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

  const handleRunScraperForStore = async (storeId: number | 'global') => {
    try {
      const res = await fetch('/api/scraper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId })
      });
      const data = await res.json();
      if (data.success) {
        setScrapingStates(prev => ({
          ...prev,
          [storeId]: { isRunning: true, logs: [`[${new Date().toLocaleTimeString()}] Scraper triggered...`] }
        }));
      } else {
        alert(`Failed to start scraper: ${data.error}`);
      }
    } catch (err) {
      alert('Error starting scraper process');
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName || !newStoreDomain || !newStoreSitemap) {
      alert('Please fill out all fields');
      return;
    }

    try {
      setIsSubmittingStore(true);
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStoreName,
          domain: newStoreDomain.trim().replace(/^https?:\/\//i, ''),
          sitemap_url: newStoreSitemap.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAddStoreOpen(false);
        setNewStoreName('');
        setNewStoreDomain('');
        setNewStoreSitemap('');
        await fetchInitialData();
      } else {
        alert(`Failed to add store: ${data.error}`);
      }
    } catch (err) {
      alert('Error adding store to database');
    } finally {
      setIsSubmittingStore(false);
    }
  };

  const handleDeleteStore = async (storeId: number) => {
    const storeName = stores.find(s => s.id === storeId)?.name || 'this competitor';
    if (!window.confirm(`Are you sure you want to delete ${storeName}? This will permanently remove all of its scraped products and historical metrics.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/stores/${storeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setActiveTab('global');
        await fetchInitialData();
      } else {
        alert(`Failed to delete store: ${data.error}`);
      }
    } catch (err) {
      alert('Error deleting competitor store');
    }
  };

  const handleResetDb = async () => {
    if (!window.confirm('Are you sure you want to re-seed and reset the stores database? This will revert default competitor domains and wipe custom metrics.')) {
      return;
    }
    try {
      const res = await fetch('/api/database/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Database reset and re-seeded successfully!');
        setActiveTab('global');
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

  const activeStore = stores.find(s => s.id === activeTab);
  const activeScraper = scrapingStates[activeTab] || { isRunning: false, logs: [] };

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
              disabled={isRefreshing}
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        
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
            <div className="flex flex-wrap items-center gap-1.5">
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
              <button
                onClick={() => setIsAddStoreOpen(true)}
                className="px-3.5 py-2 text-xs font-bold rounded-lg border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-all flex items-center gap-1.5 ml-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Competitor
              </button>
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
            
            {/* Store Information / Actions bar */}
            {activeTab !== 'global' && activeStore && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{activeStore.name}</h4>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-slate-400" /> 
                      Website: <a href={`https://${activeStore.domain}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono">{activeStore.domain}</a>
                    </span>
                    <span className="flex items-center gap-1">
                      <FileCode className="w-3.5 h-3.5 text-slate-400" /> 
                      Sitemap: <a href={activeStore.sitemap_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono">{activeStore.sitemap_url}</a>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunScraperForStore(activeStore.id)}
                    disabled={activeScraper.isRunning}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-md ${
                      activeScraper.isRunning
                        ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-amber-400 hover:bg-amber-300 text-slate-950 active:scale-95'
                    }`}
                  >
                    {activeScraper.isRunning ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        Crawling...
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        Run Crawler
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteStore(activeStore.id)}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Store
                  </button>
                </div>
              </div>
            )}

            {/* Active Crawl Log Panel */}
            <AnimatePresence>
              {activeScraper.isRunning && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl shadow-xl p-4 mb-6 font-mono text-xs overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span className="font-semibold text-slate-200">
                        {activeTab === 'global' ? 'Global Scraper' : activeStore?.name} Live Logs
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-[10px] text-slate-400 font-sans">Playwright Browser Instance (Chrome)</span>
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-2 scrollbar-thin">
                    {activeScraper.logs.length === 0 ? (
                      <div className="text-slate-600 italic">Initializing Playwright headless browser...</div>
                    ) : (
                      activeScraper.logs.map((log, i) => (
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
                        We couldn't find any products matching your active criteria. If you haven't populated the database yet, click "Run Crawler" above to scrape this store's real-time catalog.
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
                              First Scraped <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {getSortedCatalog().map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-800">{item.product}</div>
                                {item.salePrice && (
                                  <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md mt-1 border border-emerald-100">
                                    <Percent className="w-2.5 h-2.5" /> ON SALE
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-500">{item.size || 'N/A'}</td>
                              <td className="py-3.5 px-4 font-mono text-slate-400 text-[10px]">{item.upc || '—'}</td>
                              <td className="py-3.5 px-4 text-right">
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
                              <td className="py-3.5 px-4 text-center">
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
                              <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[10px]">
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

      {/* Elegant Add Store Modal */}
      <AnimatePresence>
        {isAddStoreOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddStoreOpen(false)}
              className="absolute inset-0 bg-slate-950"
            />
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Add Competitor Store</h3>
                </div>
                <button
                  onClick={() => setIsAddStoreOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddStore} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Store Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vintage Wines & Spirits"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg px-3 py-2 text-xs focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Website Domain</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. vintagewines.com"
                    value={newStoreDomain}
                    onChange={(e) => setNewStoreDomain(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg px-3 py-2 text-xs focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sitemap URL</label>
                  <input
                    type="url"
                    required
                    placeholder="e.g. https://vintagewines.com/sitemap.xml"
                    value={newStoreSitemap}
                    onChange={(e) => setNewStoreSitemap(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-lg px-3 py-2 text-xs focus:bg-white focus:outline-none transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                    Sitemaps contain all of the product URLs. Eagle Eye will load this sitemap via Playwright to discover products.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddStoreOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingStore}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {isSubmittingStore ? 'Adding...' : 'Save Competitor'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
