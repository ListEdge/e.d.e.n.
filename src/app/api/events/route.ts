import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";

/** GET /api/events — the live event stream (most recent first). */
export async function GET() {
  const kernel = await getKernel();
  return NextResponse.json({ events: kernel.bus.recent(40) });
}
