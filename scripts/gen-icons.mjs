import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./icon-source.svg", import.meta.url));
const outDir = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const sizes = [
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

for (const { size, name } of sizes) {
  await sharp(src, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`${outDir}${name}`);
  console.log(`wrote ${name}`);
}
