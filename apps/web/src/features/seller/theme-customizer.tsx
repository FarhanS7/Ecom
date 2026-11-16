'use client';

// apps/web/src/features/seller/theme-customizer.tsx - Storefront Theme Customizer with live preview (T068).

import React, { useState } from 'react';
import type { ThemeTokens } from '@shopscale/contracts';
import { DEFAULT_THEME, tenantThemeStyle } from '@/components/theme';
import { ActionButton, Card } from '@/components/ui';

export interface ThemeCustomizerProps {
  storeId: string;
  initialTheme?: ThemeTokens;
  onSave?: (theme: ThemeTokens) => Promise<boolean | void>;
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function ThemeCustomizer({
  storeId,
  initialTheme = DEFAULT_THEME,
  onSave,
}: ThemeCustomizerProps) {
  const [theme, setTheme] = useState<ThemeTokens>({ ...initialTheme });
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleColorChange = (key: keyof Omit<ThemeTokens, 'radius'>, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }));
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleRadiusChange = (radius: number) => {
    setTheme((prev) => ({ ...prev, radius: Math.max(0, Math.min(16, radius)) }));
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const hasInvalidColors =
    !isValidHex(theme.primary) ||
    !isValidHex(theme.background) ||
    !isValidHex(theme.surface) ||
    !isValidHex(theme.text) ||
    !isValidHex(theme.muted) ||
    !isValidHex(theme.accent);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasInvalidColors) {
      setErrorMessage('All colors must be valid 6-character hex codes (e.g. #0070f3).');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (onSave) {
        await onSave(theme);
        setStatusMessage('Theme tokens saved successfully!');
      } else {
        const res = await fetch(`/api/v1/seller/stores/${storeId}/theme`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? 'Failed to update theme.');
        }
        setStatusMessage('Theme tokens saved successfully!');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  const previewStyle = tenantThemeStyle(hasInvalidColors ? DEFAULT_THEME : theme);

  return (
    <div className="ss-theme-customizer" data-testid="theme-customizer">
      <div className="ss-theme-customizer__layout">
        {/* Color Controls Form */}
        <form
          onSubmit={(e) => {
            void handleSave(e);
          }}
          className="ss-theme-customizer__controls"
          aria-label="Theme Customizer Controls"
        >
          <Card className="ss-form-card">
            <h2 className="type-title-md">Store Theme Tokens</h2>
            <p className="type-caption text-muted">
              Customize your brand palette and border radius. All token overrides are securely scoped and validated.
            </p>

            {statusMessage && (
              <div className="ss-banner ss-banner--success" role="status">
                {statusMessage}
              </div>
            )}
            {errorMessage && (
              <div className="ss-banner ss-banner--error" role="alert">
                {errorMessage}
              </div>
            )}

            <div className="ss-form-group">
              <label htmlFor="theme-primary" className="ss-label">Primary Color</label>
              <div className="ss-color-input-row">
                <input
                  type="color"
                  id="theme-primary-picker"
                  aria-label="Primary color picker"
                  value={isValidHex(theme.primary) ? theme.primary : '#000000'}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className="ss-color-picker"
                />
                <input
                  type="text"
                  id="theme-primary"
                  aria-label="Primary color hex"
                  value={theme.primary}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className={`ss-input ${!isValidHex(theme.primary) ? 'ss-input--invalid' : ''}`}
                  placeholder="#000000"
                  maxLength={7}
                />
              </div>
              {!isValidHex(theme.primary) && (
                <span className="ss-error-text" role="alert">Must match #RRGGBB</span>
              )}
            </div>

            <div className="ss-form-group">
              <label htmlFor="theme-accent" className="ss-label">Accent Color</label>
              <div className="ss-color-input-row">
                <input
                  type="color"
                  id="theme-accent-picker"
                  aria-label="Accent color picker"
                  value={isValidHex(theme.accent) ? theme.accent : '#000000'}
                  onChange={(e) => handleColorChange('accent', e.target.value)}
                  className="ss-color-picker"
                />
                <input
                  type="text"
                  id="theme-accent"
                  aria-label="Accent color hex"
                  value={theme.accent}
                  onChange={(e) => handleColorChange('accent', e.target.value)}
                  className={`ss-input ${!isValidHex(theme.accent) ? 'ss-input--invalid' : ''}`}
                  placeholder="#e94560"
                  maxLength={7}
                />
              </div>
              {!isValidHex(theme.accent) && (
                <span className="ss-error-text" role="alert">Must match #RRGGBB</span>
              )}
            </div>

            <div className="ss-form-group">
              <label htmlFor="theme-background" className="ss-label">Background Color</label>
              <div className="ss-color-input-row">
                <input
                  type="color"
                  id="theme-background-picker"
                  aria-label="Background color picker"
                  value={isValidHex(theme.background) ? theme.background : '#ffffff'}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  className="ss-color-picker"
                />
                <input
                  type="text"
                  id="theme-background"
                  aria-label="Background color hex"
                  value={theme.background}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  className={`ss-input ${!isValidHex(theme.background) ? 'ss-input--invalid' : ''}`}
                  placeholder="#ffffff"
                  maxLength={7}
                />
              </div>
              {!isValidHex(theme.background) && (
                <span className="ss-error-text" role="alert">Must match #RRGGBB</span>
              )}
            </div>

            <div className="ss-form-group">
              <label htmlFor="theme-surface" className="ss-label">Surface Color</label>
              <div className="ss-color-input-row">
                <input
                  type="color"
                  id="theme-surface-picker"
                  aria-label="Surface color picker"
                  value={isValidHex(theme.surface) ? theme.surface : '#f8f9fa'}
                  onChange={(e) => handleColorChange('surface', e.target.value)}
                  className="ss-color-picker"
                />
                <input
                  type="text"
                  id="theme-surface"
                  aria-label="Surface color hex"
                  value={theme.surface}
                  onChange={(e) => handleColorChange('surface', e.target.value)}
                  className={`ss-input ${!isValidHex(theme.surface) ? 'ss-input--invalid' : ''}`}
                  placeholder="#f8f9fa"
                  maxLength={7}
                />
              </div>
              {!isValidHex(theme.surface) && (
                <span className="ss-error-text" role="alert">Must match #RRGGBB</span>
              )}
            </div>

            <div className="ss-form-group">
              <label htmlFor="theme-text" className="ss-label">Text Color</label>
              <div className="ss-color-input-row">
                <input
                  type="color"
                  id="theme-text-picker"
                  aria-label="Text color picker"
                  value={isValidHex(theme.text) ? theme.text : '#1a1a2e'}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  className="ss-color-picker"
                />
                <input
                  type="text"
                  id="theme-text"
                  aria-label="Text color hex"
                  value={theme.text}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  className={`ss-input ${!isValidHex(theme.text) ? 'ss-input--invalid' : ''}`}
                  placeholder="#1a1a2e"
                  maxLength={7}
                />
              </div>
              {!isValidHex(theme.text) && (
                <span className="ss-error-text" role="alert">Must match #RRGGBB</span>
              )}
            </div>

            <div className="ss-form-group">
              <label htmlFor="theme-muted" className="ss-label">Muted Text Color</label>
              <div className="ss-color-input-row">
                <input
                  type="color"
                  id="theme-muted-picker"
                  aria-label="Muted color picker"
                  value={isValidHex(theme.muted) ? theme.muted : '#6a737d'}
                  onChange={(e) => handleColorChange('muted', e.target.value)}
                  className="ss-color-picker"
                />
                <input
                  type="text"
                  id="theme-muted"
                  aria-label="Muted color hex"
                  value={theme.muted}
                  onChange={(e) => handleColorChange('muted', e.target.value)}
                  className={`ss-input ${!isValidHex(theme.muted) ? 'ss-input--invalid' : ''}`}
                  placeholder="#6a737d"
                  maxLength={7}
                />
              </div>
              {!isValidHex(theme.muted) && (
                <span className="ss-error-text" role="alert">Must match #RRGGBB</span>
              )}
            </div>

            <div className="ss-form-group">
              <label htmlFor="theme-radius" className="ss-label">
                Border Radius: {theme.radius}px
              </label>
              <input
                type="range"
                id="theme-radius"
                min={0}
                max={16}
                value={theme.radius}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                className="ss-range-slider"
              />
            </div>

            <div className="ss-form-actions">
              <ActionButton
                type="submit"
                disabled={saving || hasInvalidColors}
              >
                {saving ? 'Saving...' : 'Save Theme'}
              </ActionButton>
              <button
                type="button"
                className="ss-button ss-button--ghost"
                onClick={() => setTheme({ ...initialTheme })}
              >
                Reset
              </button>
            </div>
          </Card>
        </form>

        {/* Live Storefront Preview */}
        <div className="ss-theme-customizer__preview-pane">
          <Card className="ss-preview-card">
            <h2 className="type-title-md">Storefront Live Preview</h2>
            <p className="type-caption text-muted">
              Simulated storefront rendered with active theme CSS variables.
            </p>

            <div
              className="ss-storefront-mockup"
              style={previewStyle}
              data-testid="storefront-preview"
            >
              {/* Mock Store Header */}
              <header className="ss-mock-header">
                <div className="ss-mock-brand">Apex Athletics</div>
                <nav className="ss-mock-nav">
                  <span>Home</span>
                  <span>Products</span>
                  <span>Cart (2)</span>
                </nav>
              </header>

              {/* Mock Hero Banner */}
              <div className="ss-mock-hero">
                <h3 className="ss-mock-title">Engineered For Performance</h3>
                <p className="ss-mock-subtitle">Experience the newest trail running collection.</p>
                <div className="ss-mock-cta-row">
                  <button type="button" className="ss-mock-button-primary">
                    Shop Collection
                  </button>
                  <button type="button" className="ss-mock-button-secondary">
                    Learn More
                  </button>
                </div>
              </div>

              {/* Mock Product Card */}
              <div className="ss-mock-card">
                <div className="ss-mock-img-placeholder">Product Image</div>
                <div className="ss-mock-card-body">
                  <h4 className="ss-mock-card-title">Apex Trail Runner Pro</h4>
                  <p className="ss-mock-card-price">$145.00</p>
                  <button type="button" className="ss-mock-card-button">
                    Add to Cart
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
