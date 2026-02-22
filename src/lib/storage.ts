import path from "path";
import { mkdir, writeFile } from "fs/promises";

function dataDir() {
  return path.join(process.cwd(), ".data", "nanobanana-callbacks");
}

export async function persistNanoBananaCallback(
  taskId: string,
  payload: unknown,
) {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const filename = `${taskId}.json`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { filePath };
}

