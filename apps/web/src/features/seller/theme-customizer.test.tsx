// apps/web/src/features/seller/theme-customizer.test.tsx - Unit tests for theme customizer component (T068).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ThemeCustomizer, isValidHex } from './theme-customizer';
import type { ThemeTokens } from '@shopscale/contracts';

const mockTheme: ThemeTokens = {
  primary: '#0070f3',
  background: '#ffffff',
  surface: '#f4f5f7',
  text: '#111827',
  muted: '#6b7280',
  accent: '#f59e0b',
  radius: 6,
};

describe('ThemeCustomizer Component (T068)', () => {
  afterEach(cleanup);
  it('validates hex color format correctly', () => {
    expect(isValidHex('#0070f3')).toBe(true);
    expect(isValidHex('#FFFFFF')).toBe(true);
    expect(isValidHex('#1a1a2e')).toBe(true);

    expect(isValidHex('0070f3')).toBe(false);
    expect(isValidHex('#007')).toBe(false);
    expect(isValidHex('blue')).toBe(false);
    expect(isValidHex('#gggggg')).toBe(false);
  });

  it('renders initial theme values and live preview', () => {
    render(<ThemeCustomizer storeId="00000000-0000-0000-0000-000000000001" initialTheme={mockTheme} />);

    const primaryInput = screen.getByLabelText('Primary color hex') as HTMLInputElement;
    expect(primaryInput.value).toBe('#0070f3');

    const preview = screen.getByTestId('storefront-preview');
    expect(preview).toBeInTheDocument();
    expect(preview.style.getPropertyValue('--store-primary')).toBe('#0070f3');
    expect(preview.style.getPropertyValue('--store-radius')).toBe('6px');
  });

  it('updates live preview when color inputs change', () => {
    render(<ThemeCustomizer storeId="00000000-0000-0000-0000-000000000001" initialTheme={mockTheme} />);

    const primaryInput = screen.getByLabelText('Primary color hex');
    fireEvent.change(primaryInput, { target: { value: '#ff0000' } });

    const preview = screen.getByTestId('storefront-preview');
    expect(preview.style.getPropertyValue('--store-primary')).toBe('#ff0000');
  });

  it('displays validation error and disables submit when color is invalid hex', () => {
    render(<ThemeCustomizer storeId="00000000-0000-0000-0000-000000000001" initialTheme={mockTheme} />);

    const primaryInput = screen.getByLabelText('Primary color hex');
    fireEvent.change(primaryInput, { target: { value: 'invalid-hex' } });

    expect(screen.getByText('Must match #RRGGBB')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /save theme/i });
    expect(saveButton).toBeDisabled();
  });

  it('calls onSave with updated valid theme tokens on submit', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <ThemeCustomizer
        storeId="00000000-0000-0000-0000-000000000001"
        initialTheme={mockTheme}
        onSave={onSave}
      />,
    );

    const accentInput = screen.getByLabelText('Accent color hex');
    fireEvent.change(accentInput, { target: { value: '#10b981' } });

    const saveButton = screen.getByRole('button', { name: /save theme/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        ...mockTheme,
        accent: '#10b981',
      });
      expect(screen.getByText('Theme tokens saved successfully!')).toBeInTheDocument();
    });
  });
});
