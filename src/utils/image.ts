/**
 * Client-side image downscale to a base64 data-URL (no Firebase Storage).
 * Used for payment-proof screenshots: a phone screenshot downscaled to
 * max 1024px wide at JPEG 0.75 stays well under Firestore's 1 MB doc limit.
 */
export const fileToDownscaledDataUrl = (file: File, maxDim = 1024, quality = 0.75): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        reject(new Error('Could not process the image. Try another file.'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image file.'));
    };
    img.src = url;
  });
