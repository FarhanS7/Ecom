'use client';

// @shopscale/web features/seller/media-uploader - Seller media upload & gallery management (T036).
import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import type { ProductImageDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';

export interface MediaUploadDropzoneProps {
  storeId: string;
  productId: string;
  onUploaded: (image: ProductImageDto) => void;
}

export function MediaUploadDropzone({ storeId, productId, onUploaded }: MediaUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    // Validation
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed. SVG and other files are rejected.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10 MB limit.');
      return;
    }

    setIsUploading(true);
    setProgress('Requesting upload authorization...');

    try {
      // 1. Get grant
      const grantRes = await fetch(`/api/v1/seller/stores/${encodeURIComponent(storeId)}/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          declaredType: file.type,
          bytes: file.size,
        }),
      });

      if (!grantRes.ok) {
        throw new Error('Failed to obtain upload authorization.');
      }

      const grant = (await grantRes.json()) as { assetId: string; uploadUrl: string };

      // 2. Upload directly to presigned URL
      setProgress('Uploading to storage...');
      const uploadRes = await fetch(grant.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Direct storage upload failed.');
      }

      // 3. Complete and verify magic bytes
      setProgress('Verifying image integrity...');
      const completeRes = await fetch(
        `/api/v1/seller/stores/${encodeURIComponent(storeId)}/uploads/${encodeURIComponent(grant.assetId)}/complete`,
        { method: 'POST' },
      );

      if (!completeRes.ok) {
        const data = (await completeRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || 'Image verification rejected.');
      }

      // 4. Attach image to product
      setProgress('Attaching to product...');
      const attachRes = await fetch(
        `/api/v1/seller/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: grant.assetId }),
        },
      );

      if (!attachRes.ok) {
        throw new Error('Failed to attach image to product.');
      }

      const newImage = (await attachRes.json()) as ProductImageDto;
      onUploaded(newImage);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  return (
    <div
      role="region"
      aria-label="Image upload dropzone"
      className={`ss-dropzone ${isDragging ? 'ss-dropzone--active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      style={{
        border: '2px dashed #cbd5e1',
        borderRadius: '8px',
        padding: '24px',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: isDragging ? '#f8fafc' : 'transparent',
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        data-testid="media-file-input"
      />
      <div className="type-body">
        {isUploading ? (
          <p className="type-caption text-blue-600 font-medium">{progress || 'Uploading...'}</p>
        ) : (
          <>
            <p className="font-semibold text-gray-700">Drop image here or click to browse</p>
            <p className="type-caption text-gray-500">JPEG, PNG, WebP up to 10 MB</p>
          </>
        )}
      </div>
      {error && (
        <p className="type-caption text-red-600 mt-2 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface ProductGalleryEditorProps {
  storeId: string;
  productId: string;
  initialImages?: ProductImageDto[];
}

export function ProductGalleryEditor({
  storeId,
  productId,
  initialImages = [],
}: ProductGalleryEditorProps) {
  const [images, setImages] = useState<ProductImageDto[]>(initialImages);
  const [error, setError] = useState<string | null>(null);

  function handleUploaded(newImage: ProductImageDto) {
    setImages((prev) => [...prev, newImage]);
  }

  async function handleDelete(imageId: string) {
    try {
      const res = await fetch(
        `/api/v1/seller/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to delete image');
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function moveImage(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= images.length) return;
    const updated = [...images];
    const [moved] = updated.splice(fromIndex, 1);
    if (!moved) return;
    updated.splice(toIndex, 0, moved);
    setImages(updated);

    try {
      await fetch(
        `/api/v1/seller/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/images/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageIds: updated.map((i) => i.id) }),
        },
      );
    } catch {
      setImages(images);
    }
  }

  return (
    <Card className="ss-gallery-editor p-4">
      <h3 className="type-h3 mb-3">Product Media Gallery</h3>
      <MediaUploadDropzone storeId={storeId} productId={productId} onUploaded={handleUploaded} />

      {error && <p className="type-caption text-red-600 mt-2 font-medium">{error}</p>}

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4" data-testid="gallery-image-list">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="relative border rounded p-2 flex flex-col items-center bg-white shadow-sm"
              data-testid={`gallery-item-${idx}`}
            >
              <img
                src={img.url}
                alt={img.alt || `Product image ${idx + 1}`}
                className="w-full h-32 object-cover rounded"
              />
              <div className="flex items-center justify-between w-full mt-2 text-xs">
                {img.isPrimary && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold text-[10px]">
                    PRIMARY
                  </span>
                )}
                <div className="flex gap-1 ml-auto">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => void moveImage(idx, idx - 1)}
                      className="px-1 text-gray-600 hover:text-black"
                      title="Move left"
                      aria-label="Move left"
                    >
                      ←
                    </button>
                  )}
                  {idx < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => void moveImage(idx, idx + 1)}
                      className="px-1 text-gray-600 hover:text-black"
                      title="Move right"
                      aria-label="Move right"
                    >
                      →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(img.id)}
                    className="px-1 text-red-600 hover:text-red-800 font-bold ml-1"
                    title="Delete image"
                    aria-label="Delete image"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
