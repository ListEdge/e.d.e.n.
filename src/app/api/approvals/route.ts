import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";

/** GET /api/approvals — everything currently waiting on a decision. */
export async function GET() {
  const kernel = await getKernel();
  const pending = await kernel.permissions.pending();
  return NextResponse.json({ pending });
}

/**
 * POST /api/approvals  { approvalId: string, decision: "approved" | "denied" }
 *
 * The client only ever sends an id and a yes/no — never the underlying
 * action's details. Whatever gets carried out on approval comes from the
 * approval record Eden already stored, not from this request body.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const approvalId = String(body.approvalId ?? "").trim();
    const decision =
      body.decision === "approved" || body.decision === "denied" ? body.decision : null;

    if (!approvalId || !decision) {
      return NextResponse.json(
        { error: "approvalId and decision ('approved' or 'denied') are required" },
        { status: 400 }
      );
    }

    const kernel = await getKernel();
    const approval = await kernel.permissions.resolve(approvalId, decision);
    const result = decision === "approved" ? await kernel.resumeApproval(approval) : "Denied.";

    return NextResponse.json({ approval, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
