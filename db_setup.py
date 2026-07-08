import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()

class Store(Base):
    __tablename__ = 'stores'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    domain = Column(String(100), nullable=False)
    sitemap_url = Column(String(255), nullable=False)
    
    # Relationships
    products = relationship("Product", back_populates="store", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Store(name='{self.name}', domain='{self.domain}')>"

class Product(Base):
    __tablename__ = 'products'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    store_id = Column(Integer, ForeignKey('stores.id', ondelete='CASCADE'), nullable=False)
    variant_id = Column(String(100), nullable=False)  # CityHive Product ID
    name = Column(String(255), nullable=False)
    size = Column(String(50), nullable=True)
    upc = Column(String(50), nullable=True)
    first_seen_date = Column(Date, nullable=False)
    
    # Relationships
    store = relationship("Store", back_populates="products")
    daily_metrics = relationship("DailyMetric", back_populates="product", cascade="all, delete-orphan")
    
    # Strict Isolation: variant_id + store_id must be unique. 
    # Ensures Butler's Tito's is tracked entirely separately from Midnight's Tito's.
    __table_args__ = (
        UniqueConstraint('store_id', 'variant_id', name='_store_variant_uc'),
    )

    def __repr__(self):
        return f"<Product(name='{self.name}', variant_id='{self.variant_id}', store_id={self.store_id})>"

class DailyMetric(Base):
    __tablename__ = 'daily_metrics'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    scrape_date = Column(Date, nullable=False)
    regular_price = Column(Float, nullable=False)
    sale_price = Column(Float, nullable=True)
    stock_level = Column(Integer, nullable=False)
    
    # Relationships
    product = relationship("Product", back_populates="daily_metrics")
    
    # Prevent duplicate scrapes for the same product on the same day
    __table_args__ = (
        UniqueConstraint('product_id', 'scrape_date', name='_product_date_uc'),
    )

    def __repr__(self):
        return f"<DailyMetric(product_id={self.product_id}, date='{self.scrape_date}', stock={self.stock_level})>"


# Database Initialization Helper
DATABASE_FILE = "competitor_intelligence.db"
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

def init_db():
    engine = create_engine(DATABASE_URL, echo=False)
    Base.metadata.create_all(engine)
    
    # Create session
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Check if stores already exist, if not, seed them
    if session.query(Store).count() == 0:
        stores = [
            Store(
                name="Butler's Wine & Spirits",
                domain="butlerswineandspirits.com",
                sitemap_url="https://butlerswineandspirits.com/sitemap.xml"
            ),
            Store(
                name="Midnight Liquor",
                domain="midnightliquors.com",
                sitemap_url="https://midnightliquors.com/sitemap.xml"
            ),
            Store(
                name="Straight Up Wines & Liquors",
                domain="straightupliquor.com",
                sitemap_url="https://straightupliquor.com/sitemap.xml"
            )
        ]
        session.add_all(stores)
        session.commit()
        print("[DB Setup] Successfully initialized database and seeded 3 target competitors.")
    else:
        print("[DB Setup] Database already exists and contains competitor store configurations.")
        
    session.close()

if __name__ == "__main__":
    init_db()
