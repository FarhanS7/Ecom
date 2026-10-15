'use client';

// @shopscale/web features/catalog/filter-panel - PLP filter card (T025b).
// DESIGN.md §7: a glass filter card with PILL controls. Every control writes
// the URL — never component-only state — so the browser Back/Forward buttons
// restore the exact filter view, and every filtered listing is deep-linkable.
// Values are re-parsed with parseListQuery before navigation, so the URL can
// only ever contain state that the listing would accept if typed by hand.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Card, SecondaryButton } from '@/components/ui';
import {
  LIST_SORTS,
  SORT_LABELS,
  hasActiveFilters,
  listHref,
  parseListQuery,
  withFilters,
} from '@/features/catalog/query-state';

export interface FilterCategory {
  slug: string;
  name: string;
}

export interface FilterPanelProps {
  /** Channel listing base path; the panel never builds one itself. */
  basePath: string;
  /**
   * Optional category set. The public catalog read has no categories feed yet,
   * so the routes pass nothing and the chips block reflows away (DESIGN.md §6)
   * while `?category=` stays fully supported and deep-linkable.
   */
  categories?: FilterCategory[];
}

export function FilterPanel({ basePath, categories = [] }: FilterPanelProps) {
  const router = useRouter();
  const params = useSearchParams();
  const urlKey = params.toString();
  const state = parseListQuery(new URLSearchParams(urlKey));

  function onApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const typed = new URLSearchParams();
    for (const [name, value] of data.entries()) {
      if (typeof value === 'string' && value.trim() !== '') typed.set(name, value);
    }
    // Keep the current sort: the price/category form does not own it.
    typed.set('sort', state.filters.sort);
    router.push(listHref(basePath, parseListQuery(typed)));
  }

  const active = hasActiveFilters(state);

  return (
    <Card as="section" className="ss-filter" labelledBy="filters-heading">
      <h2 id="filters-heading" className="type-card-title">
        Filters
      </h2>

      <div className="ss-filter__group">
        <span className="ss-filter__legend" id="sort-legend">
          Sort
        </span>
        <div className="ss-sort-pills" role="group" aria-labelledby="sort-legend">
          {LIST_SORTS.map((sort) => {
            const isActive = state.filters.sort === sort;
            return (
              <Link
                key={sort}
                className="ss-sort-pill"
                aria-current={isActive ? 'true' : undefined}
                scroll={false}
                href={listHref(basePath, withFilters(state, { sort }))}
              >
                {SORT_LABELS[sort]}
              </Link>
            );
          })}
        </div>
      </div>

      {categories.length > 0 ? (
        <div className="ss-filter__group">
          <span className="ss-filter__legend" id="category-legend">
            Category
          </span>
          <ul className="ss-chips" aria-labelledby="category-legend">
            {categories.map((category) => {
              const isActive = state.filters.category === category.slug;
              return (
                <li key={category.slug}>
                  <Link
                    className="ss-tag ss-tag--bordered"
                    aria-current={isActive ? 'true' : undefined}
                    scroll={false}
                    href={listHref(basePath, withFilters(state, { category: category.slug }))}
                  >
                    {category.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* key={urlKey}: the inputs are uncontrolled, so a fresh key after a
          navigation re-seeds them from the URL instead of going stale. */}
      <form key={urlKey} className="ss-filter__group" onSubmit={onApply}>
        <span className="ss-filter__legend">Price range (min / max)</span>
        <div className="ss-price-row">
          <label className="sr-only" htmlFor="filter-min">
            Minimum price
          </label>
          <input
            id="filter-min"
            className="ss-pill-input"
            name="min"
            inputMode="decimal"
            placeholder="Min"
            defaultValue={state.filters.minPrice === null ? '' : String(state.filters.minPrice)}
          />
          <label className="sr-only" htmlFor="filter-max">
            Maximum price
          </label>
          <input
            id="filter-max"
            className="ss-pill-input"
            name="max"
            inputMode="decimal"
            placeholder="Max"
            defaultValue={state.filters.maxPrice === null ? '' : String(state.filters.maxPrice)}
          />
        </div>

        {categories.length === 0 ? (
          <>
            <label className="ss-filter__legend" htmlFor="filter-category">
              Category slug
            </label>
            <input
              id="filter-category"
              className="ss-pill-input"
              name="category"
              placeholder="e.g. audio"
              defaultValue={state.filters.category ?? ''}
            />
          </>
        ) : null}

        <div className="ss-filter__actions">
          <SecondaryButton type="submit">Apply filters</SecondaryButton>
          {active ? (
            <Link href={basePath} scroll={false}>
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
