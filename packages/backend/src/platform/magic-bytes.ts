// @shopscale/backend/platform/magic-bytes - Image magic byte verification (T035).
// Invariants:
// 1. Validates real file content using binary header magic bytes, not file extension or declared MIME.
// 2. Strictly allows image/jpeg, image/png, and image/webp only.
// 3. Strictly rejects SVG, HTML, JavaScript, and executable binaries (ELF, PE, MACH-O) to prevent Stored XSS and RCE.
// 4. File size limit is 10 MB (10,485,760 bytes).

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Sniffs binary magic bytes from the first few bytes of a buffer.
 * Returns the verified MIME type, or null if unsupported or malicious.
 */
export function sniffImageMimeType(buffer: Uint8Array): AllowedMimeType | null {
  if (buffer.length < 12) {
    return null;
  }

  // Check JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // Check WebP: RIFF .... WEBP
  // Bytes 0-3: 'RIFF' (0x52, 0x49, 0x46, 0x46)
  // Bytes 8-11: 'WEBP' (0x57, 0x45, 0x42, 0x50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Checks for obvious text/executable signatures that must be rejected immediately.
 */
export function isDangerousContent(buffer: Uint8Array): boolean {
  // ELF binary: 7F 45 4C 46
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return true;
  }

  // Windows PE / DOS binary: 4D 5A ('MZ')
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return true;
  }

  // Check text representations (first 512 bytes)
  const headerSlice = buffer.subarray(0, Math.min(512, buffer.length));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(headerSlice).toLowerCase();

  if (
    text.includes('<svg') ||
    text.includes('<?xml') ||
    text.includes('<script') ||
    text.includes('<html') ||
    text.includes('<!doctype html')
  ) {
    return true;
  }

  return false;
}

export function validateImageBuffer(
  buffer: Uint8Array,
  declaredType?: string,
): { valid: true; detectedType: AllowedMimeType } | { valid: false; reason: string } {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { valid: false, reason: `File size exceeds maximum allowed size of 10 MB` };
  }

  if (isDangerousContent(buffer)) {
    return { valid: false, reason: `Disallowed or malicious file content detected` };
  }

  const detected = sniffImageMimeType(buffer);
  if (!detected) {
    return { valid: false, reason: `Invalid image format. Allowed formats: JPEG, PNG, WebP` };
  }

  if (declaredType && declaredType.toLowerCase() !== detected) {
    return {
      valid: false,
      reason: `Declared MIME type '${declaredType}' does not match detected format '${detected}'`,
    };
  }

  return { valid: true, detectedType: detected };
}
