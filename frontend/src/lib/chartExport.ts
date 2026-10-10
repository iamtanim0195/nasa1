/**
 * Rasterises a DOM subtree containing an SVG (a Recharts chart, for example)
 * into a downloadable PNG.
 *
 * Why not just download the SVG? Because the destination for these charts is a
 * report or a slide deck, and pasting an SVG into PowerPoint/Word is a coin
 * flip. A PNG at 2× device pixel ratio just works.
 */
export async function exportElementAsPng(
  element: HTMLElement | null,
  filename: string,
  options: { background?: string; scale?: number } = {},
): Promise<boolean> {
  if (!element) return false;

  const svg = element.querySelector('svg');
  if (!svg) return false;

  const { background = '#040711', scale = 2 } = options;

  const bounds = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));

  // Clone so the live chart is never mutated.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Recharts sets font-family via CSS classes in some setups; pin it inline so
  // the exported bitmap does not fall back to a serif default.
  clone.style.fontFamily = getComputedStyle(svg).fontFamily || 'Segoe UI, sans-serif';

  const serialised = new XMLSerializer().serializeToString(clone);
  // encodeURIComponent keeps non-ASCII labels (km2 —) intact without btoa.
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialised)}`;

  try {
    const image = await loadImage(dataUrl);

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const context = canvas.getContext('2d');
    if (!context) return false;

    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png', 0.95),
    );
    if (!blob) return false;

    downloadBlob(blob, filename);
    return true;
  } catch {
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Chart rasterisation failed'));
    image.src = src;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Downloads the globe canvas snapshot produced by `GlobeController.captureCanvas`. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Turns a series label into a filesystem-safe slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}
