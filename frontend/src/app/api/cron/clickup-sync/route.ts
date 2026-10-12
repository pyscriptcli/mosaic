import { NextRequest, NextResponse } from "next/server";
import { processClickUpSyncQueue } from "@/lib/clickupSync";
import { purgeExpiredClickUpData } from "@/lib/clickupReadStore";
import { processMosaicWriteOutbox } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const [results, writes] = await Promise.all([
      processClickUpSyncQueue(2),
      (async () => {
        const batches = [];
        for (let batch = 0; batch < 8; batch += 1) {
          const current = await processMosaicWriteOutbox(15);
          batches.push(...current);
          if (!current.length) break;
        }
        return batches;
      })(),
    ]);
    await purgeExpiredClickUpData();
    return NextResponse.json({ processed: results.length, results, stagedWrites: writes });
  } catch {
    return NextResponse.json({ error: "ClickUp sync queue is unavailable." }, { status: 503 });
  }
}
