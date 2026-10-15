/**
 * Decodes a raw EDID (Extended Display Identification Data) binary blob per
 * the VESA E-EDID Standard (base 128-byte block, release 1.4), plus any
 * appended CEA-861/CTA-861 extension blocks (industry-standard timing/audio/
 * HDMI capability data). Byte/bit layouts below were cross-confirmed against
 * the Linux kernel's `drivers/gpu/drm/drm_edid.c` (the canonical open-source
 * EDID/CTA-861 parser) rather than guessed; a few fields that aren't
 * confirmed anywhere reliable (e.g. most Video Capability Data Block bits,
 * HDMI "Supports_AI") are intentionally left undecoded.
 */

export interface EdidVideoInputDigital {
  signalType: "Digital";
  bitDepth: string;
  videoInterface: string;
}

export interface EdidVideoInputAnalog {
  signalType: "Analog";
  signalLevelStandard: string;
  blankToBlackSetup: boolean;
  separateSyncSupported: boolean;
  compositeSyncOnHorizontalSupported: boolean;
  syncOnGreenSupported: boolean;
  serratedVerticalSyncSupported: boolean;
}

export type EdidVideoInput = EdidVideoInputDigital | EdidVideoInputAnalog;

export interface EdidChromaticity {
  red: { x: number; y: number };
  green: { x: number; y: number };
  blue: { x: number; y: number };
  white: { x: number; y: number };
}

export interface EdidStandardTiming {
  horizontalPixels: number;
  verticalPixels: number;
  aspectRatio: string;
  refreshRateHz: number;
}

export interface EdidDetailedTiming {
  type: "detailedTiming";
  isPreferred: boolean;
  pixelClockMHz: number;
  horizontalActivePixels: number;
  horizontalBlankingPixels: number;
  verticalActiveLines: number;
  verticalBlankingLines: number;
  horizontalSyncOffsetPixels: number;
  horizontalSyncPulseWidthPixels: number;
  verticalSyncOffsetLines: number;
  verticalSyncPulseWidthLines: number;
  horizontalImageSizeMm: number;
  verticalImageSizeMm: number;
  horizontalBorderPixels: number;
  verticalBorderLines: number;
  interlaced: boolean;
  refreshRateHz: number;
}

export interface EdidRangeLimitsDescriptor {
  type: "rangeLimits";
  minVerticalRateHz: number;
  maxVerticalRateHz: number;
  minHorizontalRateKHz: number;
  maxHorizontalRateKHz: number;
  maxPixelClockMHz: number;
}

export interface EdidTextDescriptor {
  type: "monitorName" | "serialNumber" | "unspecifiedText";
  value: string;
}

export interface EdidUnknownDescriptor {
  type: "unknown" | "dummy" | "additionalStandardTimings" | "additionalWhitePoint";
  tagHex: string;
  rawHex: string;
}

export type EdidDescriptor =
  | EdidDetailedTiming
  | EdidRangeLimitsDescriptor
  | EdidTextDescriptor
  | EdidUnknownDescriptor;

/** One CTA-861 Video Identification Code (VIC), resolved to a resolution/refresh-rate/aspect-ratio. */
export interface CeaVideoDescriptor {
  vic: number;
  width: number;
  height: number;
  refreshHz: number;
  interlaced: boolean;
  aspectRatio: string;
  /** True when this VIC was flagged as the display's "native" format (Video Data Block only). */
  native: boolean;
}

export interface CeaAudioFormatDescriptor {
  formatCode: number;
  formatName: string;
  maxChannels: number;
  sampleRatesKHz: number[];
  /** LPCM-only: supported sample bit depths. */
  lpcmBitDepths?: number[];
  /** Compressed formats only: maximum bitrate in kbps. */
  maxBitrateKbps?: number;
}

export interface CeaSpeakerAllocation {
  speakers: string[];
  rawHex: string;
}

export interface CeaHdmiVendorBlock {
  kind: "hdmi";
  sourcePhysicalAddress: string;
  supportsDeepColor30Bit: boolean;
  supportsDeepColor36Bit: boolean;
  supportsDeepColor48Bit: boolean;
  supportsDeepColorYCbCr444: boolean;
  supportsDviDual: boolean;
  maxTmdsClockMHz: number | null;
}

export interface CeaHdmiForumVendorBlock {
  kind: "hdmiForum";
  versionMajor: number;
  maxTmdsCharacterRateMHz: number | null;
  scdcPresent: boolean;
  scdcReadRequestSupported: boolean;
  lowRateScramblingSupported: boolean;
}

export interface CeaUnknownVendorBlock {
  kind: "unknown";
  ieeeOuiHex: string;
  rawHex: string;
}

export type CeaVendorBlock = CeaHdmiVendorBlock | CeaHdmiForumVendorBlock | CeaUnknownVendorBlock;

export interface CeaColorimetry {
  xvYcc601: boolean;
  xvYcc709: boolean;
  sYcc601: boolean;
  adobeYcc601: boolean;
  adobeRgb: boolean;
  bt2020cYcc: boolean;
  bt2020Ycc: boolean;
  bt2020Rgb: boolean;
}

export interface CeaHdrStaticMetadata {
  supportsTraditionalSdr: boolean;
  supportsTraditionalHdr: boolean;
  supportsSmpteSt2084: boolean;
  supportsHlg: boolean;
  supportsStaticMetadataType1: boolean;
  maxLuminanceCdM2: number | null;
  maxFrameAverageLuminanceCdM2: number | null;
  minLuminanceCdM2: number | null;
}

export interface CeaVideoCapability {
  /** Quantization range (RGB) is selectable via AVI Q bits, rather than fixed by output format. */
  quantizationRangeSelectable: boolean;
}

export interface CeaUnknownDataBlock {
  kind: "unknown";
  tag: number;
  extendedTag: number | null;
  rawHex: string;
}

export type CeaDataBlock =
  | { kind: "audio"; formats: CeaAudioFormatDescriptor[] }
  | { kind: "video"; descriptors: CeaVideoDescriptor[] }
  | { kind: "ycbcr420Video"; descriptors: CeaVideoDescriptor[] }
  | { kind: "speakerAllocation"; allocation: CeaSpeakerAllocation }
  | { kind: "vendorSpecific"; block: CeaVendorBlock }
  | { kind: "colorimetry"; colorimetry: CeaColorimetry }
  | { kind: "hdrStaticMetadata"; metadata: CeaHdrStaticMetadata }
  | { kind: "videoCapability"; capability: CeaVideoCapability }
  | CeaUnknownDataBlock;

export interface EdidExtensionBlock {
  tagHex: string;
  isCea861: boolean;
  revision: number | null;
  underscanSupported: boolean;
  basicAudioSupported: boolean;
  ycbcr444Supported: boolean;
  ycbcr422Supported: boolean;
  dataBlocks: CeaDataBlock[];
  detailedTimings: EdidDetailedTiming[];
  rawHex: string;
}

export interface DecodedEdid {
  manufacturerId: string;
  productCodeHex: string;
  serialNumberHex: string;
  manufactureWeek: number | null;
  manufactureYear: number;
  yearIsModelYear: boolean;
  edidVersion: string;
  videoInput: EdidVideoInput;
  maxHorizontalImageSizeCm: number;
  maxVerticalImageSizeCm: number;
  screenSizeUndefined: boolean;
  gamma: number | null;
  featureSupport: {
    dpmsStandbySupported: boolean;
    dpmsSuspendSupported: boolean;
    dpmsActiveOffSupported: boolean;
    displayType: string;
    standardSrgbIsDefaultColorSpace: boolean;
    preferredTimingModeSpecified: boolean;
    continuousTimingsSupported: boolean;
  };
  chromaticity: EdidChromaticity;
  establishedTimings: string[];
  standardTimings: EdidStandardTiming[];
  descriptors: EdidDescriptor[];
  monitorName: string | null;
  serialNumberString: string | null;
  preferredTiming: EdidDetailedTiming | null;
  extensionBlockCount: number;
  checksumValid: boolean;
  rawHex: string;
  extensionBlocksHex: string[];
  extensions: EdidExtensionBlock[];
}

/** One monitor's EDID input, as pasted or extracted from the PowerShell JSON output. */
export interface EdidInputEntry {
  devicePath: string | null;
  hex: string;
  /** Whether Windows currently reports this display as connected. `null` when the input didn't include this (e.g. raw hex, or an older PowerShell output). */
  connected: boolean | null;
  /** Whether this is an internal panel (e.g. a laptop's built-in screen) rather than an external monitor. `null` when unknown. */
  internal: boolean | null;
}

export class EdidDecodeError extends Error {}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  if (cleaned.length === 0) throw new EdidDecodeError("No hex data found.");
  if (cleaned.length % 2 !== 0) throw new EdidDecodeError("Hex string has an odd number of digits.");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

const MANUFACTURER_HEADER = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];

function decodeManufacturerId(bytes: Uint8Array): string {
  const value = (bytes[8] << 8) | bytes[9];
  const l1 = (value >> 10) & 0x1f;
  const l2 = (value >> 5) & 0x1f;
  const l3 = value & 0x1f;
  return [l1, l2, l3].map((n) => String.fromCharCode(64 + n)).join("");
}

function decodeAsciiDescriptorText(block: Uint8Array): string {
  // Bytes 5-17 (13 bytes), text terminated by 0x0A and padded with 0x20.
  const slice = block.subarray(5, 18);
  const terminator = slice.indexOf(0x0a);
  const text = terminator === -1 ? slice : slice.subarray(0, terminator);
  return new TextDecoder("ascii").decode(text).trimEnd();
}

function decodeDetailedTiming(block: Uint8Array, isPreferred: boolean): EdidDetailedTiming {
  const pixelClock10kHz = block[0] | (block[1] << 8);
  const hActive = block[2] | ((block[4] >> 4) << 8);
  const hBlank = block[3] | ((block[4] & 0x0f) << 8);
  const vActive = block[5] | ((block[7] >> 4) << 8);
  const vBlank = block[6] | ((block[7] & 0x0f) << 8);
  const hSyncOffset = block[8] | ((block[11] >> 6) << 8);
  const hSyncWidth = block[9] | (((block[11] >> 4) & 0x03) << 8);
  const vSyncOffset = (block[10] >> 4) | (((block[11] >> 2) & 0x03) << 4);
  const vSyncWidth = (block[10] & 0x0f) | ((block[11] & 0x03) << 4);
  const hImageSize = block[12] | ((block[14] >> 4) << 8);
  const vImageSize = block[13] | ((block[14] & 0x0f) << 8);
  const hBorder = block[15];
  const vBorder = block[16];
  const interlaced = (block[17] & 0x80) !== 0;

  const pixelClockMHz = pixelClock10kHz / 100;
  const totalH = hActive + hBlank;
  const totalV = vActive + vBlank;
  const refreshRateHz = totalH > 0 && totalV > 0 ? (pixelClock10kHz * 10000) / (totalH * totalV) : 0;

  return {
    type: "detailedTiming",
    isPreferred,
    pixelClockMHz: Math.round(pixelClockMHz * 100) / 100,
    horizontalActivePixels: hActive,
    horizontalBlankingPixels: hBlank,
    verticalActiveLines: vActive,
    verticalBlankingLines: vBlank,
    horizontalSyncOffsetPixels: hSyncOffset,
    horizontalSyncPulseWidthPixels: hSyncWidth,
    verticalSyncOffsetLines: vSyncOffset,
    verticalSyncPulseWidthLines: vSyncWidth,
    horizontalImageSizeMm: hImageSize,
    verticalImageSizeMm: vImageSize,
    horizontalBorderPixels: hBorder,
    verticalBorderLines: vBorder,
    interlaced,
    refreshRateHz: Math.round(refreshRateHz * 100) / 100,
  };
}

function decodeDescriptor(block: Uint8Array, index: number): EdidDescriptor {
  const isDetailedTiming = !(block[0] === 0 && block[1] === 0);
  if (isDetailedTiming) return decodeDetailedTiming(block, index === 0);

  const tag = block[3];
  const tagHex = `0x${tag.toString(16).toUpperCase().padStart(2, "0")}`;
  switch (tag) {
    case 0xff:
      return { type: "serialNumber", value: decodeAsciiDescriptorText(block) };
    case 0xfe:
      return { type: "unspecifiedText", value: decodeAsciiDescriptorText(block) };
    case 0xfc:
      return { type: "monitorName", value: decodeAsciiDescriptorText(block) };
    case 0xfd: {
      const minV = block[5];
      const maxV = block[6];
      const minH = block[7];
      const maxH = block[8];
      const maxPixelClockMHz = block[9] === 0xff ? 0 : block[9] * 10;
      return {
        type: "rangeLimits",
        minVerticalRateHz: minV,
        maxVerticalRateHz: maxV,
        minHorizontalRateKHz: minH,
        maxHorizontalRateKHz: maxH,
        maxPixelClockMHz,
      };
    }
    case 0xfb:
      return { type: "additionalWhitePoint", tagHex, rawHex: bytesToHex(block) };
    case 0xfa:
      return { type: "additionalStandardTimings", tagHex, rawHex: bytesToHex(block) };
    case 0x10:
      return { type: "dummy", tagHex, rawHex: bytesToHex(block) };
    default:
      return { type: "unknown", tagHex, rawHex: bytesToHex(block) };
  }
}

const ESTABLISHED_TIMINGS: Array<{ byte: 35 | 36 | 37; bit: number; label: string }> = [
  { byte: 35, bit: 7, label: "720x400 @ 70Hz" },
  { byte: 35, bit: 6, label: "720x400 @ 88Hz" },
  { byte: 35, bit: 5, label: "640x480 @ 60Hz" },
  { byte: 35, bit: 4, label: "640x480 @ 67Hz" },
  { byte: 35, bit: 3, label: "640x480 @ 72Hz" },
  { byte: 35, bit: 2, label: "640x480 @ 75Hz" },
  { byte: 35, bit: 1, label: "800x600 @ 56Hz" },
  { byte: 35, bit: 0, label: "800x600 @ 60Hz" },
  { byte: 36, bit: 7, label: "800x600 @ 72Hz" },
  { byte: 36, bit: 6, label: "800x600 @ 75Hz" },
  { byte: 36, bit: 5, label: "832x624 @ 75Hz" },
  { byte: 36, bit: 4, label: "1024x768 @ 87Hz (interlaced)" },
  { byte: 36, bit: 3, label: "1024x768 @ 60Hz" },
  { byte: 36, bit: 2, label: "1024x768 @ 70Hz" },
  { byte: 36, bit: 1, label: "1024x768 @ 75Hz" },
  { byte: 36, bit: 0, label: "1280x1024 @ 75Hz" },
  { byte: 37, bit: 7, label: "1152x870 @ 75Hz" },
];

function decodeEstablishedTimings(bytes: Uint8Array): string[] {
  return ESTABLISHED_TIMINGS.filter((t) => (bytes[t.byte] & (1 << t.bit)) !== 0).map((t) => t.label);
}

const STANDARD_TIMING_ASPECT_RATIOS = ["16:10", "4:3", "5:4", "16:9"] as const;

function decodeStandardTimings(bytes: Uint8Array): EdidStandardTiming[] {
  const timings: EdidStandardTiming[] = [];
  for (let i = 0; i < 8; i++) {
    const byteA = bytes[38 + i * 2];
    const byteB = bytes[38 + i * 2 + 1];
    if (byteA === 0x01 && byteB === 0x01) continue; // unused slot
    const horizontalPixels = (byteA + 31) * 8;
    const aspectRatioCode = (byteB >> 6) & 0x03;
    const aspectRatio = STANDARD_TIMING_ASPECT_RATIOS[aspectRatioCode];
    const refreshRateHz = (byteB & 0x3f) + 60;
    const verticalPixels = Math.round(
      aspectRatio === "16:10"
        ? (horizontalPixels * 10) / 16
        : aspectRatio === "4:3"
          ? (horizontalPixels * 3) / 4
          : aspectRatio === "5:4"
            ? (horizontalPixels * 4) / 5
            : (horizontalPixels * 9) / 16,
    );
    timings.push({ horizontalPixels, verticalPixels, aspectRatio, refreshRateHz });
  }
  return timings;
}

function decodeChromaticityCoord(highByte: number, low2Bits: number): number {
  return ((highByte << 2) | low2Bits) / 1024;
}

function decodeChromaticity(bytes: Uint8Array): EdidChromaticity {
  const rgLow = bytes[25];
  const bwLow = bytes[26];
  return {
    red: {
      x: decodeChromaticityCoord(bytes[27], (rgLow >> 6) & 0x03),
      y: decodeChromaticityCoord(bytes[28], (rgLow >> 4) & 0x03),
    },
    green: {
      x: decodeChromaticityCoord(bytes[29], (rgLow >> 2) & 0x03),
      y: decodeChromaticityCoord(bytes[30], rgLow & 0x03),
    },
    blue: {
      x: decodeChromaticityCoord(bytes[31], (bwLow >> 6) & 0x03),
      y: decodeChromaticityCoord(bytes[32], (bwLow >> 4) & 0x03),
    },
    white: {
      x: decodeChromaticityCoord(bytes[33], (bwLow >> 2) & 0x03),
      y: decodeChromaticityCoord(bytes[34], bwLow & 0x03),
    },
  };
}

const DIGITAL_BIT_DEPTHS = ["Undefined", "6 bpc", "8 bpc", "10 bpc", "12 bpc", "14 bpc", "16 bpc", "Reserved"];
const DIGITAL_INTERFACES = ["Undefined", "DVI", "HDMI-a", "HDMI-b", "MDDI", "DisplayPort"];
const ANALOG_SIGNAL_LEVELS = [
  "0.700, 0.300 (V p-p)",
  "0.714, 0.286 (V p-p)",
  "1.000, 0.400 (V p-p)",
  "0.700, 0.000 (V p-p)",
];

function decodeVideoInput(byte20: number): EdidVideoInput {
  const isDigital = (byte20 & 0x80) !== 0;
  if (isDigital) {
    const bitDepthCode = (byte20 >> 4) & 0x07;
    const interfaceCode = byte20 & 0x0f;
    return {
      signalType: "Digital",
      bitDepth: DIGITAL_BIT_DEPTHS[bitDepthCode] ?? "Reserved",
      videoInterface: DIGITAL_INTERFACES[interfaceCode] ?? "Reserved",
    };
  }
  const signalLevelCode = (byte20 >> 5) & 0x03;
  return {
    signalType: "Analog",
    signalLevelStandard: ANALOG_SIGNAL_LEVELS[signalLevelCode],
    blankToBlackSetup: (byte20 & 0x10) !== 0,
    separateSyncSupported: (byte20 & 0x08) !== 0,
    compositeSyncOnHorizontalSupported: (byte20 & 0x04) !== 0,
    syncOnGreenSupported: (byte20 & 0x02) !== 0,
    serratedVerticalSyncSupported: (byte20 & 0x01) !== 0,
  };
}

const DIGITAL_DISPLAY_TYPES = [
  "RGB 4:4:4",
  "RGB 4:4:4 + YCrCb 4:4:4",
  "RGB 4:4:4 + YCrCb 4:2:2",
  "RGB 4:4:4 + YCrCb 4:4:4 + YCrCb 4:2:2",
];
const ANALOG_DISPLAY_TYPES = ["Monochrome / grayscale", "RGB color", "Non-RGB color", "Undefined"];

/**
 * CTA-861 Video Identification Code (VIC) table, VIC 1-127 and 193-219 (VIC
 * 128-192 is reserved). Source: the Linux kernel's `drm_edid.c`
 * `edid_cea_modes_1`/`edid_cea_modes_193` tables, whose entries are commented
 * "From CEA/CTA-861 spec" with the exact resolution/refresh/aspect ratio per
 * VIC - i.e. transcribed from the published standard, not guessed.
 */
const VIC_TABLE: Record<number, { width: number; height: number; refreshHz: number; interlaced: boolean; aspectRatio: string }> = {
  1: { width: 640, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "4:3" },
  2: { width: 720, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "4:3" },
  3: { width: 720, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  4: { width: 1280, height: 720, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  5: { width: 1920, height: 1080, refreshHz: 60, interlaced: true, aspectRatio: "16:9" },
  6: { width: 720, height: 480, refreshHz: 60, interlaced: true, aspectRatio: "4:3" },
  7: { width: 720, height: 480, refreshHz: 60, interlaced: true, aspectRatio: "16:9" },
  8: { width: 720, height: 240, refreshHz: 60, interlaced: false, aspectRatio: "4:3" },
  9: { width: 720, height: 240, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  10: { width: 2880, height: 480, refreshHz: 60, interlaced: true, aspectRatio: "4:3" },
  11: { width: 2880, height: 480, refreshHz: 60, interlaced: true, aspectRatio: "16:9" },
  12: { width: 2880, height: 240, refreshHz: 60, interlaced: false, aspectRatio: "4:3" },
  13: { width: 2880, height: 240, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  14: { width: 1440, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "4:3" },
  15: { width: 1440, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  16: { width: 1920, height: 1080, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  17: { width: 720, height: 576, refreshHz: 50, interlaced: false, aspectRatio: "4:3" },
  18: { width: 720, height: 576, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  19: { width: 1280, height: 720, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  20: { width: 1920, height: 1080, refreshHz: 50, interlaced: true, aspectRatio: "16:9" },
  21: { width: 720, height: 576, refreshHz: 50, interlaced: true, aspectRatio: "4:3" },
  22: { width: 720, height: 576, refreshHz: 50, interlaced: true, aspectRatio: "16:9" },
  23: { width: 720, height: 288, refreshHz: 50, interlaced: false, aspectRatio: "4:3" },
  24: { width: 720, height: 288, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  25: { width: 2880, height: 576, refreshHz: 50, interlaced: true, aspectRatio: "4:3" },
  26: { width: 2880, height: 576, refreshHz: 50, interlaced: true, aspectRatio: "16:9" },
  27: { width: 2880, height: 288, refreshHz: 50, interlaced: false, aspectRatio: "4:3" },
  28: { width: 2880, height: 288, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  29: { width: 1440, height: 576, refreshHz: 50, interlaced: false, aspectRatio: "4:3" },
  30: { width: 1440, height: 576, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  31: { width: 1920, height: 1080, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  32: { width: 1920, height: 1080, refreshHz: 24, interlaced: false, aspectRatio: "16:9" },
  33: { width: 1920, height: 1080, refreshHz: 25, interlaced: false, aspectRatio: "16:9" },
  34: { width: 1920, height: 1080, refreshHz: 30, interlaced: false, aspectRatio: "16:9" },
  35: { width: 2880, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "4:3" },
  36: { width: 2880, height: 480, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  37: { width: 2880, height: 576, refreshHz: 50, interlaced: false, aspectRatio: "4:3" },
  38: { width: 2880, height: 576, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  39: { width: 1920, height: 1080, refreshHz: 50, interlaced: true, aspectRatio: "16:9" },
  40: { width: 1920, height: 1080, refreshHz: 100, interlaced: true, aspectRatio: "16:9" },
  41: { width: 1280, height: 720, refreshHz: 100, interlaced: false, aspectRatio: "16:9" },
  42: { width: 720, height: 576, refreshHz: 100, interlaced: false, aspectRatio: "4:3" },
  43: { width: 720, height: 576, refreshHz: 100, interlaced: false, aspectRatio: "16:9" },
  44: { width: 720, height: 576, refreshHz: 100, interlaced: true, aspectRatio: "4:3" },
  45: { width: 720, height: 576, refreshHz: 100, interlaced: true, aspectRatio: "16:9" },
  46: { width: 1920, height: 1080, refreshHz: 120, interlaced: true, aspectRatio: "16:9" },
  47: { width: 1280, height: 720, refreshHz: 120, interlaced: false, aspectRatio: "16:9" },
  48: { width: 720, height: 480, refreshHz: 120, interlaced: false, aspectRatio: "4:3" },
  49: { width: 720, height: 480, refreshHz: 120, interlaced: false, aspectRatio: "16:9" },
  50: { width: 720, height: 480, refreshHz: 120, interlaced: true, aspectRatio: "4:3" },
  51: { width: 720, height: 480, refreshHz: 120, interlaced: true, aspectRatio: "16:9" },
  52: { width: 720, height: 576, refreshHz: 200, interlaced: false, aspectRatio: "4:3" },
  53: { width: 720, height: 576, refreshHz: 200, interlaced: false, aspectRatio: "16:9" },
  54: { width: 720, height: 576, refreshHz: 200, interlaced: true, aspectRatio: "4:3" },
  55: { width: 720, height: 576, refreshHz: 200, interlaced: true, aspectRatio: "16:9" },
  56: { width: 720, height: 480, refreshHz: 240, interlaced: false, aspectRatio: "4:3" },
  57: { width: 720, height: 480, refreshHz: 240, interlaced: false, aspectRatio: "16:9" },
  58: { width: 720, height: 480, refreshHz: 240, interlaced: true, aspectRatio: "4:3" },
  59: { width: 720, height: 480, refreshHz: 240, interlaced: true, aspectRatio: "16:9" },
  60: { width: 1280, height: 720, refreshHz: 24, interlaced: false, aspectRatio: "16:9" },
  61: { width: 1280, height: 720, refreshHz: 25, interlaced: false, aspectRatio: "16:9" },
  62: { width: 1280, height: 720, refreshHz: 30, interlaced: false, aspectRatio: "16:9" },
  63: { width: 1920, height: 1080, refreshHz: 120, interlaced: false, aspectRatio: "16:9" },
  64: { width: 1920, height: 1080, refreshHz: 100, interlaced: false, aspectRatio: "16:9" },
  65: { width: 1280, height: 720, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  66: { width: 1280, height: 720, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  67: { width: 1280, height: 720, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  68: { width: 1280, height: 720, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  69: { width: 1280, height: 720, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  70: { width: 1280, height: 720, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  71: { width: 1280, height: 720, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  72: { width: 1920, height: 1080, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  73: { width: 1920, height: 1080, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  74: { width: 1920, height: 1080, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  75: { width: 1920, height: 1080, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  76: { width: 1920, height: 1080, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  77: { width: 1920, height: 1080, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  78: { width: 1920, height: 1080, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  79: { width: 1680, height: 720, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  80: { width: 1680, height: 720, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  81: { width: 1680, height: 720, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  82: { width: 1680, height: 720, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  83: { width: 1680, height: 720, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  84: { width: 1680, height: 720, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  85: { width: 1680, height: 720, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  86: { width: 2560, height: 1080, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  87: { width: 2560, height: 1080, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  88: { width: 2560, height: 1080, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  89: { width: 2560, height: 1080, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  90: { width: 2560, height: 1080, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  91: { width: 2560, height: 1080, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  92: { width: 2560, height: 1080, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  93: { width: 3840, height: 2160, refreshHz: 24, interlaced: false, aspectRatio: "16:9" },
  94: { width: 3840, height: 2160, refreshHz: 25, interlaced: false, aspectRatio: "16:9" },
  95: { width: 3840, height: 2160, refreshHz: 30, interlaced: false, aspectRatio: "16:9" },
  96: { width: 3840, height: 2160, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  97: { width: 3840, height: 2160, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  98: { width: 4096, height: 2160, refreshHz: 24, interlaced: false, aspectRatio: "256:135" },
  99: { width: 4096, height: 2160, refreshHz: 25, interlaced: false, aspectRatio: "256:135" },
  100: { width: 4096, height: 2160, refreshHz: 30, interlaced: false, aspectRatio: "256:135" },
  101: { width: 4096, height: 2160, refreshHz: 50, interlaced: false, aspectRatio: "256:135" },
  102: { width: 4096, height: 2160, refreshHz: 60, interlaced: false, aspectRatio: "256:135" },
  103: { width: 3840, height: 2160, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  104: { width: 3840, height: 2160, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  105: { width: 3840, height: 2160, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  106: { width: 3840, height: 2160, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  107: { width: 3840, height: 2160, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  108: { width: 1280, height: 720, refreshHz: 48, interlaced: false, aspectRatio: "16:9" },
  109: { width: 1280, height: 720, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  110: { width: 1680, height: 720, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  111: { width: 1920, height: 1080, refreshHz: 48, interlaced: false, aspectRatio: "16:9" },
  112: { width: 1920, height: 1080, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  113: { width: 2560, height: 1080, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  114: { width: 3840, height: 2160, refreshHz: 48, interlaced: false, aspectRatio: "16:9" },
  115: { width: 4096, height: 2160, refreshHz: 48, interlaced: false, aspectRatio: "256:135" },
  116: { width: 3840, height: 2160, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  117: { width: 3840, height: 2160, refreshHz: 100, interlaced: false, aspectRatio: "16:9" },
  118: { width: 3840, height: 2160, refreshHz: 120, interlaced: false, aspectRatio: "16:9" },
  119: { width: 3840, height: 2160, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  120: { width: 3840, height: 2160, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  121: { width: 5120, height: 2160, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  122: { width: 5120, height: 2160, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  123: { width: 5120, height: 2160, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  124: { width: 5120, height: 2160, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  125: { width: 5120, height: 2160, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  126: { width: 5120, height: 2160, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  127: { width: 5120, height: 2160, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  193: { width: 5120, height: 2160, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  194: { width: 7680, height: 4320, refreshHz: 24, interlaced: false, aspectRatio: "16:9" },
  195: { width: 7680, height: 4320, refreshHz: 25, interlaced: false, aspectRatio: "16:9" },
  196: { width: 7680, height: 4320, refreshHz: 30, interlaced: false, aspectRatio: "16:9" },
  197: { width: 7680, height: 4320, refreshHz: 48, interlaced: false, aspectRatio: "16:9" },
  198: { width: 7680, height: 4320, refreshHz: 50, interlaced: false, aspectRatio: "16:9" },
  199: { width: 7680, height: 4320, refreshHz: 60, interlaced: false, aspectRatio: "16:9" },
  200: { width: 7680, height: 4320, refreshHz: 100, interlaced: false, aspectRatio: "16:9" },
  201: { width: 7680, height: 4320, refreshHz: 120, interlaced: false, aspectRatio: "16:9" },
  202: { width: 7680, height: 4320, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  203: { width: 7680, height: 4320, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  204: { width: 7680, height: 4320, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  205: { width: 7680, height: 4320, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  206: { width: 7680, height: 4320, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  207: { width: 7680, height: 4320, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  208: { width: 7680, height: 4320, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  209: { width: 7680, height: 4320, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  210: { width: 10240, height: 4320, refreshHz: 24, interlaced: false, aspectRatio: "64:27" },
  211: { width: 10240, height: 4320, refreshHz: 25, interlaced: false, aspectRatio: "64:27" },
  212: { width: 10240, height: 4320, refreshHz: 30, interlaced: false, aspectRatio: "64:27" },
  213: { width: 10240, height: 4320, refreshHz: 48, interlaced: false, aspectRatio: "64:27" },
  214: { width: 10240, height: 4320, refreshHz: 50, interlaced: false, aspectRatio: "64:27" },
  215: { width: 10240, height: 4320, refreshHz: 60, interlaced: false, aspectRatio: "64:27" },
  216: { width: 10240, height: 4320, refreshHz: 100, interlaced: false, aspectRatio: "64:27" },
  217: { width: 10240, height: 4320, refreshHz: 120, interlaced: false, aspectRatio: "64:27" },
  218: { width: 4096, height: 2160, refreshHz: 100, interlaced: false, aspectRatio: "256:135" },
  219: { width: 4096, height: 2160, refreshHz: 120, interlaced: false, aspectRatio: "256:135" },
};

function resolveVic(vic: number, native: boolean): CeaVideoDescriptor {
  const mode = VIC_TABLE[vic];
  if (mode) return { vic, native, ...mode };
  return { vic, native, width: 0, height: 0, refreshHz: 0, interlaced: false, aspectRatio: "unknown" };
}

/**
 * CTA-861 Audio Format Codes (byte0 bits 6-3 of each Short Audio Descriptor).
 * This is the published CTA-861 table, not vendor/undocumented data.
 */
const AUDIO_FORMAT_NAMES: Record<number, string> = {
  1: "LPCM",
  2: "AC-3",
  3: "MPEG-1 (Layers 1 & 2)",
  4: "MP3 (MPEG-1 Layer 3)",
  5: "MPEG-2 (multichannel)",
  6: "AAC",
  7: "DTS",
  8: "ATRAC",
  9: "One-bit audio (Super Audio CD)",
  10: "Dolby Digital+ (E-AC-3)",
  11: "DTS-HD",
  12: "MAT (Dolby TrueHD)",
  13: "DST Audio",
  14: "WMA Pro",
  15: "Extended (see audio format code extension)",
};

/** Audio sample rate bitmap shared by SADs and other CTA-861 audio descriptors (byte1, bits 0-6). */
const AUDIO_SAMPLE_RATES_KHZ = [32, 44.1, 48, 88.2, 96, 176.4, 192];

function decodeAudioDataBlock(payload: Uint8Array): CeaAudioFormatDescriptor[] {
  const formats: CeaAudioFormatDescriptor[] = [];
  for (let i = 0; i + 3 <= payload.length; i += 3) {
    const byte0 = payload[i];
    const byte1 = payload[i + 1];
    const byte2 = payload[i + 2];
    const formatCode = (byte0 >> 3) & 0x0f;
    const maxChannels = (byte0 & 0x07) + 1;
    const sampleRatesKHz = AUDIO_SAMPLE_RATES_KHZ.filter((_, bit) => (byte1 & (1 << bit)) !== 0);
    const descriptor: CeaAudioFormatDescriptor = {
      formatCode,
      formatName: AUDIO_FORMAT_NAMES[formatCode] ?? `Reserved (${formatCode})`,
      maxChannels,
      sampleRatesKHz,
    };
    if (formatCode === 1) {
      descriptor.lpcmBitDepths = [16, 20, 24].filter((_, bit) => (byte2 & (1 << bit)) !== 0);
    } else if (formatCode >= 2 && formatCode <= 8) {
      descriptor.maxBitrateKbps = byte2 * 8;
    }
    formats.push(descriptor);
  }
  return formats;
}

/** Well-known/ubiquitous speaker channels decoded from byte1 of the Speaker Allocation Data Block. Source: CTA-861 spec (kernel copies these bytes raw without decoding, so this bit mapping is the public spec's, not kernel-confirmed). */
const SPEAKER_ALLOCATION_BITS = [
  "Front Left/Right",
  "Low Frequency Effects",
  "Front Center",
  "Rear Left/Right",
  "Rear Center",
  "Front Left/Right of Center",
  "Rear Left/Right Center",
  "Front Left/Right Wide",
];

function decodeSpeakerAllocation(payload: Uint8Array): CeaSpeakerAllocation {
  const byte1 = payload[0] ?? 0;
  const speakers = SPEAKER_ALLOCATION_BITS.filter((_, bit) => (byte1 & (1 << bit)) !== 0);
  return { speakers, rawHex: bytesToHex(payload) };
}

function decodeVideoDataBlock(payload: Uint8Array): CeaVideoDescriptor[] {
  return Array.from(payload, (b) => resolveVic(b & 0x7f, (b & 0x80) !== 0));
}

function decodeYcbcr420VideoDataBlock(payload: Uint8Array): CeaVideoDescriptor[] {
  return Array.from(payload, (b) => resolveVic(b & 0x7f, false));
}

const HDMI_IEEE_OUI = 0x000c03;
const HDMI_FORUM_IEEE_OUI = 0xc45dd8;

function decodeVendorSpecificBlock(payload: Uint8Array): CeaVendorBlock {
  const oui = (payload[2] << 16) | (payload[1] << 8) | payload[0];
  if (oui === HDMI_IEEE_OUI && payload.length >= 5) {
    const physAddr = (payload[3] << 8) | payload[4];
    const flags = payload[5] ?? 0;
    const maxTmdsByte = payload[6];
    return {
      kind: "hdmi",
      sourcePhysicalAddress: [12, 8, 4, 0].map((shift) => (physAddr >> shift) & 0xf).join("."),
      supportsDeepColor30Bit: (flags & (1 << 4)) !== 0,
      supportsDeepColor36Bit: (flags & (1 << 5)) !== 0,
      supportsDeepColor48Bit: (flags & (1 << 6)) !== 0,
      supportsDeepColorYCbCr444: (flags & (1 << 3)) !== 0,
      supportsDviDual: (flags & 0x01) !== 0,
      maxTmdsClockMHz: maxTmdsByte ? (maxTmdsByte * 5) / 1000 : null,
    };
  }
  if (oui === HDMI_FORUM_IEEE_OUI && payload.length >= 7) {
    const maxTmdsCharRateByte = payload[5];
    const flags = payload[6] ?? 0;
    return {
      kind: "hdmiForum",
      versionMajor: payload[3] ?? 0,
      maxTmdsCharacterRateMHz: maxTmdsCharRateByte ? (maxTmdsCharRateByte * 5) / 1000 : null,
      scdcPresent: (flags & (1 << 7)) !== 0,
      scdcReadRequestSupported: (flags & (1 << 6)) !== 0,
      lowRateScramblingSupported: (flags & (1 << 3)) !== 0,
    };
  }
  return { kind: "unknown", ieeeOuiHex: `0x${oui.toString(16).toUpperCase().padStart(6, "0")}`, rawHex: bytesToHex(payload) };
}

function decodeColorimetry(payload: Uint8Array): CeaColorimetry {
  const byte3 = payload[0] ?? 0;
  // byte4 (payload[1], MD0/MD1/MD2 gamut metadata profiles) intentionally not surfaced - rarely used, low value.
  return {
    xvYcc601: (byte3 & (1 << 0)) !== 0,
    xvYcc709: (byte3 & (1 << 1)) !== 0,
    sYcc601: (byte3 & (1 << 2)) !== 0,
    adobeYcc601: (byte3 & (1 << 3)) !== 0,
    adobeRgb: (byte3 & (1 << 4)) !== 0,
    bt2020cYcc: (byte3 & (1 << 5)) !== 0,
    bt2020Ycc: (byte3 & (1 << 6)) !== 0,
    bt2020Rgb: (byte3 & (1 << 7)) !== 0,
  };
}

function decodeHdrStaticMetadata(payload: Uint8Array): CeaHdrStaticMetadata {
  const eotf = payload[0] ?? 0;
  const metadataType = payload[1] ?? 0;
  const maxCll = payload[2];
  const maxFall = payload[3];
  const minCll = payload[4];
  const luminanceFromCv = (cv: number | undefined) => (cv === undefined ? null : 50 * Math.pow(2, cv / 32));
  const maxLuminanceCdM2 = luminanceFromCv(maxCll);
  return {
    supportsTraditionalSdr: (eotf & (1 << 0)) !== 0,
    supportsTraditionalHdr: (eotf & (1 << 1)) !== 0,
    supportsSmpteSt2084: (eotf & (1 << 2)) !== 0,
    supportsHlg: (eotf & (1 << 3)) !== 0,
    supportsStaticMetadataType1: (metadataType & (1 << 0)) !== 0,
    maxLuminanceCdM2: maxLuminanceCdM2 !== null ? Math.round(maxLuminanceCdM2) : null,
    maxFrameAverageLuminanceCdM2: luminanceFromCv(maxFall) !== null ? Math.round(luminanceFromCv(maxFall)!) : null,
    minLuminanceCdM2:
      minCll !== undefined && maxLuminanceCdM2 !== null
        ? Math.round(maxLuminanceCdM2 * Math.pow(minCll / 255, 2) * 100) / 100
        : null,
  };
}

function decodeVideoCapability(payload: Uint8Array): CeaVideoCapability {
  const byte = payload[0] ?? 0;
  return { quantizationRangeSelectable: (byte & (1 << 6)) !== 0 };
}

/** Decodes one 128-byte CEA-861/CTA-861 extension block (tag 0x02) appended after the base EDID block. */
function decodeCeaExtension(bytes: Uint8Array): EdidExtensionBlock {
  const tag = bytes[0];
  const tagHex = `0x${tag.toString(16).toUpperCase().padStart(2, "0")}`;
  const isCea861 = tag === 0x02;
  const revision = isCea861 ? bytes[1] : null;
  const dtdOffset = bytes[2];
  const flags = bytes[3] ?? 0;

  const dataBlocks: CeaDataBlock[] = [];
  const detailedTimings: EdidDetailedTiming[] = [];

  if (isCea861 && dtdOffset >= 4) {
    let offset = 4;
    while (offset < dtdOffset) {
      const header = bytes[offset];
      const blockTag = (header >> 5) & 0x07;
      const blockLength = header & 0x1f;
      const payload = bytes.subarray(offset + 1, offset + 1 + blockLength);
      if (blockTag === 1) {
        dataBlocks.push({ kind: "audio", formats: decodeAudioDataBlock(payload) });
      } else if (blockTag === 2) {
        dataBlocks.push({ kind: "video", descriptors: decodeVideoDataBlock(payload) });
      } else if (blockTag === 3) {
        dataBlocks.push({ kind: "vendorSpecific", block: decodeVendorSpecificBlock(payload) });
      } else if (blockTag === 4) {
        dataBlocks.push({ kind: "speakerAllocation", allocation: decodeSpeakerAllocation(payload) });
      } else if (blockTag === 7 && payload.length >= 1) {
        const extendedTag = payload[0];
        const extPayload = payload.subarray(1);
        if (extendedTag === 0) {
          dataBlocks.push({ kind: "videoCapability", capability: decodeVideoCapability(extPayload) });
        } else if (extendedTag === 5) {
          dataBlocks.push({ kind: "colorimetry", colorimetry: decodeColorimetry(extPayload) });
        } else if (extendedTag === 6) {
          dataBlocks.push({ kind: "hdrStaticMetadata", metadata: decodeHdrStaticMetadata(extPayload) });
        } else if (extendedTag === 14) {
          dataBlocks.push({ kind: "ycbcr420Video", descriptors: decodeYcbcr420VideoDataBlock(extPayload) });
        } else {
          dataBlocks.push({ kind: "unknown", tag: blockTag, extendedTag, rawHex: bytesToHex(payload) });
        }
      } else {
        dataBlocks.push({ kind: "unknown", tag: blockTag, extendedTag: null, rawHex: bytesToHex(payload) });
      }
      offset += 1 + blockLength;
    }

    for (let offset2 = dtdOffset; offset2 + 18 <= 127; offset2 += 18) {
      const block = bytes.subarray(offset2, offset2 + 18);
      if (block[0] === 0 && block[1] === 0) break; // padding / no more DTDs
      detailedTimings.push(decodeDetailedTiming(block, detailedTimings.length === 0));
    }
  }

  return {
    tagHex,
    isCea861,
    revision,
    underscanSupported: (flags & (1 << 7)) !== 0,
    basicAudioSupported: (flags & (1 << 6)) !== 0,
    ycbcr444Supported: (flags & (1 << 5)) !== 0,
    ycbcr422Supported: (flags & (1 << 4)) !== 0,
    dataBlocks,
    detailedTimings,
    rawHex: bytesToHex(bytes),
  };
}

/** Decodes one 128-byte base EDID block (plus any appended extension blocks, kept raw) from a hex string. */
export function decodeEdidHex(hex: string): DecodedEdid {
  const allBytes = hexToBytes(hex);
  if (allBytes.length < 128) throw new EdidDecodeError(`EDID data is too short (${allBytes.length} bytes, expected at least 128).`);
  const bytes = allBytes.subarray(0, 128);

  if (!MANUFACTURER_HEADER.every((b, i) => bytes[i] === b)) {
    throw new EdidDecodeError("Missing EDID header magic bytes (00 FF FF FF FF FF FF 00) - this doesn't look like a valid EDID.");
  }

  const checksum = allBytes.subarray(0, 128).reduce((sum, b) => (sum + b) & 0xff, 0);

  const week = bytes[16];
  const yearIsModelYear = week === 255;
  const videoInput = decodeVideoInput(bytes[20]);
  const screenSizeUndefined = bytes[21] === 0 && bytes[22] === 0;

  const feature = bytes[24];
  const displayTypeCode = (feature >> 3) & 0x03;
  const displayType =
    videoInput.signalType === "Digital" ? DIGITAL_DISPLAY_TYPES[displayTypeCode] : ANALOG_DISPLAY_TYPES[displayTypeCode];

  const descriptors: EdidDescriptor[] = [];
  for (let i = 0; i < 4; i++) {
    const offset = 54 + i * 18;
    descriptors.push(decodeDescriptor(bytes.subarray(offset, offset + 18), i));
  }

  const monitorName = descriptors.find((d): d is EdidTextDescriptor => d.type === "monitorName")?.value ?? null;
  const serialNumberString = descriptors.find((d): d is EdidTextDescriptor => d.type === "serialNumber")?.value ?? null;
  const preferredTiming = descriptors.find((d): d is EdidDetailedTiming => d.type === "detailedTiming" && d.isPreferred) ?? null;

  const extensionBlockCount = bytes[126];
  const extensionBlocksHex: string[] = [];
  const extensions: EdidExtensionBlock[] = [];
  for (let i = 0; i < extensionBlockCount; i++) {
    const start = 128 + i * 128;
    if (allBytes.length >= start + 128) {
      const block = allBytes.subarray(start, start + 128);
      extensionBlocksHex.push(bytesToHex(block));
      extensions.push(decodeCeaExtension(block));
    }
  }

  return {
    manufacturerId: decodeManufacturerId(bytes),
    productCodeHex: `0x${(bytes[10] | (bytes[11] << 8)).toString(16).toUpperCase().padStart(4, "0")}`,
    serialNumberHex: `0x${((bytes[12] | (bytes[13] << 8) | (bytes[14] << 16) | (bytes[15] << 24)) >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
    manufactureWeek: week === 0 || week === 255 ? null : week,
    manufactureYear: bytes[17] + 1990,
    yearIsModelYear,
    edidVersion: `${bytes[18]}.${bytes[19]}`,
    videoInput,
    maxHorizontalImageSizeCm: bytes[21],
    maxVerticalImageSizeCm: bytes[22],
    screenSizeUndefined,
    gamma: bytes[23] === 0xff ? null : (bytes[23] + 100) / 100,
    featureSupport: {
      dpmsStandbySupported: (feature & 0x80) !== 0,
      dpmsSuspendSupported: (feature & 0x40) !== 0,
      dpmsActiveOffSupported: (feature & 0x20) !== 0,
      displayType,
      standardSrgbIsDefaultColorSpace: (feature & 0x04) !== 0,
      preferredTimingModeSpecified: (feature & 0x02) !== 0,
      continuousTimingsSupported: (feature & 0x01) !== 0,
    },
    chromaticity: decodeChromaticity(bytes),
    establishedTimings: decodeEstablishedTimings(bytes),
    standardTimings: decodeStandardTimings(bytes),
    descriptors,
    monitorName,
    serialNumberString,
    preferredTiming,
    extensionBlockCount,
    checksumValid: checksum === 0,
    rawHex: bytesToHex(bytes),
    extensionBlocksHex,
    extensions,
  };
}

/**
 * Parses the tool's textarea input, which can be either:
 *  - raw EDID hex for a single monitor, or
 *  - the JSON (object or array) produced by the PowerShell snippet above,
 *    with `DevicePath`/`EDIDHex` fields per monitor.
 */
export function parseEdidInput(raw: string): EdidInputEntry[] {
  const trimmed = raw.trim();
  if (trimmed === "") return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new EdidDecodeError("Input looks like JSON but failed to parse - check it was pasted completely.");
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item, i) => {
      if (typeof item !== "object" || item === null || !("EDIDHex" in item)) {
        throw new EdidDecodeError(`Entry #${i + 1} is missing an "EDIDHex" field.`);
      }
      const record = item as Record<string, unknown>;
      return {
        devicePath: typeof record.DevicePath === "string" ? record.DevicePath : null,
        hex: String(record.EDIDHex),
        connected: typeof record.Connected === "boolean" ? record.Connected : null,
        internal: typeof record.Internal === "boolean" ? record.Internal : null,
      };
    });
  }

  return [{ devicePath: null, hex: trimmed, connected: null, internal: null }];
}
