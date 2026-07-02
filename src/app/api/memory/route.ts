import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";
import type { MemoryType } from "@/types/domain";

export const runtime = "nodejs";

/** GET /api/memory?q=search — recall; without q returns recent memories. */
export async function GET(request: Request) {
  const kernel = await getKernel();
  const q = new URL(request.url).searchParams.get("q");
  const memories = q ? await kernel.memory.recall(q, 10) : await kernel.memory.recent(10);
  return NextResponse.json({ memories });
}

/** POST /api/memory  { content, type?, importance? } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    const kernel = await getKernel();
    const memory = await kernel.memory.remember(
      content,
      (body.type as MemoryType) ?? "knowledge",
      Number(body.importance) || 2
    );
    return NextResponse.json({ memory });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
