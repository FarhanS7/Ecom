// Branded store home (T016b; primitives T023b). Catalog listings arrive with
// T025; until then the page honestly renders identity + theme instead of fake
// products. Colors come from tokens only — the tenant accent arrives through
// the design token bridge on the [data-tenant] wrapper.

import { Card, PrimaryButton, Tag } from '@/components/ui';

export default function StoreHomePage() {
  return (
    <section aria-labelledby="store-heading">
      <Card>
        <Tag>Storefront</Tag>
        <h2 id="store-heading" className="type-h3">
          Welcome
        </h2>
        <p className="type-body-sm">
          This independent storefront shares the marketplace catalog pool. Product listings land
          here with the catalog milestone.
        </p>
        <p>
          <PrimaryButton href="/products">Browse products</PrimaryButton>
        </p>
      </Card>
    </section>
  );
}
