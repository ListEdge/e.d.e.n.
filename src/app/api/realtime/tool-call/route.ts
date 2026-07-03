import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";

/**
 * Relayed by the browser when a live voice session's model wants to call
 * a tool. Runs through the exact same executor — and the exact same
 * approval gating — as a tool call triggered from typed conversation.
 * Voice mode gets no separate security model.
 */
async function runTool(name: string, args: Record<string, unknown>) {
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const kernel = await getKernel();
  const result = await kernel.capabilities.callTool(name, args);
  return NextResponse.json({ result });
}

/**
 * GET so this can be tested by pasting a URL into a browser — no
 * terminal needed. Example:
 *   /api/realtime/tool-call?name=send_email&to=you@example.com&subject=Test&body=Hello
 * Every query param except "name" becomes an argument to the tool.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")?.trim() ?? "";
    const args: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key === "name") continue;
      args[key] = value;
    }
    return await runTool(name, args);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** POST /api/realtime/tool-call  { name: string, arguments?: object } */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const name = String(body.name ?? "").trim();
    const args = (
      body.arguments && typeof body.arguments === "object" ? body.arguments : {}
    ) as Record<string, unknown>;
    return await runTool(name, args);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
