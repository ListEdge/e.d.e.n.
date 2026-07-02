import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/planner  { goal: string } — decompose a goal into tasks. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const goal = String(body.goal ?? "").trim();
    if (!goal) {
      return NextResponse.json({ error: "goal is required" }, { status: 400 });
    }
    const kernel = await getKernel();
    const plan = await kernel.planner.plan(goal);
    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
