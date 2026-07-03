"use client";

export interface PendingApproval {
  id: string;
  action: string;
  authority: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Turns an approval's raw action + payload into a plain-English line. */
function describeApproval(approval: PendingApproval): string {
  const p = approval.payload ?? {};
  if (approval.action === "send_email") {
    return `Send email to ${String(p.to ?? "?")}: "${String(p.subject ?? "")}"`;
  }
  if (approval.action === "place_call") {
    return `Call ${String(p.number ?? "?")} — ${String(p.purpose ?? "")}`;
  }
  return approval.action;
}

export default function ApprovalsBar({
  approvals,
  onResolve,
  resolvingId,
}: {
  approvals: PendingApproval[];
  onResolve: (id: string, decision: "approved" | "denied") => void;
  resolvingId: string | null;
}) {
  if (approvals.length === 0) return null;

  return (
    <div className="hud-panel pointer-events-auto mb-3 flex flex-col gap-2.5 px-4 py-3">
      <span className="font-hud text-[10px] tracking-[0.2em] text-dim">
        AWAITING YOUR APPROVAL
      </span>
      {approvals.map((approval) => (
        <div
          key={approval.id}
          className="flex items-center justify-between gap-3 border-t border-white/5 pt-2.5 first:border-t-0 first:pt-0"
        >
          <p className="text-[13px] leading-snug text-ink/90">{describeApproval(approval)}</p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => onResolve(approval.id, "denied")}
              disabled={resolvingId === approval.id}
              className="rounded-full px-3 py-1 font-hud text-[10px] tracking-widest text-dim transition-colors hover:text-ink disabled:opacity-40"
            >
              DENY
            </button>
            <button
              onClick={() => onResolve(approval.id, "approved")}
              disabled={resolvingId === approval.id}
              className="rounded-full bg-pulseblue/20 px-3 py-1 font-hud text-[10px] tracking-widest text-pulseblue transition-colors hover:bg-pulseblue/30 disabled:opacity-40"
            >
              APPROVE
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
