// @shopscale/web components/theme - Validated tenant theme injection (T023a).
// The browser never trusts the API body shape blindly: every theme object is
// re-validated against the CLOSED contract (six hex colors + integer radius)
// at the render boundary, and anything else renders as DEFAULT_THEME. Only
// the six DESIGN.md-tenant-overridable variables are emitted, so compromised
// data can at worst shift a few flat colors — it can never inject a CSS
// function, URL, or HTML into a style attribute.
//
// Components read colors from tokens only; this module is the single place
// that turns a theme into `--store-*` variables.

import type { CSSProperties } from 'react';
import { DEFAULT_THEME, themeTokensSchema } from '@shopscale/contracts';
import type { ThemeTokens } from '@shopscale/contracts';

export type { ThemeTokens };

/** True only for data matching the closed token contract exactly. */
export function isValidTheme(raw: unknown): boolean {
  return themeTokensSchema.safeParse(raw).success;
}

/** Validated tokens, or the design defaults — never a partial/raw object. */
export function resolveTheme(raw: unknown): ThemeTokens {
  const parsed = themeTokensSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_THEME };
}

/**
 * CSS variables applied to the tenant wrapper. Exactly the allowlisted
 * six: nothing here can widen the override surface without editing the
 * contract first (and the mapping table in T023a).
 */
export function tenantThemeStyle(raw: unknown): CSSProperties {
  const theme = resolveTheme(raw);
  return {
    '--store-primary': theme.primary,
    '--store-background': theme.background,
    '--store-surface': theme.surface,
    '--store-text': theme.text,
    '--store-muted': theme.muted,
    '--store-accent': theme.accent,
    '--store-radius': `${theme.radius}px`,
  } as CSSProperties;
}

/** Markup attributes for the tenant wrapper; keeps the testid contract. */
export const TENANT_ATTRIBUTE = 'data-tenant';
