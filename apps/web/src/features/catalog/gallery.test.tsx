// Unit tests for storefront PDP image gallery (T036).
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProductGallery } from './gallery.js';
import type { ProductImageDto } from '@shopscale/contracts';

describe('ProductGallery (T036)', () => {
  afterEach(() => {
    cleanup();
  });
  const sampleImages: ProductImageDto[] = [
    {
      id: 'img-1',
      assetId: 'asset-1',
      url: 'https://cdn.example.com/shoes-main.jpg',
      displayOrder: 0,
      isPrimary: true,
      alt: 'Main running shoes view',
    },
    {
      id: 'img-2',
      assetId: 'asset-2',
      url: 'https://cdn.example.com/shoes-side.jpg',
      displayOrder: 1,
      isPrimary: false,
      alt: 'Side angle view',
    },
    {
      id: 'img-3',
      assetId: 'asset-3',
      url: 'https://cdn.example.com/shoes-sole.jpg',
      displayOrder: 2,
      isPrimary: false,
      alt: 'Sole traction view',
    },
  ];

  it('renders neutral initial card when product has no images', () => {
    render(<ProductGallery images={[]} productTitle="Ultra Sneakers" />);

    expect(screen.queryByTestId('pdp-active-image')).toBeNull();
    expect(screen.getByText('U')).toBeDefined();
  });

  it('renders primary active image and thumbnails when images are provided', () => {
    render(<ProductGallery images={sampleImages} productTitle="Ultra Sneakers" />);

    const activeImg = screen.getByTestId('pdp-active-image') as HTMLImageElement;
    expect(activeImg).toBeDefined();
    expect(activeImg.src).toContain('shoes-main.jpg');

    const thumbnails = screen.getByTestId('pdp-thumbnails');
    expect(thumbnails).toBeDefined();

    expect(screen.getByTestId('pdp-thumb-0')).toBeDefined();
    expect(screen.getByTestId('pdp-thumb-1')).toBeDefined();
    expect(screen.getByTestId('pdp-thumb-2')).toBeDefined();
  });

  it('switches active image when thumbnail is clicked', () => {
    render(<ProductGallery images={sampleImages} productTitle="Ultra Sneakers" />);

    const thumb1 = screen.getByTestId('pdp-thumb-1');
    fireEvent.click(thumb1);

    const activeImg = screen.getByTestId('pdp-active-image') as HTMLImageElement;
    expect(activeImg.src).toContain('shoes-side.jpg');
    expect(thumb1.getAttribute('aria-selected')).toBe('true');
  });
});
