import linkSvg from "./example-qr-assets/link.svg?raw";
import wifiSvg from "./example-qr-assets/wifi.svg?raw";
import totpSvg from "./example-qr-assets/totp.svg?raw";
import deviceLinkSvg from "./example-qr-assets/devicelink.svg?raw";
import textSvg from "./example-qr-assets/text.svg?raw";

export interface QrExample {
  /** Short label for what kind of QR code this is (shown in the example nav). */
  label: string;
  /** Pre-rendered SVG markup for the QR code (static asset - generated once, bundled as-is). */
  svg: string;
}

/** A handful of representative QR codes to test the scanner with, one supported kind each. */
export const QR_EXAMPLES: QrExample[] = [
  { label: "Link", svg: linkSvg },
  { label: "Wi-Fi network", svg: wifiSvg },
  { label: "TOTP / authenticator", svg: totpSvg },
  { label: "Autopilot DeviceLink", svg: deviceLinkSvg },
  { label: "Plain text", svg: textSvg },
];
