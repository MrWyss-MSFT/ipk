import jsQR from "jsqr";

/**
 * Lazily creates (and caches) a `BarcodeDetector` configured for QR codes,
 * when the browser supports it and reports QR as a supported format.
 * Returns `null` if unsupported, so callers can fall back to `jsqr`.
 */
let detectorPromise: Promise<BarcodeDetector | null> | undefined;

function createDetector(): Promise<BarcodeDetector | null> {
  if (typeof window === "undefined" || !window.BarcodeDetector) {
    return Promise.resolve(null);
  }
  const Ctor = window.BarcodeDetector;
  return Ctor.getSupportedFormats()
    .then((formats) => (formats.includes("qr_code") ? new Ctor({ formats: ["qr_code"] }) : null))
    .catch(() => null);
}

function getDetector(): Promise<BarcodeDetector | null> {
  if (!detectorPromise) detectorPromise = createDetector();
  return detectorPromise;
}

/**
 * Attempts to decode a QR code from a video frame already drawn onto
 * `canvas`. Prefers the native `BarcodeDetector` API when available, falling
 * back to the bundled `jsqr` decoder (works in all major browsers). Returns
 * the decoded text, or `null` if no QR code was found in this frame.
 */
export async function decodeFrame(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<string | null> {
  const detector = await getDetector();
  if (detector) {
    try {
      const barcodes = await detector.detect(canvas);
      const qr = barcodes.find((b) => b.rawValue);
      if (qr) return qr.rawValue;
      return null;
    } catch {
      // Native detector threw unexpectedly for this frame - fall through to jsQR below.
    }
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result?.data ?? null;
}
