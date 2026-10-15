'use client';

// @shopscale/web features/storefront/hero - Hero campaign card (T024a).
// DESIGN.md §5.3: eyebrow tag, two-line display headline, ghost index row,
// ONE lime primary CTA, social row at the baseline. Every optional block is
// hidden when it has no data (empty reflow) and a single-slide hero renders NO
// carousel controls — a control that cannot change anything would be a
// decorative action pretending to be connected.

import type { ReactNode } from 'react';
import { Card, GridIcon, PrimaryButton, SocialRow, Tag } from '@/components/ui';

export interface HeroSlide {
  /** e.g. "Music is Classic" — the collection/category tagline. */
  eyebrow: string;
  headline: string;
  /** Short block beside the ghost numeral. */
  title: string;
  description: string;
}

export interface HeroCardProps {
  slide: HeroSlide;
  /** 1-based; rendered as the ghost numeral "01". */
  index?: number;
  ctaHref: string;
  ctaLabel?: string;
  socials?: Array<{ platform: string; url: string }>;
  /** Decorative product stage (cut-out image / orbs) once media lands (T035). */
  stage?: ReactNode;
  labelledBy?: string;
}

export function HeroCard({
  slide,
  index = 1,
  ctaHref,
  ctaLabel = 'View All Products',
  socials = [],
  stage,
  labelledBy = 'hero-headline',
}: HeroCardProps) {
  return (
    <Card as="section" className="ss-hero" labelledBy={labelledBy}>
      <div className="ss-hero__text">
        <Tag icon={<GridIcon size={14} />}>{slide.eyebrow}</Tag>
        <h1 id={labelledBy} className="type-display ss-hero__headline">
          {slide.headline}
        </h1>
        <div className="ss-hero__index">
          <span className="type-ghost-number" aria-hidden="true">
            {String(index).padStart(2, '0')}
          </span>
          <span className="ss-hero__rule" aria-hidden="true" />
          <div>
            <p className="type-body ss-hero__index-title">{slide.title}</p>
            <p className="type-body-sm ss-hero__index-desc">{slide.description}</p>
          </div>
        </div>
        <PrimaryButton href={ctaHref}>{ctaLabel}</PrimaryButton>
        <SocialRow socials={socials} />
      </div>
      {stage ? (
        <div className="ss-hero__stage" aria-hidden="true">
          {stage}
        </div>
      ) : null}
    </Card>
  );
}
