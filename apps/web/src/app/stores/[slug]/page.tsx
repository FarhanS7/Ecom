// Branded store home (T016b). Catalog listings arrive with T025; until then
// the page honestly renders identity + theme instead of fake products.

export default function StoreHomePage() {
  return (
    <section aria-labelledby="store-heading">
      <h2 id="store-heading">Welcome</h2>
      <p>
        This independent storefront shares the marketplace catalog pool. Product
        listings land here with the catalog milestone.
      </p>
      <p>
        <a
          href="/"
          style={{
            background: 'var(--store-accent)',
            color: '#fff',
            padding: 'var(--spacing-xs) var(--spacing-md)',
            borderRadius: 'var(--store-radius)',
            textDecoration: 'none',
          }}
        >
          Back to marketplace
        </a>
      </p>
    </section>
  );
}
