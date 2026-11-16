'use client';

// @shopscale/web features/catalog/gallery - Responsive PDP media gallery (T036).
import { useState } from 'react';
import Image from 'next/image';
import type { ProductImageDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';

export interface ProductGalleryProps {
  images: ProductImageDto[];
  productTitle: string;
}

export function ProductGallery({ images, productTitle }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <Card className="ss-pdp__media" flush>
        <span aria-hidden="true" className="ss-pdp__orbit" />
        <span aria-hidden="true" className="ss-pdp__initial">
          {productTitle.slice(0, 1).toUpperCase()}
        </span>
      </Card>
    );
  }

  const activeImage = images[activeIndex] ?? images[0]!;

  return (
    <div className="ss-pdp-gallery flex flex-col gap-3" data-testid="pdp-gallery">
      <Card className="relative overflow-hidden aspect-square bg-gray-50 flex items-center justify-center" flush>
        <Image
          src={activeImage.url}
          alt={activeImage.alt || productTitle}
          width={600}
          height={600}
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="w-full h-full object-cover"
          data-testid="pdp-active-image"
        />
      </Card>

      {images.length > 1 && (
        <div
          role="tablist"
          aria-label="Product thumbnails"
          className="flex gap-2 overflow-x-auto pb-1"
          data-testid="pdp-thumbnails"
        >
          {images.map((img, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={img.id}
                role="tab"
                aria-selected={isActive}
                aria-label={`View image ${idx + 1} of ${images.length}`}
                onClick={() => setActiveIndex(idx)}
                className={`relative w-16 h-16 rounded border-2 overflow-hidden flex-shrink-0 transition-all ${
                  isActive ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-200 hover:border-gray-400'
                }`}
                data-testid={`pdp-thumb-${idx}`}
              >
                <Image
                  src={img.url}
                  alt={img.alt || `Thumbnail ${idx + 1}`}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
