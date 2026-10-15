'use client';

// @shopscale/web components/ui - Token-based primitives (T023b).
// DESIGN.md is the authority: every colour, radius, spacing, shadow and
// duration in these components resolves to a tokens.css variable, so a
// tenant theme swaps with zero code change and no hard-coded hex exists in
// component code. Structure and interaction states live in
// styles/components.css (inline styles cannot express :hover/:active/
// animation). Accessible by default: icon-only controls REQUIRE `label`.

import type { CSSProperties, ReactNode } from 'react';
import { Fragment, useId } from 'react';
import { TENANT_ATTRIBUTE, tenantThemeStyle } from '@/components/theme';

/* ------------------------------------------------------------------ icons
   Outline, 1.5px stroke, currentColor (DESIGN.md §3.3). Local so the design
   system has no runtime icon dependency; decorative icons are aria-hidden. */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </Svg>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </Svg>
  );
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m14 6-6 6 6 6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m10 6 6 6-6 6" />
    </Svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </Svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c3 3.4 5 5.8 5 9a5 5 0 0 1-10 0c0-1.6.8-2.9 1.7-4" />
    </Svg>
  );
}

export function StarIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="m12 3 2.6 5.6 6.4.8-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.8Z" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Svg>
  );
}

export function SocialIcon({ platform, ...props }: IconProps & { platform: string }) {
  // Brand glyphs stay monochrome (DESIGN.md forbids coloured social icons).
  const glyphs: Record<string, ReactNode> = {
    x: <path d="M5 5l14 14M19 5 5 19" />,
    instagram: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.4" />
      </>
    ),
    linkedin: (
      <>
        <path d="M6 10v8" />
        <circle cx="6" cy="6.6" r="1.2" />
        <path d="M11 18v-5a3 3 0 0 1 6 0v5" />
      </>
    ),
    tiktok: <path d="M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5" />,
    facebook: <path d="M14 8h2.5M14 8v9M14 8h3" />,
    youtube: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="4" />
        <path d="m11 10 3 2-3 2Z" />
      </>
    ),
  };
  return <Svg {...props}>{glyphs[platform] ?? <circle cx="12" cy="12" r="6" />}</Svg>;
}

/* ---------------------------------------------------------------- Frame */

export interface FrameProps {
  children: ReactNode;
  className?: string | undefined;
}

/** The page frame: 1440px cap, page padding, `--grid-gap` between children. */
export function Frame({ children, className }: FrameProps) {
  const classes = ['ss-frame', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

export interface TenantScopeProps {
  children: ReactNode;
  /**
   * Raw theme data. Re-validated here (T023a): invalid data renders as
   * DEFAULT_THEME, never as injected CSS.
   */
  theme: unknown;
  testId?: string | undefined;
  dataStore?: string | undefined;
  className?: string | undefined;
}

/**
 * Tenant theme wrapper: sets `data-tenant` and the six allowlisted
 * `--store-*` variables so descendant components swap theme with zero code
 * change. Deliberately NOT the page Frame — the shell's frame/header stay the
 * marketplace's until ChannelContext (T024) selects tenant chrome per route.
 */
export function TenantScope({ children, theme, testId, dataStore, className }: TenantScopeProps) {
  return (
    <div
      className={className}
      data-testid={testId}
      data-store={dataStore}
      {...{ [TENANT_ATTRIBUTE]: '', style: tenantThemeStyle(theme) }}
    >
      {children}
    </div>
  );
}

/** Renders only the children that have content — empty blocks reflow (§6). */
export function Blocks({
  children,
}: {
  children: Array<ReactNode | false | null | undefined>;
}) {
  const visible = children.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((child, index) => (
        <Fragment key={index}>{child}</Fragment>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------- Card */

export interface CardProps {
  children: ReactNode;
  /** Present → renders an anchor with the card-lift hover. */
  href?: string | undefined;
  as?: 'div' | 'section' | 'article' | 'li' | undefined;
  className?: string | undefined;
  /** Edge-to-edge media; no padding. */
  flush?: boolean | undefined;
  labelledBy?: string | undefined;
  style?: CSSProperties | undefined;
}

export function Card({ children, href, as = 'div', className, flush, labelledBy, style }: CardProps) {
  const classes = ['ss-card', flush ? 'ss-card--flush' : '', href ? 'ss-card--link' : '', className]
    .filter(Boolean)
    .join(' ');
  if (href) {
    return (
      <a className={classes} href={href} style={style} aria-labelledby={labelledBy}>
        {children}
      </a>
    );
  }
  const Tag_ = as;
  return (
    <Tag_ className={classes} style={style} aria-labelledby={labelledBy}>
      {children}
    </Tag_>
  );
}

/* ------------------------------------------------- Circular icon button */

export interface IconCircleButtonProps {
  /** Required accessible name for an icon-only control (DESIGN.md §10). */
  label: string;
  children: ReactNode;
  href?: string | undefined;
  onClick?: (() => void) | undefined;
  variant?: 'default' | 'ghost';
  size?: 'md' | 'sm';
  active?: boolean | undefined;
  className?: string | undefined;
}

export function IconCircleButton({
  label,
  children,
  href,
  onClick,
  variant = 'default',
  size = 'md',
  active = false,
  className,
}: IconCircleButtonProps) {
  const classes = [
    'ss-icon-btn',
    variant === 'ghost' ? 'ss-icon-btn--ghost' : '',
    size === 'sm' ? 'ss-icon-btn--sm' : '',
    active ? 'ss-icon-btn--on' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  if (href) {
    return (
      <a className={classes} href={href} aria-label={label} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button className={classes} type="button" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export interface ArrowButtonProps extends Omit<IconCircleButtonProps, 'children'> {
  position?: 'tr' | 'tl' | 'bl' | 'none';
}

export function ArrowButton({ position = 'none', ...props }: ArrowButtonProps) {
  const classes = [position === 'none' ? '' : `ss-arrow ss-arrow--${position}`, props.className]
    .filter(Boolean)
    .join(' ');
  return (
    <IconCircleButton {...props} className={classes}>
      <ArrowUpRightIcon className="ss-icon-rotate" />
    </IconCircleButton>
  );
}

/* -------------------------------------------------------------- Buttons */

export interface ActionButtonProps {
  children: ReactNode;
  href?: string | undefined;
  onClick?: (() => void) | undefined;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary';
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  /** id of the element explaining a disabled/blocked action (T026b). */
  describedBy?: string | undefined;
  className?: string | undefined;
}

export function ActionButton({
  children,
  href,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  loading = false,
  describedBy,
  className,
}: ActionButtonProps) {
  const busy = loading || disabled;
  const classes = ['ss-btn', variant === 'secondary' ? 'ss-btn--secondary' : 'ss-btn--primary', className]
    .filter(Boolean)
    .join(' ');
  const inner = (
    <>
      <span>{children}</span>
      <span className="ss-btn__icon" aria-hidden="true">
        {loading ? <RefreshIcon className="ss-spin" size={18} /> : <ArrowUpRightIcon className="ss-icon-rotate" />}
      </span>
    </>
  );
  if (href !== undefined) {
    return (
      <a
        className={classes}
        href={href}
        aria-disabled={busy}
        aria-busy={loading}
        aria-describedby={describedBy}
        onClick={busy ? (e) => e.preventDefault() : onClick}
        tabIndex={busy ? -1 : undefined}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      className={classes}
      type={type}
      onClick={onClick}
      disabled={busy}
      aria-busy={loading}
      aria-describedby={describedBy}
    >
      {inner}
    </button>
  );
}

/** The single lime CTA of a view (DESIGN.md §5.4). */
export function PrimaryButton(props: Omit<ActionButtonProps, 'variant'>) {
  return <ActionButton {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ActionButtonProps, 'variant'>) {
  return <ActionButton {...props} variant="secondary" />;
}

/* ------------------------------------------------------- Tags / ratings */

export function Tag({
  children,
  icon,
  bordered = false,
  hot = false,
}: {
  children: ReactNode;
  icon?: ReactNode;
  bordered?: boolean;
  hot?: boolean;
}) {
  const classes = ['ss-tag', bordered ? 'ss-tag--bordered' : '', hot ? 'ss-tag--hot' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
}

export function PopularTag() {
  return (
    <Tag bordered hot icon={<FlameIcon size={14} />}>
      Popular
    </Tag>
  );
}

export function RatingBadge({ value }: { value: number }) {
  return (
    <span className="ss-rating" aria-label={`Rated ${value} out of 5`}>
      <span style={{ color: 'var(--color-star)' }}>
        <StarIcon />
      </span>
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

/**
 * Decorative ↗ affordance for a CLICKABLE CARD (DESIGN.md §5.1): the whole
 * card is the single anchor, so this must not be a second link.
 */
export function CardArrow({
  position = 'tr',
  size = 'md',
}: {
  position?: 'tr' | 'tl' | 'bl';
  size?: 'md' | 'sm';
}) {
  const classes = [
    'ss-icon-btn',
    'ss-arrow',
    `ss-arrow--${position}`,
    size === 'sm' ? 'ss-icon-btn--sm' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span aria-hidden="true" className={classes}>
      <ArrowUpRightIcon className="ss-icon-rotate" />
    </span>
  );
}

export interface ProductCardProps {
  href: string;
  title: string;
  /** Pre-formatted price label (keeps Intl/locale out of the primitive). */
  priceLabel: string;
  brand?: string | null;
  ratingCount?: number;
  /** Overrides the computed arrow/action label. */
  actionLabel?: string;
}

/**
 * Product tile (DESIGN.md §7 PLP card). The image slot is a neutral tile until
 * media arrives (T035) — the card never renders a fake product photo.
 */
export function ProductCard({
  href,
  title,
  priceLabel,
  brand = null,
  ratingCount = 0,
  actionLabel,
}: ProductCardProps) {
  const titleId = useId();
  return (
    <Card href={href} labelledBy={titleId} className="ss-product">
      <div className="ss-product__media" aria-hidden="true">
        {title.slice(0, 1).toUpperCase()}
      </div>
      <CardArrow position="tr" size="sm" />
      <div className="ss-product__body">
        <h3 id={titleId} className="type-card-title">
          {title}
        </h3>
        {brand ? <p className="type-caption ss-product__brand">{brand}</p> : null}
        <p className="type-body-sm ss-product__price">{priceLabel}</p>
        {ratingCount > 0 ? <RatingBadge value={ratingCount} /> : null}
      </div>
      <span className="sr-only">{actionLabel ?? `Open ${title}`}</span>
    </Card>
  );
}

/* ------------------------------------------------------------ Search */

export interface SearchPillProps {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string | undefined;
  /** Native GET target so search works without JavaScript. */
  action?: string;
  submitting?: boolean | undefined;
  onChange?: ((value: string) => void) | undefined;
  onSubmit?: (() => void) | undefined;
}

export function SearchPill({
  id = 'header-search',
  name = 'q',
  label = 'Search products',
  placeholder = 'Search products…',
  defaultValue,
  action = '/search',
  submitting = false,
  onChange,
  onSubmit,
}: SearchPillProps) {
  return (
    <form className="ss-search" role="search" action={action} method="get" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="search"
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete="off"
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      <button type="submit" aria-label={submitting ? 'Searching' : label} aria-busy={submitting}>
        {submitting ? <RefreshIcon size={18} className="ss-spin" /> : <SearchIcon size={18} />}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------ Socials */

export function SocialRow({
  label = 'Follow us on:',
  socials,
}: {
  label?: string;
  socials: Array<{ platform: string; url: string }>;
}) {
  if (socials.length === 0) return null;
  return (
    <div className="ss-social">
      <span className="type-caption">{label}</span>
      {socials.map((social) => (
        <IconCircleButton
          key={`${social.platform}-${social.url}`}
          label={social.platform}
          href={social.url}
          variant="ghost"
          size="sm"
        >
          <SocialIcon platform={social.platform} size={16} />
        </IconCircleButton>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Form */

export interface TextFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string | undefined;
  required?: boolean | undefined;
  autoComplete?: string | undefined;
  error?: string | undefined;
}

export function TextField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = true,
  autoComplete,
  error,
}: TextFieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="ss-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        className={`ss-input${error ? ' ss-input--invalid' : ''}`}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p className="ss-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- Footer */

export function Footer({
  label,
  links = [],
}: {
  label: string;
  links?: Array<{ label: string; href: string }>;
}) {
  return (
    <footer className="ss-footer">
      <span className="ss-header__logo">
        <span className="ss-logo-mark" aria-hidden="true">
          {label.slice(0, 1)}
        </span>
        {label.toLowerCase()}.
      </span>
      <span>Portfolio demo — no real payments are processed.</span>
      {links.length > 0 ? (
        <nav className="ss-footer__links" aria-label="Footer">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}
    </footer>
  );
}
