export const runtime = "nodejs";

import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { getAppUrl } from "@/lib/env";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `file` in multipart form data." },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const extFromName = (() => {
    const name = file.name || "";
    const i = name.lastIndexOf(".");
    if (i === -1) return "";
    const ext = name.slice(i).toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(ext)) return "";
    return ext;
  })();

  const extFromType = (() => {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    return map[file.type] ?? "";
  })();

  const ext = extFromName || extFromType || "";
  const filename = `${crypto.randomUUID()}${ext}`;

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  const baseUrl = getAppUrl();
  const url = `${baseUrl}/uploads/${filename}`;

  return NextResponse.json({
    url,
    filename,
    contentType: file.type,
    size: file.size,
  });
}

