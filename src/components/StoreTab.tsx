import React, { useState, useEffect } from 'react';
import { 
  Search, 
  TrendingUp, 
  ArrowDownIcon, 
  ArrowUpIcon, 
  AlertCircle, 
  CheckCircle2, 
  X,
  History,
  Barcode,
  Sparkles,
  RefreshCcw,
  Tag
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { Store, CatalogItem } from '../types';

interface StoreTabProps {
  storeId: number;
  storeName: string;
}

export default function StoreTab({ storeId, storeName }: StoreTabProps) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'sale' | 'hot' | 'oos'>('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Selected Item for deep historical tracking
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  const fetchStoreData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/store/${storeId}`);
      if (response.ok) {
        const result = await response.json();
        setStore(result.store);
        setCatalog(result.catalog);
        // Default select the top selling product to populate details view right away!
        if (result.catalog.length > 0) {
          setSelectedItem(result.catalog[0]);
        }
      }
    } catch (error) {
      console.error('Failed to retrieve competitor catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStoreData();
    setCurrentPage(1);
  }, [storeId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter]);

  // Filter Catalog
  const filteredCatalog = catalog.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.upc && item.upc.includes(searchQuery)) ||
      (item.variant_id && item.variant_id.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === 'sale') {
      return item.sale_price !== null;
    }
    if (activeFilter === 'hot') {
      return item.velocity_7d > 5;
    }
    if (activeFilter === 'oos') {
      return item.stock_level === 0;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage) || 1;
  const paginatedCatalog = filteredCatalog.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex-1 bg-slate-50 overflow-hidden flex h-screen" id={`store-tab-${storeId}`}>
      {/* Main Catalog View (Left) */}
      <div className="flex-1 flex flex-col h-full p-8 overflow-y-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{storeName} Surveillance</h2>
            {store && (
              <a 
                href={`https://${store.domain}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-xs text-indigo-600 font-mono font-bold hover:underline inline-flex items-center gap-1.5 mt-1"
              >
                <span>Target Host: {store.domain}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-400">Sitemap Engine: Active</span>
              </a>
            )}
          </div>
          <button 
            onClick={fetchStoreData}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium border border-slate-200 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all active:scale-98"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Re-pull Catalog</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search catalog by name, volume, UPC, or variant id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 transition-all font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-2 rounded-lg text-4xs font-mono font-bold uppercase transition-all cursor-pointer ${activeFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              All SKUs ({catalog.length})
            </button>
            <button
              onClick={() => setActiveFilter('sale')}
              className={`px-3 py-2 rounded-lg text-4xs font-mono font-bold uppercase transition-all cursor-pointer ${activeFilter === 'sale' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Promotions ({catalog.filter(i => i.sale_price !== null).length})
            </button>
            <button
              onClick={() => setActiveFilter('hot')}
              className={`px-3 py-2 rounded-lg text-4xs font-mono font-bold uppercase transition-all cursor-pointer ${activeFilter === 'hot' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Hot Items ({catalog.filter(i => i.velocity_7d > 5).length})
            </button>
            <button
              onClick={() => setActiveFilter('oos')}
              className={`px-3 py-2 rounded-lg text-4xs font-mono font-bold uppercase transition-all cursor-pointer ${activeFilter === 'oos' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Out Of Stock ({catalog.filter(i => i.stock_level === 0).length})
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <RefreshCcw className="h-8 w-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center flex flex-col items-center">
            <AlertCircle className="h-10 w-10 text-slate-400 mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">No Matched Competitor Stock</h3>
            <p className="text-xs text-slate-400 mt-1">Adjust search parameters or clear filters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 font-mono text-4xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-6">Product Details</th>
                    <th className="py-3 px-6 text-right">Size</th>
                    <th className="py-3 px-6 text-right">UPC Barcode</th>
                    <th className="py-3 px-6 text-right">Price Point</th>
                    <th className="py-3 px-6 text-right">Stock Level</th>
                    <th className="py-3 px-6 text-right font-bold text-indigo-600">Velocity (7D / 30D)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCatalog.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    const isOOS = item.stock_level === 0;
                    
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-50/25 border-l-4 border-indigo-600' : ''}`}
                      >
                        <td className="py-3.5 px-6">
                          <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight">
                            {item.name}
                          </div>
                          <div className="flex items-center space-x-1.5 mt-1 text-4xs font-mono text-slate-400">
                            <span>V-ID: {item.variant_id}</span>
                            <span>•</span>
                            <span className="font-semibold text-emerald-600">Active Monitor</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right text-xs font-medium text-slate-600 font-mono">
                          {item.size || '750ml'}
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono text-4xs text-slate-500">
                          {item.upc || 'N/A'}
                        </td>
                        <td className="py-3.5 px-6 text-right text-xs font-mono font-semibold text-slate-700">
                          {item.sale_price !== null ? (
                            <div className="flex flex-col items-end">
                              <span className="text-rose-600 font-bold">${item.sale_price}</span>
                              <span className="text-4xs line-through text-slate-400">${item.regular_price}</span>
                            </div>
                          ) : (
                            <span>${item.regular_price}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {isOOS ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-4xs font-mono font-medium bg-red-50 text-red-600">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                                <span>Out of Stock</span>
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-4xs font-mono font-medium ${item.stock_level < 5 ? 'bg-amber-50 text-amber-600 font-semibold' : 'bg-slate-100 text-slate-600'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${item.stock_level < 5 ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                <span>{item.stock_level} units</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right text-xs font-mono font-bold text-indigo-600">
                          {item.velocity_7d} units / <span className="text-slate-500 font-medium">{item.velocity_30d} units</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <span className="text-3xs font-mono text-slate-500">
                Showing <strong className="text-slate-700">{Math.min(filteredCatalog.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredCatalog.length, currentPage * itemsPerPage)}</strong> of <strong className="text-slate-700">{filteredCatalog.length}</strong> monitored products
              </span>
              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white text-4xs font-bold font-mono uppercase rounded-lg cursor-pointer transition-colors"
                >
                  First
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white text-4xs font-bold font-mono uppercase rounded-lg cursor-pointer transition-colors"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-4xs font-bold font-mono text-slate-600 bg-slate-100/85 rounded-lg border border-slate-200/50">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white text-4xs font-bold font-mono uppercase rounded-lg cursor-pointer transition-colors"
                >
                  Next
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white text-4xs font-bold font-mono uppercase rounded-lg cursor-pointer transition-colors"
                >
                  Last
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Historical Stock & Price Analytics Drawer (Right) */}
      <div className="w-96 border-l border-slate-200 bg-white flex flex-col h-full shadow-lg" id="details-drawer">
        {selectedItem ? (
          <div className="h-full flex flex-col justify-between overflow-y-auto">
            
            {/* Drawer Title */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-4xs font-mono font-bold uppercase tracking-wider">
                    Competitor Intel
                  </span>
                  <h3 className="text-sm font-bold text-slate-800 mt-2 leading-snug">{selectedItem.name}</h3>
                  <p className="text-3xs text-slate-400 font-mono mt-0.5">Size: {selectedItem.size || '750ml'}</p>
                </div>
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Metadata Badges */}
            <div className="px-6 py-4 border-b border-slate-100/60 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between text-2xs">
                <span className="text-slate-400 font-medium font-mono">UPC Barcode</span>
                <span className="font-mono font-bold text-slate-700 flex items-center gap-1">
                  <Barcode className="h-3 w-3 text-slate-400" />
                  {selectedItem.upc || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between text-2xs">
                <span className="text-slate-400 font-medium font-mono">CityHive SKU</span>
                <span className="font-mono font-bold text-slate-700">{selectedItem.variant_id}</span>
              </div>
              <div className="flex items-center justify-between text-2xs">
                <span className="text-slate-400 font-medium font-mono">First Tracked</span>
                <span className="font-mono font-bold text-slate-700">{selectedItem.first_seen_date}</span>
              </div>
            </div>

            {/* Real-time Intel Stats */}
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <span className="text-4xs font-mono font-bold uppercase text-slate-400 tracking-wider">Current Stock</span>
                <div className="flex items-center space-x-1.5 mt-1">
                  <span className={`text-base font-bold font-mono ${selectedItem.stock_level === 0 ? 'text-red-500' : 'text-slate-800'}`}>
                    {selectedItem.stock_level} units
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <span className="text-4xs font-mono font-bold uppercase text-slate-400 tracking-wider">30-Day Velocity</span>
                <div className="flex items-center space-x-1.5 mt-1">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  <span className="text-base font-bold font-mono text-indigo-600">
                    {selectedItem.velocity_30d} sold
                  </span>
                </div>
              </div>
            </div>

            {/* Price Trend Chart (30-day History) */}
            <div className="px-6 flex-1 flex flex-col justify-between">
              
              {/* Chart 1: Stock Level Curve */}
              <div className="flex-1 flex flex-col justify-between mb-4">
                <div className="mb-2">
                  <h4 className="text-2xs font-bold text-slate-800 uppercase tracking-wider font-mono">Stock Depletion Curve</h4>
                  <p className="text-4xs text-slate-400">Verifying sales velocity & shipping restocking cycles</p>
                </div>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedItem.history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" hide />
                      <YAxis stroke="#94a3b8" fontSize={9} width={18} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px' }}
                      />
                      <Bar dataKey="stock" fill="#818cf8" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Price Trend Curve */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="mb-2">
                  <h4 className="text-2xs font-bold text-slate-800 uppercase tracking-wider font-mono">Pricing History</h4>
                  <p className="text-4xs text-slate-400">Fluctuations, promo discounts and price drops</p>
                </div>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedItem.history}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" hide />
                      <YAxis stroke="#94a3b8" fontSize={9} width={22} domain={['dataMin - 2', 'dataMax + 2']} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px' }}
                      />
                      <Area type="monotone" dataKey="price" stroke="#10b981" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* Bottom Panel */}
            <div className="p-6 bg-slate-50 mt-4 border-t border-slate-100">
              <div className="flex items-center space-x-2 text-3xs text-slate-400 leading-relaxed">
                <History className="h-4 w-4 text-slate-400 shrink-0" />
                <span>
                  Pricing alerts and catalog depletions are aggregated automatically. Target sitemaps are parsed on a rolling 24h cron sequence.
                </span>
              </div>
            </div>

          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <History className="h-8 w-8 text-slate-300 mb-2 animate-pulse" />
            <h4 className="text-xs font-bold text-slate-700">Detailed Analytics Feed</h4>
            <p className="text-3xs text-slate-400 max-w-[200px] mt-1 leading-normal">
              Select any item in the inventory ledger to display 30-day price trends and stock depletion curves.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
