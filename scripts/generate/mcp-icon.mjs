import fs from "node:fs/promises";
import sharp from "sharp";

const source = new URL("../../app/icon.svg", import.meta.url);
const target = new URL("../../public/bisibility-mcp-icon.png", import.meta.url);
const icon = await sharp(await fs.readFile(source), { density: 192 })
  .resize(176, 176)
  .extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#f8f7f4" })
  .flatten({ background: "#f8f7f4" })
  .png({ palette: true, colours: 64, compressionLevel: 9 })
  .toBuffer();
if (icon.length > 10_000) throw new Error("MCP icon exceeds 10 KB.");
await fs.writeFile(target, icon);
console.log(`MCP icon: 256 x 256 px, ${icon.length} bytes. Update the displayed size if it changed.`);
