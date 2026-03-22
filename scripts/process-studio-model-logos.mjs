/**
 * Removes light / low-saturation backgrounds from model logo PNGs and writes
 * trimmed transparent PNGs to public/studio/model-logos/.
 *
 * Source order (user): 1 Google, 2 Sora, 3 Grok, 4 Seedance, 5 Kling.
 * Run: node scripts/process-studio-model-logos.mjs [path-to-assets-dir]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outDir = path.join(projectRoot, "public", "studio", "model-logos");

const DEFAULT_ASSETS = path.join(
  process.env.USERPROFILE || "",
  ".cursor",
  "projects",
  "c-Users-antod-OneDrive-Bureau-speel-2-0",
  "assets",
);

const FILES = [
  { dest: "google.png", src: "c__Users_antod_AppData_Roaming_Cursor_User_workspaceStorage_9b173d70ce23132c2a08267930d5b945_images_ChatGPT_Image_Mar_22__2026__11_23_35_AM-1900274b-6ff3-47f9-ac66-a5af2a1d1adb.png" },
  { dest: "sora.png", src: "c__Users_antod_AppData_Roaming_Cursor_User_workspaceStorage_9b173d70ce23132c2a08267930d5b945_images_ChatGPT_Image_Mar_22__2026__11_22_36_AM-f19627cb-de06-499f-abfa-005e7534796c.png" },
  { dest: "grok.png", src: "c__Users_antod_AppData_Roaming_Cursor_User_workspaceStorage_9b173d70ce23132c2a08267930d5b945_images_Screenshot_2026-03-22_112609-624281d9-6f9b-459d-93fd-7dfe64f455ab.png" },
  { dest: "seedance.png", src: "c__Users_antod_AppData_Roaming_Cursor_User_workspaceStorage_9b173d70ce23132c2a08267930d5b945_images_Screenshot_2026-03-22_112552-7720aba3-66d0-4a14-83f0-b26b1cfd4106.png" },
  { dest: "kling.png", src: "c__Users_antod_AppData_Roaming_Cursor_User_workspaceStorage_9b173d70ce23132c2a08267930d5b945_images_ChatGPT_Image_Mar_22__2026__11_32_33_AM-a9d534ac-1888-466b-9f8f-364ce1a73297.png" },
];

function knockOutLightBackground(px, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const nearWhite = r >= 250 && g >= 250 && b >= 250;
      const lightBackdrop = lum > 0.78 && sat < 48;
      if (nearWhite || lightBackdrop) {
        px[i + 3] = 0;
      }
    }
  }
}

async function processOne(srcPath, destPath) {
  const { data, info } = await sharp(srcPath)
    .resize(128, 128, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = new Uint8ClampedArray(data);
  knockOutLightBackground(px, width, height);
  const buf = Buffer.from(px);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const tmp = path.join(outDir, `.tmp-${path.basename(destPath)}`);
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(tmp);
  await sharp(tmp).trim().png().toFile(destPath);
  await fs.promises.unlink(tmp);
  console.log("Wrote", path.relative(projectRoot, destPath));
}

const assetsDir = path.resolve(process.argv[2] || DEFAULT_ASSETS);
if (!fs.existsSync(assetsDir)) {
  console.error("Assets dir not found:", assetsDir);
  console.error("Usage: node scripts/process-studio-model-logos.mjs <path-to-assets-folder>");
  process.exit(1);
}

await fs.promises.mkdir(outDir, { recursive: true });

for (const { dest, src } of FILES) {
  const fullSrc = path.join(assetsDir, src);
  if (!fs.existsSync(fullSrc)) {
    console.error("Missing source:", fullSrc);
    process.exit(1);
  }
  await processOne(fullSrc, path.join(outDir, dest));
}

console.log("Done.");
