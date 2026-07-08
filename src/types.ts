export interface Store {
  id: number;
  name: string;
  domain: string;
  sitemap_url: string;
}

export interface CatalogItem {
  id: number;
  variant_id: string;
  name: string;
  size: string | null;
  upc: string | null;
  first_seen_date: string;
  regular_price: number;
  sale_price: number | null;
  current_price: number;
  stock_level: number;
  velocity_7d: number;
  velocity_30d: number;
  history: {
    date: string;
    price: number;
    stock: number;
  }[];
}

export interface GlobalSummary {
  total_competitors: number;
  total_tracked_items: number;
  out_of_stock_items: number;
  price_alerts_today: number;
  new_products_week: number;
}

export interface BestSellerItem {
  id: number;
  store_id: number;
  store_name: string;
  variant_id: string;
  name: string;
  size: string | null;
  upc: string | null;
  regular_price: number;
  sale_price: number | null;
  current_price: number;
  stock_level: number;
  velocity_7d: number;
  velocity_30d: number;
}

export interface PriceDropAlert {
  type: 'New Sale' | 'Price Adjustment';
  product_id: number;
  name: string;
  size: string | null;
  store_name: string;
  old_price: number;
  new_price: number;
  date: string;
  savings: number;
}

export interface NewProductAlert {
  id: number;
  store_id: number;
  store_name: string;
  name: string;
  size: string | null;
  upc: string | null;
  current_price: number;
  first_seen_date: string;
}

export interface DashboardData {
  summary: GlobalSummary;
  top_best_sellers: BestSellerItem[];
  recent_price_drops: PriceDropAlert[];
  new_products: NewProductAlert[];
}
