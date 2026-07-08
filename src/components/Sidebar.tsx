import React from 'react';
import { Home, Wine, Moon, GlassWater, RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTriggerScrape: () => void;
  isScraping: boolean;
}

export default function Sidebar({ activeTab, setActiveTab, onTriggerScrape, isScraping }: SidebarProps) {
  const menuItems = [
    { id: 'global', name: 'Global Dashboard', icon: Home, color: 'text-indigo-600 bg-indigo-50 border-indigo-600' },
    { id: 'butlers', name: "Butler's Wine & Spirits", icon: Wine, sub: 'butlerswineandspirits.com', color: 'text-emerald-600 bg-emerald-50 border-emerald-600' },
    { id: 'midnight', name: 'Midnight Liquor', icon: Moon, sub: 'midnightliquors.com', color: 'text-amber-600 bg-amber-50 border-amber-600' },
    { id: 'straightup', name: 'Straight Up Liquors', icon: GlassWater, sub: 'straightupliquor.com', color: 'text-rose-600 bg-rose-50 border-rose-600' },
  ];

  return (
    <div className="w-80 h-screen bg-slate-900 border-r border-slate-800 flex flex-col justify-between text-white select-none shrink-0" id="sidebar-container">
      <div>
        {/* Logo and Brand */}
        <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30">
            <BarChart2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight leading-tight">CityHive Spy v1.4</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Kenmore & Tonawanda NY</p>
          </div>
        </div>

        {/* Store Navigation */}
        <div className="p-4 space-y-1.5">
          <p className="px-3 text-2xs font-bold font-mono tracking-widest text-slate-500 uppercase mb-3">Monitoring Feeds</p>
          
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3.5 px-4 py-3.5 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                  isActive 
                    ? 'bg-slate-800 text-white font-medium border-l-4 border-indigo-500' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/55'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  {item.sub && (
                    <div className="text-3xs font-mono text-slate-500 truncate mt-0.5">{item.sub}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual Intelligence Trigger */}
      <div className="p-6 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-start space-x-3 p-3 bg-indigo-950/30 rounded-xl border border-indigo-900/30 mb-4">
          <ShieldAlert className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
          <p className="text-xs text-slate-300 leading-relaxed">
            All 3 targets use <strong>CityHive</strong>. Extraction triggers sitemap scans and product JSON parsing.
          </p>
        </div>
        
        <button
          onClick={onTriggerScrape}
          disabled={isScraping}
          className={`w-full py-3.5 px-4 rounded-xl font-medium text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer ${
            isScraping 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 active:scale-98'
          }`}
        >
          <RefreshCw className={`h-4 w-4 ${isScraping ? 'animate-spin' : ''}`} />
          <span>{isScraping ? 'Scanning Targets...' : 'Sync Live Scrape'}</span>
        </button>
        <p className="text-center text-4xs font-mono text-slate-500 mt-2.5">
          Cron Schedule: Daily at 02:00 AM EST
        </p>
      </div>
    </div>
  );
}
