// Unit tests for image magic byte validation (T035).
import { describe, expect, it } from 'vitest';
import {
  sniffImageMimeType,
  isDangerousContent,
  validateImageBuffer,
  MAX_FILE_SIZE_BYTES,
} from './magic-bytes.js';

describe('MagicByteValidator (T035)', () => {
  it('correctly detects JPEG images', () => {
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(sniffImageMimeType(jpegHeader)).toBe('image/jpeg');

    const validation = validateImageBuffer(jpegHeader, 'image/jpeg');
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.detectedType).toBe('image/jpeg');
    }
  });

  it('correctly detects PNG images', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(sniffImageMimeType(pngHeader)).toBe('image/png');

    const validation = validateImageBuffer(pngHeader, 'image/png');
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.detectedType).toBe('image/png');
    }
  });

  it('correctly detects WebP images', () => {
    const webpHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x24, 0x00, 0x00, 0x00, // file length
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
      0x56, 0x50, 0x38, 0x20, // 'VP8 '
    ]);
    expect(sniffImageMimeType(webpHeader)).toBe('image/webp');

    const validation = validateImageBuffer(webpHeader, 'image/webp');
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.detectedType).toBe('image/webp');
    }
  });

  it('strictly rejects SVG files and detects dangerous content', () => {
    const svgContent = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(isDangerousContent(svgContent)).toBe(true);

    const validation = validateImageBuffer(svgContent, 'image/svg+xml');
    expect(validation.valid).toBe(false);
  });

  it('strictly rejects HTML and scripts', () => {
    const htmlContent = new TextEncoder().encode('<!DOCTYPE html><html><body><h1>Phishing</h1></body></html>');
    expect(isDangerousContent(htmlContent)).toBe(true);

    const validation = validateImageBuffer(htmlContent, 'image/jpeg');
    expect(validation.valid).toBe(false);
  });

  it('strictly rejects ELF and PE executable binaries', () => {
    // Linux ELF
    const elfHeader = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(isDangerousContent(elfHeader)).toBe(true);
    expect(validateImageBuffer(elfHeader).valid).toBe(false);

    // Windows PE (MZ)
    const peHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    expect(isDangerousContent(peHeader)).toBe(true);
    expect(validateImageBuffer(peHeader).valid).toBe(false);
  });

  it('rejects files exceeding 10 MB limit', () => {
    const oversized = new Uint8Array(MAX_FILE_SIZE_BYTES + 1);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;
    const validation = validateImageBuffer(oversized);
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.reason).toContain('exceeds maximum allowed size');
    }
  });

  it('rejects mismatch between declared MIME type and detected MIME type', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const validation = validateImageBuffer(pngHeader, 'image/jpeg');
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.reason).toContain('does not match');
    }
  });
});
