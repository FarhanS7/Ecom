'use client';

// @shopscale/web features/catalog/variant-picker - Variant choice (T026b).
// DESIGN.md §7 asks for pills. These are NATIVE radio inputs (visually hidden
// with the pill as their label) rather than a custom widget, because native
// radios give keyboard arrow-key selection, a single tab stop for the group,
// and correct screen-reader semantics for free. A single-variant product has no
// choice to make, so the group reflows away instead of rendering one dead pill.

import { useId } from 'react';
import type { VariantView } from '@/features/catalog/variants';

export interface VariantPickerProps {
  variants: VariantView[];
  value: string | null;
  onChange: (variantId: string) => void;
}

export function VariantPicker({ variants, value, onChange }: VariantPickerProps) {
  const groupName = useId();

  if (variants.length < 2) return null;

  return (
    <fieldset className="ss-variants">
      <legend className="ss-filter__legend">Variant</legend>
      <div className="ss-variants__options">
        {variants.map((variant) => {
          const checked = variant.id === value;
          return (
            <label
              key={variant.id}
              className={`ss-variant-pill${checked ? ' ss-variant-pill--on' : ''}`}
            >
              <input
                type="radio"
                className="sr-only"
                name={groupName}
                value={variant.id}
                checked={checked}
                onChange={() => onChange(variant.id)}
              />
              <span aria-hidden="true" className="ss-variant-pill__dot" />
              {variant.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
