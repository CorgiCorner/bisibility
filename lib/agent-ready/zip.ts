import { crc32 } from "node:zlib";

export type ZipFile = Readonly<{ path: string; content: string }>;

/** Deterministic ZIP STORE: regular UTF-8 files, no compression or runtime filesystem reads. */
export function buildZip(files: readonly ZipFile[]): Buffer {
  if (files.length > 65535) throw new Error("ZIP entry limit exceeded");
  const chunks: Buffer[] = [];
  const directory: Buffer[] = [];
  const names = new Set<string>();
  let offset = 0;
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (
      !file.path ||
      file.path.startsWith("/") ||
      /[\\\0:]/.test(file.path) ||
      file.path.split("/").some((part) => !part || part === "." || part === "..") ||
      names.has(file.path)
    ) {
      throw new Error("Unsafe or duplicate ZIP path");
    }
    names.add(file.path);
    const name = Buffer.from(file.path, "utf8");
    const content = Buffer.from(file.content, "utf8");
    if (name.length > 65535 || content.length > 0xffffffff || offset > 0xffffffff)
      throw new Error("ZIP size limit exceeded");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 filenames.
    local.writeUInt16LE(33, 12); // 1980-01-01, with zero time.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, content);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // UNIX, ZIP 2.0.
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(0x81a40000, 38); // Regular file, mode 0644.
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const central = Buffer.concat(directory);
  if (offset + central.length > 0xffffffff) throw new Error("ZIP size limit exceeded");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}
