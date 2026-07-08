import streamlit as st
import pandas as pd
import sqlite3
from datetime import date, timedelta
import database

# Ensure DB is initialized
database.init_db()

st.set_page_config(page_title="Competitor Intel", layout="wide")

def get_data(query, params=()):
    conn = database.get_db_connection()
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df

st.title("🦅 Competitor Intelligence Dashboard")

# --- THE ANALYTICS ENGINE ---
# This complex SQL calculates Sales Velocity correctly (Yesterday - Today)
velocity_sql = """
    SELECT 
        s.name as Store, p.name as Product, p.size as Size,
        m_today.regular_price as Price, m_today.sale_price as Sale_Price,
        m_today.stock_level as Current_Stock,
        (m_yesterday.stock_level - m_today.stock_level) as Units_Sold
    FROM products p
    JOIN stores s ON p.store_id = s.id
    JOIN daily_metrics m_today ON p.id = m_today.product_id AND m_today.scrape_date = ?
    JOIN daily_metrics m_yesterday ON p.id = m_yesterday.product_id AND m_yesterday.scrape_date = ?
    WHERE (m_yesterday.stock_level - m_today.stock_level) > 0
    ORDER BY Units_Sold DESC
"""

today = date.today().isoformat()
yesterday = (date.today() - timedelta(days=1)).isoformat()

# --- TABS ---
tab1, tab2, tab3, tab4 = st.tabs(["🌎 Global Market", "Butler's", "Midnight Liquor", "Straight Up"])

with tab1:
    st.header("Global Market Overview")
    st.markdown("### 🔥 Top Selling Items (Past 24 Hours)")
    df_velocity = get_data(velocity_sql, (today, yesterday))
    
    if df_velocity.empty:
        st.info("Not enough historical data yet. Run the scraper on two consecutive days to calculate Sales Velocity.")
    else:
        st.dataframe(df_velocity.head(20), use_container_width=True)

def render_store_tab(store_name):
    st.header(f"{store_name} Catalog")
    
    catalog_sql = """
        SELECT p.name as Product, p.size as Size, p.upc as UPC, 
               m.regular_price as Price, m.sale_price as Sale, m.stock_level as Stock,
               p.first_seen_date as Added_On
        FROM products p
        JOIN stores s ON p.store_id = s.id
        LEFT JOIN daily_metrics m ON p.id = m.product_id AND m.scrape_date = ?
        WHERE s.name = ?
        ORDER BY p.name
    """
    df_store = get_data(catalog_sql, (today, store_name))
    
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Unique Products", len(df_store))
    col2.metric("Items on Sale", len(df_store.dropna(subset=['Sale'])))
    col3.metric("Items Out of Stock", len(df_store[df_store['Stock'] == 0]))

    search = st.text_input("Search Catalog", key=f"search_{store_name}")
    if search:
        df_store = df_store[df_store['Product'].str.contains(search, case=False, na=False)]
        
    st.dataframe(df_store, use_container_width=True)

with tab2: render_store_tab("Butler's Wine & Spirits")
with tab3: render_store_tab("Midnight Liquor")
with tab4: render_store_tab("Straight Up Wines & Liquors")
