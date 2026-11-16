'use client';

// @shopscale/web/features/search/search-bar - Interactive autocomplete search island (T032).
// Invariants:
// 1. Debounced query fetching (150ms) with in-flight fetch cancellation via AbortController.
// 2. Full ARIA combobox accessibility with keyboard navigation (ArrowDown, ArrowUp, Enter, Escape).
// 3. Graceful fallback on network refusal without interrupting user typing.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface AutocompleteSuggestionItem {
  type: 'product' | 'category';
  text: string;
  slug: string;
  priceCents?: number | undefined;
}

export interface SearchAutocompleteProps {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  action?: string;
  channel?: 'marketplace' | 'store';
  storeSlug?: string;
}

export function SearchAutocomplete({
  id = 'header-search',
  name = 'q',
  label = 'Search products',
  placeholder = 'Search products…',
  defaultValue = '',
  action = '/search',
  channel = 'marketplace',
  storeSlug,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(
    async (searchTerm: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (searchTerm.trim().length < 2) {
        setSuggestions([]);
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);

      try {
        const params = new URLSearchParams({
          q: searchTerm.trim(),
          channel,
        });
        if (storeSlug) {
          params.set('storeSlug', storeSlug);
        }

        const res = await fetch(`/api/v1/search/suggest?${params.toString()}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const data = (await res.json()) as { suggestions: AutocompleteSuggestionItem[] };
          setSuggestions(data.suggestions ?? []);
          setIsOpen((data.suggestions ?? []).length > 0);
          setActiveIndex(-1);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setSuggestions([]);
          setIsOpen(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [channel, storeSlug],
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      void fetchSuggestions(query);
    }, 150);

    return () => {
      clearTimeout(handler);
    };
  }, [query, fetchSuggestions]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (item: AutocompleteSuggestionItem) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (item.type === 'product') {
      const target = channel === 'store' && storeSlug ? `/stores/${storeSlug}/products/${item.slug}` : `/products/${item.slug}`;
      router.push(target);
    } else {
      const target = channel === 'store' && storeSlug ? `/stores/${storeSlug}/products?category=${item.slug}` : `/products?category=${item.slug}`;
      router.push(target);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Escape') setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        const selected = suggestions[activeIndex];
        if (selected) {
          handleSelect(selected);
        }
      }
    }
  };

  const activeId = activeIndex >= 0 ? `suggestion-option-${activeIndex}` : undefined;

  return (
    <div className="ss-search-wrap" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <form
        role="search"
        action={action}
        method="GET"
        className="ss-search"
        onSubmit={() => setIsOpen(false)}
      >
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          name={name}
          type="search"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-activedescendant={activeId}
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0 && query.trim().length >= 2) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" aria-label="Submit search" disabled={loading}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          aria-label="Search suggestions"
          className="ss-search__dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--surface-solid, #ffffff)',
            border: '1px solid var(--border-subtle, #e5e7eb)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            overflow: 'hidden',
            zIndex: 1000,
            listStyle: 'none',
            padding: '4px 0',
            margin: 0,
          }}
        >
          {suggestions.map((item, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <li
                key={`${item.type}-${item.slug}`}
                id={`suggestion-option-${idx}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--surface-highlight, #f3f4f6)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: item.type === 'category' ? 600 : 400 }}>
                    {item.text}
                  </span>
                  {item.type === 'category' && (
                    <span
                      style={{
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: '#e5e7eb',
                        color: '#4b5563',
                      }}
                    >
                      Category
                    </span>
                  )}
                </div>
                {item.priceCents !== undefined && item.priceCents > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>
                    ${(item.priceCents / 100).toFixed(2)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
