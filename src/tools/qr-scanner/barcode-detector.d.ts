/**
 * Minimal ambient types for the experimental `BarcodeDetector` Web API
 * (Chrome/Edge only, not yet part of TypeScript's bundled DOM lib). Only the
 * members this tool actually uses are declared.
 */
interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(image: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
