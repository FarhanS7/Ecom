// @shopscale/web - Homepage (marketplace)
// Using inline styles with CSS variables for hover effects

import type { CSSProperties } from 'react';

interface Styles {
  main: CSSProperties;
  header: CSSProperties;
  title: CSSProperties;
  subtitle: CSSProperties;
  section: CSSProperties;
  sectionTitle: CSSProperties;
  sectionHeader: CSSProperties;
  viewAll: CSSProperties;
  categoryList: CSSProperties;
  categoryLink: CSSProperties;
  productGrid: CSSProperties;
  productCard: CSSProperties;
  productImage: CSSProperties;
  productInfo: CSSProperties;
  productName: CSSProperties;
  productBrand: CSSProperties;
  productFooter: CSSProperties;
  productPrice: CSSProperties;
  addToCartBtn: CSSProperties;
}

const styles: Styles = {
  main: {
    padding: 'var(--spacing-xl)',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: 'var(--spacing-xl)',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    margin: 0,
  },
  subtitle: {
    color: 'var(--color-text-muted)',
    marginTop: 'var(--spacing-sm)',
    marginBottom: 0,
  },
  section: {
    marginBottom: 'var(--spacing-xl)',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    marginBottom: 'var(--spacing-md)',
    marginTop: 0,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--spacing-md)',
  },
  viewAll: {
    fontSize: '0.875rem',
    color: 'var(--color-accent)',
    textDecoration: 'none',
  },
  categoryList: {
    display: 'flex',
    gap: 'var(--spacing-md)',
    flexWrap: 'wrap',
  },
  categoryLink: {
    padding: 'var(--spacing-md) var(--spacing-lg)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text)',
    textDecoration: 'none',
    transition: 'all var(--transition-fast)',
  },
  productGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: 'var(--spacing-lg)',
  },
  productCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    transition: 'all var(--transition-normal)',
  },
  productImage: {
    aspectRatio: '1',
    background: 'var(--color-background)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
  },
  productInfo: {
    padding: 'var(--spacing-md)',
  },
  productName: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: '0 0 var(--spacing-xs) 0',
  },
  productBrand: {
    color: 'var(--color-text-muted)',
    fontSize: '0.875rem',
    margin: '0 0 var(--spacing-sm) 0',
  },
  productFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  addToCartBtn: {
    padding: 'var(--spacing-xs) var(--spacing-md)',
    background: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },
};

export default function HomePage() {
  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.title}>ShopScale Marketplace</h1>
        <p style={styles.subtitle}>
          Discover products from independent sellers
        </p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Featured Categories</h2>
        <div style={styles.categoryList}>
          {['Electronics', 'Clothing', 'Home & Garden', 'Books', 'Sports', 'Beauty'].map((cat) => (
            <a
              key={cat}
              href={`/search?category=${encodeURIComponent(cat.toLowerCase())}`}
              style={styles.categoryLink}
            >
              {cat}
            </a>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Latest Products</h2>
          <a href="/products" style={styles.viewAll}>View all →</a>
        </div>
        <div style={styles.productGrid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <article key={i} style={styles.productCard}>
              <div style={styles.productImage}>
                No image
              </div>
              <div style={styles.productInfo}>
                <h3 style={styles.productName}>Product {i + 1}</h3>
                <p style={styles.productBrand}>Sample Brand</p>
                <div style={styles.productFooter}>
                  <span style={styles.productPrice}>
                    ${(Math.random() * 200 + 10).toFixed(2)}
                  </span>
                  <button style={styles.addToCartBtn}>
                    Add to Cart
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      
    </main>
  );
}