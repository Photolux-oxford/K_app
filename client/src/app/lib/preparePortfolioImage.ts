/** Longest edge for portfolio web display (covers 4K / retina hero). */
const MAX_LONG_EDGE = 4000;
/** High JPEG quality — visually lossless for screen viewing. */
const JPEG_QUALITY = 0.92;
/** Skip re-encode when already a compact enough JPEG under this size. */
const SKIP_REENCODE_BYTES = 3.5 * 1024 * 1024;

/**
 * Prepare a portfolio upload for the website without a visible quality hit:
 * - Caps oversized camera files to MAX_LONG_EDGE (no upscaling)
 * - Exports progressive-friendly JPEG at quality 0.92
 * - Fixes EXIF orientation via createImageBitmap / draw
 * If the browser cannot decode the file (e.g. some TIFFs), returns the original.
 */
export async function preparePortfolioImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    if (!width || !height) return file;

    const longEdge = Math.max(width, height);
    const needsResize = longEdge > MAX_LONG_EDGE;
    const alreadyLeanJpeg =
      (file.type === 'image/jpeg' || file.type === 'image/jpg')
      && !needsResize
      && file.size <= SKIP_REENCODE_BYTES;

    if (alreadyLeanJpeg) {
      return file;
    }

    const scale = needsResize ? MAX_LONG_EDGE / longEdge : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'portfolio';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
