// main.ts — news-image-20261125 round 2 entry runner.
// Copies repo/entry.png to $MAKEFUN_OUTPUT_DIR/entry.png (default /output)
// after validating the PNG. No network, no timestamp, no randomness.
// Never reads or writes process.cwd; the only guard is "output inside repo".
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1024;

const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function fail(message: string): never {
  console.error("main.ts: " + message);
  process.exit(1);
}

function validatePng(buf: Buffer): void {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) fail("entry.png is not a PNG file");
  if (buf.length > MAX_BYTES) fail("entry.png exceeds 1 MiB (" + buf.length + " bytes)");
  if (buf.toString("ascii", 12, 16) !== "IHDR") fail("entry.png has no IHDR chunk first");
  if (buf[24] !== 8 || buf[25] !== 2) fail("entry.png must be 8-bit RGB (got depth " + buf[24] + ", type " + buf[25] + ")");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > MAX_SIDE || height > MAX_SIDE) fail("entry.png sides exceed 1024 (" + width + "x" + height + ")");
  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (offset + 12 + length > buf.length) fail("truncated PNG chunk " + type);
    const storedCrc = buf.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([buf.subarray(offset + 4, offset + 8), buf.subarray(offset + 8, offset + 8 + length)]));
    if (storedCrc !== actualCrc) fail("bad CRC-32 in PNG chunk " + type);
    offset += 12 + length;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) fail("entry.png has no IEND chunk");
}

function main(): void {
  const repoDir = dirname(fileURLToPath(import.meta.url));
  const src = join(repoDir, "entry.png");
  if (!existsSync(src)) fail("entry.png not found next to main.ts");
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || "/output");
  const repoRoot = resolve(repoDir) + sep;
  if ((outDir + sep).startsWith(repoRoot)) fail("refusing to write output inside the repo");
  const buf = readFileSync(src);
  validatePng(buf);
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, "entry.png");
  if (resolve(dest) === resolve(src)) fail("output path equals the source file");
  copyFileSync(src, dest);
  const written = readFileSync(dest);
  if (!written.equals(buf)) fail("written output does not match entry.png");
  console.log("wrote " + dest + " (" + buf.length + " bytes)");
}

main();
