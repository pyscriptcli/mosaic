import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetPath = path.resolve(String(body.targetPath || "").trim());
    const action = body.action === "reveal-folder" ? "reveal-folder" : null;
    if (!action) {
      return NextResponse.json({ error: "Only output-folder reveal is supported." }, { status: 400 });
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return NextResponse.json(
        { error: "Target presentation or folder does not exist on disk." },
        { status: 404 },
      );
    }

    const stat = await fs.promises.stat(targetPath);
    const args = stat.isDirectory() ? [targetPath] : [`/select,${targetPath}`];
    execFile("explorer.exe", args);

    return NextResponse.json({ ok: true, targetPath, action });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not launch file on Windows." },
      { status: 500 },
    );
  }
}
