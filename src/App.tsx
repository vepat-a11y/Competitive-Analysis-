import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import GlobalDashboard from './components/GlobalDashboard';
import StoreTab from './components/StoreTab';
import { DashboardData } from './types';
import { AlertCircle, CheckCircle2, ShieldCheck, Database } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('global');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  
  // Custom interactive Toast notifications
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/global-dashboard');
      if (response.ok) {
        const result = await response.json();
        setDashboardData(result);
      } else {
        showToast('Failed to fetch dashboard intelligence streams.', 'error');
      }
    } catch (error) {
      console.error('API connection failed:', error);
      showToast('Backend connection refused. Ensure Express server is running.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleTriggerScrape = async () => {
    if (isScraping) return;
    setIsScraping(true);
    showToast('Initializing CityHive Extraction pipeline. Scanning competitor sitemaps...');
    
    try {
      const response = await fetch('/api/scrape/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        showToast(result.message || 'Scrape completed successfully!', 'success');
        // Refresh entire dashboard statistics immediately to visualize the updated stock/price changes
        fetchDashboardData();
      } else {
        showToast('Playwright scraper timed out or failed to parse HTML payload.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Scraper runner failed. Connection error.', 'error');
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans" id="app-root-container">
      
      {/* Dynamic Animated Toast */}
      {toast.show && (
        <div className="fixed top-6 right-6 z-50 flex items-center space-x-3 bg-slate-900 border border-slate-800 text-white px-5 py-4 rounded-2xl shadow-2xl max-w-sm animate-fade-in transition-all">
          {toast.type === 'success' ? (
            <div className="p-1 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <ShieldCheck className="h-5 w-5 animate-bounce" />
            </div>
          ) : (
            <div className="p-1 bg-rose-500/10 text-rose-400 rounded-lg">
              <AlertCircle className="h-5 w-5 animate-pulse" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-mono font-bold uppercase text-slate-500 tracking-wider">Intelligence Feed</p>
            <p className="text-xs text-slate-200 mt-0.5 leading-snug">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onTriggerScrape={handleTriggerScrape}
        isScraping={isScraping}
      />

      {/* Main Content Area */}
      <div className="flex-1 h-screen flex flex-col overflow-hidden">
        {activeTab === 'global' ? (
          <GlobalDashboard 
            data={dashboardData} 
            loading={loading} 
            onRefresh={fetchDashboardData}
            setActiveTab={setActiveTab}
          />
        ) : activeTab === 'butlers' ? (
          <StoreTab storeId={1} storeName="Butler's Wine & Spirits" />
        ) : activeTab === 'midnight' ? (
          <StoreTab storeId={2} storeName="Midnight Liquor" />
        ) : activeTab === 'straightup' ? (
          <StoreTab storeId={3} storeName="Straight Up Liquors" />
        ) : null}
      </div>

    </div>
  );
}
