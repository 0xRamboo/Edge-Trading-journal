export async function parseApiJson<T = Record<string, unknown>>(
  res: Response,
  fallbackError = 'Request failed'
): Promise<T> {
  const raw = await res.text();
  let parsed: (T & { error?: string }) | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as T & { error?: string };
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      throw new Error(parsed.error);
    }
    if (res.status === 403) {
      throw new Error(
        'Request rejected (HTTP 403). Your AI provider API key in Settings > Secrets may be invalid/expired, or the proxy blocked the request.'
      );
    }
    if (res.status === 413) {
      throw new Error(
        'Screenshot is too large for the upload limit (HTTP 413). Try cropping the chart or uploading a smaller PNG/JPG.'
      );
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        `AI server temporarily unavailable or timed out (HTTP ${res.status}). Please retry or switch AI provider in Settings.`
      );
    }
    throw new Error(`${fallbackError} (HTTP ${res.status})`);
  }

  if (!parsed) {
    throw new Error(
      `Server returned an unexpected non-JSON response (HTTP ${res.status}). Try refreshing the page or retrying.`
    );
  }

  return parsed;
}

export async function prepareScreenshotForVision(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  // Skip resizing if already compact (< 700 KB raw) and standard raster type
  if (file.size <= 700 * 1024 && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return { dataUrl: rawDataUrl, mimeType: file.type };
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image format.'));
      el.src = rawDataUrl;
    });

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { dataUrl: rawDataUrl, mimeType: file.type || 'image/png' };
    }

    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
    if (compressedDataUrl.length < rawDataUrl.length || file.size > 900 * 1024) {
      return { dataUrl: compressedDataUrl, mimeType: 'image/jpeg' };
    }
    return { dataUrl: rawDataUrl, mimeType: file.type || 'image/png' };
  } catch {
    return { dataUrl: rawDataUrl, mimeType: file.type || 'image/png' };
  }
}
