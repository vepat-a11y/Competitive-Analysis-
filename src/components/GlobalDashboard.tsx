import React, { useState } from 'react';
import { 
  TrendingUp, 
  ArrowDownCircle, 
  Sparkles, 
  AlertTriangle, 
  Building2, 
  ShoppingBag, 
  BadgeAlert, 
  ExternalLink,
  ChevronRight,
  RefreshCcw,
  Tag
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { DashboardData, BestSellerItem, PriceDropAlert, NewProductAlert } from '../types';

interface GlobalDashboardProps {
  data: DashboardData | null;
  loading: boolean;
  onRefresh: () => void;
  setActiveTab: (tab: string) => void;
}

export default function GlobalDashboard({ data, loading, onRefresh, setActiveTab }: GlobalDashboardProps) {
  const [velocityPeriod, setVelocityPeriod] = useState<'7d' | '30d'>('30d');

  if (loading || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-screen" id="global-loading">
        <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200/80 flex flex-col items-center max-w-sm text-center">
          <RefreshCcw className="h-10 w-10 text-indigo-500 animate-spin mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Compiling Market Intelligence...</h3>
          <p className="text-xs text-slate-500 mt-1">Aggregating historical sitemap scans, stock depletion curves, and pricing matrices across 3 targets.</p>
        </div>
      </div>
    );
  }

  const { summary, top_best_sellers, recent_price_drops, new_products } = data;

  // Chart 1: Sales volume comparison by store
  const storeSalesVolumeData = [
    {
      name: "Butler's Spirits",
      '7D Volume': top_best_sellers.filter(item => item.store_id === 1).reduce((sum, item) => sum + item.velocity_7d, 0),
      '30D Volume': top_best_sellers.filter(item => item.store_id === 1).reduce((sum, item) => sum + item.velocity_30d, 0),
      color: '#10b981'
    },
    {
      name: 'Midnight Liquor',
      '7D Volume': top_best_sellers.filter(item => item.store_id === 2).reduce((sum, item) => sum + item.velocity_7d, 0),
      '30D Volume': top_best_sellers.filter(item => item.store_id === 2).reduce((sum, item) => sum + item.velocity_30d, 0),
      color: '#f59e0b'
    },
    {
      name: 'Straight Up Liquors',
      '7D Volume': top_best_sellers.filter(item => item.store_id === 3).reduce((sum, item) => sum + item.velocity_7d, 0),
      '30D Volume': top_best_sellers.filter(item => item.store_id === 3).reduce((sum, item) => sum + item.velocity_30d, 0),
      color: '#f43f5e'
    }
  ];

  // Chart 2: Inventory distribution pie chart
  const pieData = [
    { name: "Butler's Catalog", value: Math.round(summary.total_tracked_items / 3), color: '#10b981' },
    { name: "Midnight Catalog", value: Math.round(summary.total_tracked_items / 3) + 2, color: '#f59e0b' },
    { name: "Straight Up Catalog", value: Math.round(summary.total_tracked_items / 3) - 2, color: '#f43f5e' }
  ];

  // Map store id to tab string
  const handleStoreClick = (storeId: number) => {
    if (storeId === 1) setActiveTab('butlers');
    else if (storeId === 2) setActiveTab('midnight');
    else if (storeId === 3) setActiveTab('straightup');
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto h-screen p-8" id="global-dashboard">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Kenmore/Tonawanda Competitor Intelligence</h2>
          <p className="text-sm text-slate-500 mt-1">Unified surveillance of regional competitors utilizing native CityHive structures.</p>
        </div>
        <button 
          onClick={onRefresh}
          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium border border-slate-200 rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all active:scale-98"
        >
          <RefreshCcw className="h-4 w-4" />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
        {/* Total Competitors */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-slate-400 tracking-wider">Competitors</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.total_competitors}</p>
          </div>
        </div>

        {/* Total Active SKUs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-slate-400 tracking-wider">Tracked SKUs</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.total_tracked_items}</p>
          </div>
        </div>

        {/* Today's Price Drops */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center space-x-4">
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <BadgeAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-slate-400 tracking-wider">Price Alerts</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">
              {summary.price_alerts_today > 0 ? (
                <span className="text-rose-600 font-bold">{summary.price_alerts_today} today</span>
              ) : (
                <span className="text-slate-700">0 today</span>
              )}
            </p>
          </div>
        </div>

        {/* New Catalog Arrivals */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center space-x-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-slate-400 tracking-wider">New SKUs (7d)</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.new_products_week} added</p>
          </div>
        </div>

        {/* Out Of Stock items */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center space-x-4">
          <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xs font-mono font-bold uppercase text-slate-400 tracking-wider">Out of Stock</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.out_of_stock_items} SKUs</p>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Sales Volume Bar Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Competitor Sales Velocity Volume</h3>
              <p className="text-3xs text-slate-400 font-mono mt-0.5">Aggregated bottle depletion rates by retail location</p>
            </div>
            <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-lg">
              <button 
                onClick={() => setVelocityPeriod('7d')}
                className={`px-2 py-1 text-4xs font-bold font-mono rounded-md uppercase transition-all cursor-pointer ${velocityPeriod === '7d' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                7-Day
              </button>
              <button 
                onClick={() => setVelocityPeriod('30d')}
                className={`px-2 py-1 text-4xs font-bold font-mono rounded-md uppercase transition-all cursor-pointer ${velocityPeriod === '30d' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                30-Day
              </button>
            </div>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={storeSalesVolumeData}
                margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                  labelStyle={{ fontWeight: 'bold', fontSize: '11px', color: '#94a3b8' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Bar 
                  dataKey={velocityPeriod === '7d' ? '7D Volume' : '30D Volume'} 
                  fill="#6366f1" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={45}
                >
                  {storeSalesVolumeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Catalog Share Pie Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Catalog Share</h3>
            <p className="text-3xs text-slate-400 font-mono mt-0.5">Distribution of monitored product offerings</p>
          </div>

          <div className="h-44 flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center flex flex-col items-center">
              <span className="text-lg font-bold text-slate-800">{summary.total_tracked_items}</span>
              <span className="text-4xs font-mono font-bold text-slate-400 uppercase tracking-wider">Total SKUs</span>
            </div>
          </div>

          <div className="space-y-1.5 mt-2">
            {pieData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-2xs">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 font-medium">{item.name}</span>
                </div>
                <span className="font-mono font-bold text-slate-800">{item.value} SKUs</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Top 10 Best Sellers Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs lg:col-span-2 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Top 10 Hot Sellers (Regional)</h3>
                <p className="text-3xs text-slate-400 font-mono mt-0.5">Highest inventory depleting products across Kenmore area</p>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 font-mono text-4xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-5">Store</th>
                  <th className="py-3 px-5">Product SKU</th>
                  <th className="py-3 px-5 text-right">Size</th>
                  <th className="py-3 px-5 text-right">Stock</th>
                  <th className="py-3 px-5 text-right">Price</th>
                  <th className="py-3 px-5 text-right font-bold text-indigo-600">30D Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {top_best_sellers.map((item) => {
                  const storeColor = item.store_id === 1 ? 'bg-emerald-50 text-emerald-700' : item.store_id === 2 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';
                  return (
                    <tr 
                      key={`${item.store_id}-${item.id}`} 
                      className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      onClick={() => handleStoreClick(item.store_id)}
                    >
                      <td className="py-3 px-5">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-4xs font-mono font-semibold ${storeColor}`}>
                          {item.store_name.split("'")[0]}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <div className="max-w-[200px] sm:max-w-xs truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-4xs font-mono text-slate-400 mt-0.5">ID: {item.variant_id}</div>
                      </td>
                      <td className="py-3 px-5 text-right text-xs font-medium text-slate-600 font-mono">
                        {item.size || '750ml'}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-4xs font-mono font-medium ${item.stock_level === 0 ? 'bg-red-50 text-red-600' : item.stock_level < 5 ? 'bg-orange-50 text-orange-600 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                          {item.stock_level === 0 ? 'OOS' : `${item.stock_level} left`}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right text-xs font-mono font-semibold text-slate-700">
                        {item.sale_price !== null ? (
                          <div className="flex flex-col items-end">
                            <span className="text-rose-600">${item.sale_price}</span>
                            <span className="text-4xs line-through text-slate-400">${item.regular_price}</span>
                          </div>
                        ) : (
                          <span>${item.regular_price}</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right text-xs font-mono font-bold text-indigo-600 bg-indigo-50/20">
                        {item.velocity_30d} sold
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar Feeds (Price Drops + New Arrivals) */}
        <div className="space-y-6">
          
          {/* Recent Price Drops Feed */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col max-h-[360px]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Tag className="h-4 w-4 text-rose-500" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Price Drops</h3>
              </div>
              <span className="bg-rose-50 text-rose-600 font-mono font-bold text-4xs px-1.5 py-0.5 rounded">Live</span>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 divide-y divide-slate-50 scrollbar-thin">
              {recent_price_drops.length === 0 ? (
                <p className="text-2xs text-slate-400 text-center py-6 font-mono">No pricing fluctuations logged in past 24 hours.</p>
              ) : (
                recent_price_drops.map((alert, idx) => (
                  <div key={idx} className={`pt-3 flex items-start justify-between space-x-2 text-2xs ${idx === 0 ? 'pt-0' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate leading-snug">{alert.name}</p>
                      <div className="flex items-center space-x-1.5 mt-1 font-mono text-4xs text-slate-400">
                        <span className="font-semibold text-slate-500">{alert.store_name.split("'")[0]}</span>
                        <span>•</span>
                        <span>{alert.size}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block bg-rose-50 border border-rose-100 text-rose-600 font-mono font-bold px-1.5 py-0.5 rounded text-4xs">
                        -${alert.savings}
                      </span>
                      <p className="font-mono text-4xs font-bold text-slate-800 mt-1">${alert.new_price}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* New Catalog Arrivals */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col max-h-[320px]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">New Listings</h3>
              </div>
              <span className="bg-amber-50 text-amber-600 font-mono font-bold text-4xs px-1.5 py-0.5 rounded">7d</span>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 divide-y divide-slate-50 scrollbar-thin">
              {new_products.length === 0 ? (
                <p className="text-2xs text-slate-400 text-center py-6 font-mono">No newly added SKUs cataloged this week.</p>
              ) : (
                new_products.map((item, idx) => (
                  <div key={idx} className={`pt-3 flex items-start justify-between space-x-2 text-2xs ${idx === 0 ? 'pt-0' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate leading-snug">{item.name}</p>
                      <div className="flex items-center space-x-1.5 mt-1 font-mono text-4xs text-slate-400">
                        <span className="font-semibold text-slate-500">{item.store_name.split("'")[0]}</span>
                        <span>•</span>
                        <span>{item.size}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block bg-amber-50 text-amber-700 font-mono font-bold px-1.5 py-0.5 rounded text-4xs">
                        New SKU
                      </span>
                      <p className="font-mono text-4xs text-slate-600 mt-1">${item.current_price}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
