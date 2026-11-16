// Unit tests for seller media uploader & gallery editor (T036).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MediaUploadDropzone, ProductGalleryEditor } from './media-uploader.js';
import type { ProductImageDto } from '@shopscale/contracts';

afterEach(() => {
  cleanup();
});

describe('MediaUploadDropzone (T036)', () => {
  const storeId = 'store-uuid-1';
  const productId = 'prod-uuid-1';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects SVG files with an error message', async () => {
    const onUploaded = vi.fn();
    render(<MediaUploadDropzone storeId={storeId} productId={productId} onUploaded={onUploaded} />);

    const input = screen.getByTestId('media-file-input');
    const svgFile = new File(['<svg></svg>'], 'malicious.svg', { type: 'image/svg+xml' });

    fireEvent.change(input, { target: { files: [svgFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Only JPEG, PNG, and WebP images are allowed');
    });
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('rejects oversized files exceeding 10 MB', async () => {
    const onUploaded = vi.fn();
    render(<MediaUploadDropzone storeId={storeId} productId={productId} onUploaded={onUploaded} />);

    const input = screen.getByTestId('media-file-input');
    // 11 MB dummy file
    const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], 'giant.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('exceeds the 10 MB limit');
    });
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('successfully executes upload grant -> S3 PUT -> complete -> attach flow', async () => {
    const onUploaded = vi.fn();

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/uploads') && init?.method === 'POST' && !urlStr.includes('/complete')) {
        return {
          ok: true,
          json: async () => ({
            assetId: 'asset-123',
            uploadUrl: 'https://minio.test/upload-key',
          }),
        };
      }
      if (urlStr.includes('minio.test') && init?.method === 'PUT') {
        return { ok: true };
      }
      if (urlStr.includes('/complete') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            assetId: 'asset-123',
            status: 'ready',
            detectedType: 'image/jpeg',
            url: 'https://cdn.example.com/stores/photo.jpg',
          }),
        };
      }
      if (urlStr.includes('/images') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: 'img-new-1',
            assetId: 'asset-123',
            url: 'https://cdn.example.com/stores/photo.jpg',
            displayOrder: 0,
            isPrimary: true,
            alt: 'Product photo',
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    render(<MediaUploadDropzone storeId={storeId} productId={productId} onUploaded={onUploaded} />);

    const input = screen.getByTestId('media-file-input');
    const validFile = new File(['fake-jpg-content'], 'camera.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'img-new-1',
          assetId: 'asset-123',
          url: 'https://cdn.example.com/stores/photo.jpg',
        }),
      );
    });
  });
});

describe('ProductGalleryEditor (T036)', () => {
  const storeId = 'store-uuid-1';
  const productId = 'prod-uuid-1';

  const initialImages: ProductImageDto[] = [
    {
      id: 'img-1',
      assetId: 'asset-1',
      url: 'https://cdn.example.com/img1.jpg',
      displayOrder: 0,
      isPrimary: true,
      alt: 'First image',
    },
    {
      id: 'img-2',
      assetId: 'asset-2',
      url: 'https://cdn.example.com/img2.jpg',
      displayOrder: 1,
      isPrimary: false,
      alt: 'Second image',
    },
  ];

  it('renders image list with primary badge and delete buttons', () => {
    render(
      <ProductGalleryEditor storeId={storeId} productId={productId} initialImages={initialImages} />,
    );

    expect(screen.getByTestId('gallery-item-0')).toBeDefined();
    expect(screen.getByTestId('gallery-item-1')).toBeDefined();
    expect(screen.getByText('PRIMARY')).toBeDefined();
  });

  it('deletes an image when delete button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ProductGalleryEditor storeId={storeId} productId={productId} initialImages={initialImages} />,
    );

    const deleteButtons = screen.getAllByTitle('Delete image');
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(screen.queryByAltText('First image')).toBeNull();
    });
  });

  it('reorders images when arrow button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    render(
      <ProductGalleryEditor storeId={storeId} productId={productId} initialImages={initialImages} />,
    );

    const moveRight = screen.getByTitle('Move right');
    fireEvent.click(moveRight);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/images/reorder'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ imageIds: ['img-2', 'img-1'] }),
        }),
      );
    });
  });
});
