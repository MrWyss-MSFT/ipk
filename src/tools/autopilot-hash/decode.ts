/**
 * Decodes a Windows Autopilot "4K hardware hash" (DeviceHardwareData) into a
 * structured object.
 *
 * TypeScript port of the PowerShell script at
 * https://gist.github.com/MrWyss-MSFT/b670c3e7435af81a60ab403e89b4089d,
 * which is itself a port of the 4khwhashdecipher.hexpat (ImHex pattern).
 * It walks the TLV (type-length-value) binary structure produced by OA3Tool
 * and understood by MDM_DevDetail_Ext01.DeviceHardwareData, decoding each
 * known "type" into friendly fields. Only Base64 decoding is supported here
 * (the live-device CIM query from the original script has no browser
 * equivalent).
 */

// ---------------------------------------------------------------------------
// Low level byte helpers
// ---------------------------------------------------------------------------

function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** Reads an unsigned 64-bit little-endian value. Returned as Number (safe for any realistic byte count/capacity). */
function u64le(b: Uint8Array, o: number): number {
  const view = new DataView(b.buffer, b.byteOffset + o, 8);
  return Number(view.getBigUint64(0, true));
}

function s8(b: Uint8Array, o: number): number {
  return new Int8Array(b.buffer, b.byteOffset + o, 1)[0];
}

function u16be(b: Uint8Array, o: number): number {
  return ((b[o] << 8) | b[o + 1]) >>> 0;
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function getNullStrippedString(b: Uint8Array, o: number, len: number): string {
  if (len <= 0) return "";
  let out = "";
  for (let i = 0; i < len; i++) {
    const code = b[o + i];
    if (code !== 0) out += String.fromCharCode(code);
  }
  return out;
}

function getUtf16String(b: Uint8Array, o: number, lenBytes: number): string {
  if (lenBytes <= 0) return "";
  const codeUnits: number[] = [];
  for (let i = 0; i + 1 < lenBytes; i += 2) {
    const code = b[o + i] | (b[o + i + 1] << 8);
    if (code !== 0) codeUnits.push(code);
  }
  return String.fromCharCode(...codeUnits);
}

function formatMacAddress(b: Uint8Array, o: number): string {
  return Array.from(b.slice(o, o + 6))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(":");
}

function formatRawHex(b: Uint8Array, o: number, len: number): string {
  if (len <= 0) return "";
  return Array.from(b.slice(o, o + len))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

/** type::GUID read as "be": Data1/2/3 are big-endian, Data4 is raw bytes. */
function formatBeGuid(b: Uint8Array, o: number): string {
  const data1 = u32be(b, o).toString(16).padStart(8, "0");
  const data2 = u16be(b, o + 4).toString(16).padStart(4, "0");
  const data3 = u16be(b, o + 6).toString(16).padStart(4, "0");
  const data4a = formatRawHex(b, o + 8, 2).replace(/ /g, "").toLowerCase();
  const data4b = formatRawHex(b, o + 10, 6).replace(/ /g, "").toLowerCase();
  return `${data1}-${data2}-${data3}-${data4a}-${data4b}`;
}

/** format_build: "{mayor}.{minor}.{build}.{rev}" — note the PS call sends (minor, mayor, rev, build) positionally. */
function formatBuild(minor: number, mayor: number, rev: number, build: number): string {
  return `${mayor}.${minor}.${build}.${rev}`;
}

function readBuild(b: Uint8Array, o: number): string {
  return formatBuild(u16le(b, o), u16le(b, o + 2), u16le(b, o + 4), u16le(b, o + 6));
}

function pad2(n: number): string {
  return Math.abs(n).toString().padStart(2, "0");
}

function formatIsoUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const h = pad2(date.getUTCHours());
  const mi = pad2(date.getUTCMinutes());
  const s = pad2(date.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

function formatIsoNoZone(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const h = pad2(date.getUTCHours());
  const mi = pad2(date.getUTCMinutes());
  const s = pad2(date.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

const EPOCH_2000_SECONDS = Date.UTC(2000, 0, 1, 0, 0, 0) / 1000;

/** Port of format_jan2k(): timeZone is in units of 15 minutes. */
function convertJan2kTime(secondsSinceJan2000: number, timeZone: number): { utc: string; local: string } {
  let tz = timeZone;
  let prefix = "+";
  if (tz < 0) {
    tz = -tz;
    prefix = "-";
  }

  const tzMinutes = tz * 15;
  const tzHours = Math.floor(tzMinutes / 60);
  const tzSeconds = tzMinutes * 60;
  const tzMinRemainder = tzMinutes % 60;
  const tzString = `${prefix}${pad2(tzHours)}:${pad2(tzMinRemainder)}`;

  // Jan 1 2000 UTC epoch offset + the same +1h fudge factor used in the hexpat version.
  const utcSec = secondsSinceJan2000 + EPOCH_2000_SECONDS + 3600;
  const ltSec = utcSec + tzSeconds;

  const utcDate = new Date(utcSec * 1000);
  const ltDate = new Date(ltSec * 1000);

  return {
    utc: formatIsoUtc(utcDate),
    local: formatIsoNoZone(ltDate) + tzString,
  };
}

// ---------------------------------------------------------------------------
// Enum lookups
// ---------------------------------------------------------------------------

function unknownHex(v: number, hexDigits: number): string {
  return `Unknown(0x${v.toString(16).toUpperCase().padStart(hexDigits, "0")})`;
}

function resolveArch(v: number): string {
  switch (v) {
    case 0:
      return "X86";
    case 9:
      return "X64";
    case 12:
      return "ARM64";
    default:
      return unknownHex(v, 2);
  }
}

function resolveOSType(v: number): string {
  return v === 2 ? "FullOS" : unknownHex(v, 2);
}

function resolveECC(v: number): string {
  switch (v) {
    case 3:
      return "None";
    case 4:
      return "Parity";
    case 5:
      return "SingleBitECC";
    case 6:
      return "MultiBitECC";
    case 7:
      return "CRC";
    default:
      return unknownHex(v, 2);
  }
}

function resolveBusType(v: number): string {
  switch (v) {
    case 1:
      return "SCSI";
    case 2:
      return "ATAPI";
    case 3:
      return "RAID";
    case 8:
      return "SAS";
    case 0x0b:
      return "SATA";
    case 0x11:
      return "NVME";
    default:
      return unknownHex(v, 4);
  }
}

function resolvePhysicalMedium(v: number): string {
  switch (v) {
    case 1:
      return "WLAN";
    case 9:
      return "Native802_11";
    case 10:
      return "Bluetooth";
    case 14:
      return "Ethernet";
    default:
      return unknownHex(v, 8);
  }
}

function resolveOfflineDeviceIdType(v: number): string {
  switch (v) {
    case 0x00200102:
      return "UEFI_VARIABLE_TPM";
    case 0x00200001:
      return "TPM_EK";
    default:
      return unknownHex(v, 8);
  }
}

function resolvePowerPlatformRoleType(v: number): string {
  switch (v) {
    case 0:
      return "UNSPECIFIED";
    case 1:
      return "DESKTOP";
    case 2:
      return "MOBILE";
    case 3:
      return "WORKSTATION";
    case 4:
      return "ENTERPRISE_SERVER";
    case 5:
      return "SOHO_SERVER";
    case 6:
      return "APPLIANCE_PC";
    case 7:
      return "PERFORMANCE_SERVER";
    case 8:
      return "SLATE";
    case 9:
      return "MAXIMUM_ENUM_VALUE";
    default:
      return unknownHex(v, 2);
  }
}

function resolveRemovalPolicy(v: number): string {
  switch (v) {
    case 0:
      return "Unknown";
    case 1:
      return "NoRemoval";
    default:
      return unknownHex(v, 2);
  }
}

/** bitfield TouchSupport : IntegratedTouch,ExternalTouch,IntegratedPen,ExternalPen,Reserved4,Reserved5,MultiInput,StackReady */
function resolveTouchSupport(v: number): string[] {
  const flags: string[] = [];
  if (v & 0x01) flags.push("IntegratedTouch");
  if (v & 0x02) flags.push("ExternalTouch");
  if (v & 0x04) flags.push("IntegratedPen");
  if (v & 0x08) flags.push("ExternalPen");
  if (v & 0x40) flags.push("MultiInput");
  if (v & 0x80) flags.push("StackReady");
  return flags;
}

// ---------------------------------------------------------------------------
// TLV struct decoders - one function per "Type: N" struct in the hexpat file
// ---------------------------------------------------------------------------

function readToolBuildOSBuild(b: Uint8Array, o: number) {
  const toolBuild = readBuild(b, o);
  const osBuild = readBuild(b, o + 8);
  const secs = u32le(b, o + 16);
  const tz = s8(b, o + 20);
  const time = convertJan2kTime(secs, tz);
  return {
    ToolBuild: toolBuild,
    OSBuild: osBuild,
    OSSystemTimeUtc: time.utc,
    OSLocalTime: time.local,
    OSType: resolveOSType(b[o + 21]),
    OSCpuArchitecture: resolveArch(b[o + 22]),
    ToolVersion: b[o + 23],
  };
}

function readProcessorPackagesCores(b: Uint8Array, o: number) {
  return {
    ProcessorArchitecture: resolveArch(b[o]),
    ProcessorPackages: u16be(b, o + 1),
    ProcessorCores: u16be(b, o + 3),
    ProcessorThreads: u16be(b, o + 5),
    ProcessorHyperthreading: Boolean(b[o + 8]),
  };
}

function readRamInfo(b: Uint8Array, o: number) {
  return {
    TotalPhysicalRam: u64le(b, o),
    SmbiosRamMaximumCapacity: u64le(b, o + 8),
    SmbiosRamSlots: u16le(b, o + 16),
    SmbiosRamArrayCount: u16le(b, o + 18),
    SmbiosRamErrorCorrection: resolveECC(b[o + 20]),
  };
}

function readDiskInfo(b: Uint8Array, o: number) {
  const busType = u16le(b, o + 8);
  const diskTypeGuess = busType === 0x11 ? "NVME" : "HDD (guess - cannot distinguish SSD/HDD from this field)";
  return {
    DiskCapacity: u64le(b, o),
    BusType: resolveBusType(busType),
    DiskTypeGuess: diskTypeGuess,
    IncursSeekPenalty: b[o + 10],
    TrimEnabled: b[o + 11],
  };
}

function readNetworkAdapterInfo(b: Uint8Array, o: number, remDataLength: number) {
  const busTypeLenBytes = remDataLength - 0x0e;
  return {
    PhysicalMedium: resolvePhysicalMedium(u32le(b, o)),
    Mac: formatMacAddress(b, o + 4),
    DataTodo: u32le(b, o + 10),
    BusType: getUtf16String(b, o + 14, busTypeLenBytes),
  };
}

function readDisplayResolution(b: Uint8Array, o: number) {
  return {
    SizePhysicalH: u16le(b, o),
    SizePhysicalV: u16le(b, o + 2),
    ResolutionHorizontal: u16le(b, o + 4),
    ResolutionVertical: u16le(b, o + 6),
  };
}

function readSystemEnclosure(b: Uint8Array, o: number) {
  return {
    ChassisType: `0x${b[o].toString(16)}`,
    PowerPlatformRole: resolvePowerPlatformRoleType(b[o + 1]),
    OpticalDiskDriveType: Boolean(b[o + 2]),
    DigitizerSupportID: resolveTouchSupport(b[o + 3]),
  };
}

function readOfflineDeviceId(b: Uint8Array, o: number, dataLength: number) {
  const payloadLen = dataLength - 0x0e;
  return {
    Status: u32le(b, o),
    OfflineDeviceIdType: resolveOfflineDeviceIdType(u32le(b, o + 4)),
    PayloadBase64: bytesToBase64(b.slice(o + 10, o + 10 + payloadLen)),
  };
}

function readVideoDetails(b: Uint8Array, o: number) {
  return {
    DedicatedVideoMemory: u64le(b, o),
    DedicatedSystemMemory: u64le(b, o + 8),
    RemovalPolicy: resolveRemovalPolicy(b[o + 16]),
    InLocalMachineContainer: Boolean(b[o + 17]),
  };
}

function readVideoCardInfo(b: Uint8Array, o: number, remDataLength: number) {
  let i = 0;
  while (true) {
    const ch = getRawUtf16Char(b, o + i);
    if (ch === "|") break;
    i += 2;
    if (i >= remDataLength) break;
  }
  const manufacturer = getUtf16String(b, o, i);
  const modelOffset = o + i + 2;
  const modelLen = remDataLength - 2 - i;
  const model = modelLen > 0 ? getUtf16String(b, modelOffset, modelLen) : "";
  return { Manufacturer: manufacturer, Model: model };
}

function getRawUtf16Char(b: Uint8Array, o: number): string {
  if (o + 1 >= b.length) return "";
  return String.fromCharCode(b[o] | (b[o + 1] << 8));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Main TLV walker
// ---------------------------------------------------------------------------

export interface DecodedAutopilotHash {
  FileType: string;
  TotalLength: number;
  ToolBuildOSBuild: ReturnType<typeof readToolBuildOSBuild> | null;
  Processor: {
    PackagesCores: ReturnType<typeof readProcessorPackagesCores> | null;
    Manufacturer: string | null;
    Model: string | null;
  };
  RamInfo: ReturnType<typeof readRamInfo> | null;
  Disks: ReturnType<typeof readDiskInfo>[];
  DiskSerialNumbers: string[];
  DiskSSNKernel: string[];
  NetworkAdapters: ReturnType<typeof readNetworkAdapterInfo>[];
  DisplayResolutions: ReturnType<typeof readDisplayResolution>[];
  SystemEnclosure: ReturnType<typeof readSystemEnclosure> | null;
  OfflineDeviceId: ReturnType<typeof readOfflineDeviceId> | null;
  SmbiosUuid: string | null;
  TpmVersion: string | null;
  Smbios: {
    SystemSerialNumber: string | null;
    FirmwareVendor: string | null;
    SystemManufacturer: string | null;
    SystemProductName: string | null;
    SKUNumber: string | null;
    SystemFamily: string | null;
    FirmwareVersion: string | null;
    BoardProduct: string | null;
    BoardVersion: string | null;
    SystemVersion: string | null;
  };
  ProductKeyID: string | null;
  TpmEkPubBase64: string | null;
  ProductKeyPkPn: string | null;
  FourBytesFFsOr00s: string | null;
  VideoDetails: ReturnType<typeof readVideoDetails>[];
  VideoCards: ReturnType<typeof readVideoCardInfo>[];
  UnknownTypes: { Type: number; Offset: number; HexData: string }[];
  ChecksumSha256: string | null;
  ParseWarnings: string[];
}

export function decodeAutopilotHash(bytes: Uint8Array): DecodedAutopilotHash {
  if (bytes.length < 4) {
    throw new Error("Input too short to contain a valid header.");
  }

  const fileType = String.fromCharCode(bytes[0], bytes[1]);
  const totalLength = u16le(bytes, 2);

  const result: DecodedAutopilotHash = {
    FileType: fileType,
    TotalLength: totalLength,
    ToolBuildOSBuild: null,
    Processor: { PackagesCores: null, Manufacturer: null, Model: null },
    RamInfo: null,
    Disks: [],
    DiskSerialNumbers: [],
    DiskSSNKernel: [],
    NetworkAdapters: [],
    DisplayResolutions: [],
    SystemEnclosure: null,
    OfflineDeviceId: null,
    SmbiosUuid: null,
    TpmVersion: null,
    Smbios: {
      SystemSerialNumber: null,
      FirmwareVendor: null,
      SystemManufacturer: null,
      SystemProductName: null,
      SKUNumber: null,
      SystemFamily: null,
      FirmwareVersion: null,
      BoardProduct: null,
      BoardVersion: null,
      SystemVersion: null,
    },
    ProductKeyID: null,
    TpmEkPubBase64: null,
    ProductKeyPkPn: null,
    FourBytesFFsOr00s: null,
    VideoDetails: [],
    VideoCards: [],
    UnknownTypes: [],
    ChecksumSha256: null,
    ParseWarnings: [],
  };

  let off = 4;
  while (off < bytes.length) {
    if (off + 4 > bytes.length) {
      result.ParseWarnings.push(`Truncated TLV header at offset ${off}`);
      break;
    }
    const type = u16le(bytes, off);

    if (type === 0) {
      // padding - consumes just the 2-byte type field, like the "continue" case in the pattern
      off += 2;
      continue;
    }

    const dataLength = u16le(bytes, off + 2);
    const dataOffset = off + 4;
    const remDataLength = dataLength - 4;

    if (type === 0x5343) {
      // CheckSum: 32 raw bytes (SHA-256) right after the header
      result.ChecksumSha256 = formatRawHex(bytes, dataOffset, 32).replace(/ /g, "");
      off += dataLength;
      break;
    }

    if (remDataLength < 0 || dataOffset + Math.max(remDataLength, 0) > bytes.length) {
      result.ParseWarnings.push(`Type ${type} at offset ${off} has an invalid length (${dataLength}); stopping.`);
      break;
    }

    switch (type) {
      case 1:
        result.ToolBuildOSBuild = readToolBuildOSBuild(bytes, dataOffset);
        break;
      case 2:
        result.Processor.PackagesCores = readProcessorPackagesCores(bytes, dataOffset);
        break;
      case 3:
        result.Processor.Manufacturer = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 4:
        result.Processor.Model = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 5:
        result.RamInfo = readRamInfo(bytes, dataOffset);
        break;
      case 6:
        result.Disks.push(readDiskInfo(bytes, dataOffset));
        break;
      case 7:
        result.DiskSerialNumbers.push(getNullStrippedString(bytes, dataOffset, remDataLength));
        break;
      case 8:
        result.NetworkAdapters.push(readNetworkAdapterInfo(bytes, dataOffset, remDataLength));
        break;
      case 9:
        result.DisplayResolutions.push(readDisplayResolution(bytes, dataOffset));
        break;
      case 10:
        result.SystemEnclosure = readSystemEnclosure(bytes, dataOffset);
        break;
      case 11:
        result.OfflineDeviceId = readOfflineDeviceId(bytes, dataOffset, dataLength);
        break;
      case 12:
        result.SmbiosUuid = formatBeGuid(bytes, dataOffset);
        break;
      case 13:
        result.TpmVersion = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 14:
        result.Smbios.SystemSerialNumber = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 15:
        result.Smbios.FirmwareVendor = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 16:
        result.Smbios.SystemManufacturer = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 17:
        result.Smbios.SystemProductName = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 18:
        result.Smbios.SKUNumber = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 19:
        result.Smbios.SystemFamily = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 20:
        result.Smbios.FirmwareVersion = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 21:
        result.Smbios.BoardProduct = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 22:
        result.Smbios.BoardVersion = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 23:
        result.Smbios.SystemVersion = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 24:
        result.ProductKeyID = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 25:
        result.TpmEkPubBase64 = bytesToBase64(bytes.slice(dataOffset, dataOffset + remDataLength));
        break;
      case 26:
        result.ProductKeyPkPn = getNullStrippedString(bytes, dataOffset, remDataLength);
        break;
      case 27:
        result.FourBytesFFsOr00s = `0x${u32le(bytes, dataOffset).toString(16).toUpperCase().padStart(8, "0")}`;
        break;
      case 28:
        result.DiskSSNKernel.push(getNullStrippedString(bytes, dataOffset, remDataLength));
        break;
      case 29:
        result.VideoDetails.push(readVideoDetails(bytes, dataOffset));
        break;
      case 30:
        result.VideoCards.push(readVideoCardInfo(bytes, dataOffset, remDataLength));
        break;
      default:
        // Includes types 34, 35, 37, 38, which aren't fully decoded yet
        // upstream (see the hexpat source), plus any other unknown type.
        result.UnknownTypes.push({
          Type: type,
          Offset: off,
          HexData: formatRawHex(bytes, dataOffset, remDataLength),
        });
        break;
    }

    off += dataLength;
  }

  return result;
}

/** Convenience entry point: decode directly from a Base64 DeviceHardwareData string. */
export function decodeAutopilotHashBase64(base64: string): DecodedAutopilotHash {
  const clean = base64.trim();
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new Error("Not valid Base64.");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return decodeAutopilotHash(bytes);
}
