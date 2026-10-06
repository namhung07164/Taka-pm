/**
 * Client-side High-Performance Image Compression & WebP Converter (Canva & Cloudinary Standard)
 * 
 * Automatically scales, optimizes, and encodes raw photos (up to 15MB) into ultra-lightweight WebP format
 * (~150KB - 300KB) directly in browser memory before uploading to Cloudflare R2 or Firebase Storage.
 */

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 (default: 0.82)
  outputFormat?: 'image/webp' | 'image/jpeg';
}

export interface CompressedImageResult {
  file: File;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // e.g. 85.5% saved
  width: number;
  height: number;
}

/**
 * Checks if browser supports WebP canvas export
 */
export function isWebpSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    return false;
  }
}

/**
 * Calculates proportional dimensions given max constraints
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number = 1920,
  maxHeight: number = 1920
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  let width = srcWidth;
  let height = srcHeight;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }

  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * Compresses an image file to WebP format in browser memory
 */
export async function compressImageToWebp(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<CompressedImageResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    outputFormat = isWebpSupported() ? 'image/webp' : 'image/jpeg',
  } = options;

  const originalSize = file.size;

  // Non-image files or SVG bypass compression
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return {
      file,
      blob: file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data'));
      img.onload = () => {
        try {
          const { width, height } = calculateTargetDimensions(
            img.naturalWidth || img.width,
            img.naturalHeight || img.height,
            maxWidth,
            maxHeight
          );

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({
              file,
              blob: file,
              originalSize,
              compressedSize: originalSize,
              compressionRatio: 0,
              width,
              height,
            });
            return;
          }

          // High-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve({
                  file,
                  blob: file,
                  originalSize,
                  compressedSize: originalSize,
                  compressionRatio: 0,
                  width,
                  height,
                });
                return;
              }

              // If compressed blob is somehow larger than original (rare for small icons), keep original
              if (blob.size >= originalSize && originalSize > 0) {
                resolve({
                  file,
                  blob: file,
                  originalSize,
                  compressedSize: originalSize,
                  compressionRatio: 0,
                  width,
                  height,
                });
                return;
              }

              const ext = outputFormat === 'image/webp' ? '.webp' : '.jpg';
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const newFileName = `${baseName}${ext}`;

              const compressedFile = new File([blob], newFileName, {
                type: outputFormat,
                lastModified: Date.now(),
              });

              const compressedSize = blob.size;
              const savedBytes = Math.max(0, originalSize - compressedSize);
              const compressionRatio = originalSize > 0
                ? Number(((savedBytes / originalSize) * 100).toFixed(1))
                : 0;

              resolve({
                file: compressedFile,
                blob,
                originalSize,
                compressedSize,
                compressionRatio,
                width,
                height,
              });
            },
            outputFormat,
            quality
          );
        } catch (err) {
          reject(err);
        }
      };

      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('Empty file reader result'));
      }
    };

    reader.readAsDataURL(file);
  });
}
