import { payloadLimitDetail } from "./package-limits";
import { cloudWorkspacePackageEntries, type ZipEntryInput } from "./workspace-package-content";

export type { ZipEntryInput } from "./workspace-package-content";
export { cloudWorkspacePackageEntries } from "./workspace-package-content";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const LOCAL_SIGNATURE = 0x0403_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;
const END_SIGNATURE = 0x0605_4b50;
const UTF8_FLAG = 0x0800;
const DOS_DATE_1980_01_01 = 0x0021;

export type ZipEntryInfo = {
  compressedSize: number;
  crc: number;
  method: 0 | 8;
  name: string;
  uncompressedSize: number;
};

type ParsedEntry = ZipEntryInfo & { dataOffset: number; localOffset: number };

function invalidArchive(): never {
  throw new Error("Archive is invalid or truncated.");
}

function assertRange(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) invalidArchive();
}

function assertSafeEntryName(name: string) {
  const absolute = name.startsWith("/") || /^[A-Za-z]:\//.test(name);
  if (!name || absolute || name.includes("\\") || name.split("/").includes("..")) {
    throw new Error("Archive contains an unsafe entry path.");
  }
}

function viewOf(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function concatBytes(chunks: readonly Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function transformBytes(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  maxOutput = Number.POSITIVE_INFINITY,
) {
  const inputBytes = new Uint8Array(bytes.length);
  inputBytes.set(bytes);
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(inputBytes);
      controller.close();
    },
  });
  const reader = input.pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.length;
    if (size > maxOutput) {
      await reader.cancel();
      throw new Error(payloadLimitDetail(maxOutput));
    }
    chunks.push(result.value);
  }
  return concatBytes(chunks);
}

export function crc32(bytes: Uint8Array) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function localHeader(entry: ZipEntryInfo, name: Uint8Array) {
  const bytes = new Uint8Array(30 + name.length);
  const view = viewOf(bytes);
  view.setUint32(0, LOCAL_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, entry.method, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, DOS_DATE_1980_01_01, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.compressedSize, true);
  view.setUint32(22, entry.uncompressedSize, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}

function centralHeader(entry: ParsedEntry, name: Uint8Array) {
  const bytes = new Uint8Array(46 + name.length);
  const view = viewOf(bytes);
  view.setUint32(0, CENTRAL_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, entry.method, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, DOS_DATE_1980_01_01, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.compressedSize, true);
  view.setUint32(24, entry.uncompressedSize, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, entry.localOffset, true);
  bytes.set(name, 46);
  return bytes;
}

export async function buildZipArchive(inputs: readonly ZipEntryInput[]) {
  if (inputs.length > 0xffff) throw new Error("Archive contains too many entries.");
  const localChunks: Uint8Array[] = [];
  const entries: ParsedEntry[] = [];
  let localOffset = 0;
  for (const input of inputs) {
    assertSafeEntryName(input.name);
    const name = encoder.encode(input.name);
    const deflated = await transformBytes(input.bytes, new CompressionStream("deflate-raw"));
    const compressed = deflated.length < input.bytes.length ? deflated : input.bytes;
    const method = compressed === deflated ? 8 : 0;
    const entry: ParsedEntry = {
      compressedSize: compressed.length,
      crc: crc32(input.bytes),
      dataOffset: localOffset + 30 + name.length,
      localOffset,
      method,
      name: input.name,
      uncompressedSize: input.bytes.length,
    };
    const header = localHeader(entry, name);
    localChunks.push(header, compressed);
    entries.push(entry);
    localOffset += header.length + compressed.length;
  }
  const centralChunks = entries.map((entry) => centralHeader(entry, encoder.encode(entry.name)));
  const central = concatBytes(centralChunks);
  const end = new Uint8Array(22);
  const endView = viewOf(end);
  endView.setUint32(0, END_SIGNATURE, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, localOffset, true);
  return concatBytes([...localChunks, central, end]);
}

function endRecord(bytes: Uint8Array) {
  const view = viewOf(bytes);
  const first = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) !== END_SIGNATURE) continue;
    assertRange(bytes, offset, 22);
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength !== bytes.length) continue;
    if (view.getUint16(offset + 4, true) || view.getUint16(offset + 6, true)) invalidArchive();
    return {
      centralOffset: view.getUint32(offset + 16, true),
      centralSize: view.getUint32(offset + 12, true),
      entries: view.getUint16(offset + 10, true),
      entriesOnDisk: view.getUint16(offset + 8, true),
      offset,
    };
  }
  return invalidArchive();
}

function parseZipArchive(bytes: Uint8Array) {
  const view = viewOf(bytes);
  const end = endRecord(bytes);
  if (end.entries !== end.entriesOnDisk || end.centralOffset + end.centralSize !== end.offset) {
    invalidArchive();
  }
  const entries: ParsedEntry[] = [];
  const names = new Set<string>();
  let cursor = end.centralOffset;
  for (let index = 0; index < end.entries; index += 1) {
    assertRange(bytes, cursor, 46);
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) invalidArchive();
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if ((flags & ~UTF8_FLAG) !== 0 || (method !== 0 && method !== 8)) {
      throw new Error("Archive contains an unsupported entry.");
    }
    assertRange(bytes, cursor + 46, nameLength + extraLength + commentLength);
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      return invalidArchive();
    }
    assertSafeEntryName(name);
    if (name.endsWith("/")) throw new Error("Archive contains an unsupported entry.");
    if (names.has(name)) throw new Error("Archive contains duplicate entries.");
    names.add(name);
    const localOffset = view.getUint32(cursor + 42, true);
    assertRange(bytes, localOffset, 30);
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) invalidArchive();
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    assertRange(bytes, localOffset + 30, localNameLength + localExtraLength);
    let localName: string;
    try {
      localName = decoder.decode(
        bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength),
      );
    } catch {
      return invalidArchive();
    }
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const crc = view.getUint32(cursor + 16, true);
    if (
      (method === 0 && compressedSize !== uncompressedSize) ||
      localName !== name ||
      view.getUint16(localOffset + 6, true) !== flags ||
      view.getUint16(localOffset + 8, true) !== method ||
      view.getUint32(localOffset + 14, true) !== crc ||
      view.getUint32(localOffset + 18, true) !== compressedSize ||
      view.getUint32(localOffset + 22, true) !== uncompressedSize
    ) {
      invalidArchive();
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    assertRange(bytes, dataOffset, compressedSize);
    if (dataOffset + compressedSize > end.centralOffset) invalidArchive();
    entries.push({
      compressedSize,
      crc,
      dataOffset,
      localOffset,
      method,
      name,
      uncompressedSize,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end.centralOffset + end.centralSize) invalidArchive();
  return entries;
}

export function inspectZipArchive(bytes: Uint8Array): ZipEntryInfo[] {
  return parseZipArchive(bytes).map(({ compressedSize, crc, method, name, uncompressedSize }) => ({
    compressedSize,
    crc,
    method,
    name,
    uncompressedSize,
  }));
}

export function buildCloudWorkspacePackage(content: string) {
  return buildZipArchive(cloudWorkspacePackageEntries(content));
}

export async function readCloudWorkspaceManifest(bytes: Uint8Array, maxBytes: number) {
  const entry = parseZipArchive(bytes).find((candidate) => candidate.name === "manifest.json");
  if (!entry) throw new Error("Archive does not contain manifest.json.");
  if (entry.uncompressedSize > maxBytes) throw new Error(payloadLimitDetail(maxBytes));
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  let content: Uint8Array;
  try {
    content =
      entry.method === 0
        ? compressed.slice()
        : await transformBytes(compressed, new DecompressionStream("deflate-raw"), maxBytes);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Package exceeds")) throw error;
    return invalidArchive();
  }
  if (content.length !== entry.uncompressedSize || crc32(content) !== entry.crc) invalidArchive();
  try {
    return decoder.decode(content);
  } catch {
    return invalidArchive();
  }
}
