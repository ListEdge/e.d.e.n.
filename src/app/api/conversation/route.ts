import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/conversation  { message: string, conversationId?: string }
 *
 * Streams newline-delimited JSON events as Eden's reply is generated:
 *   {"type":"conversationId","conversationId":"..."}
 *   {"type":"delta","text":"..."}          (repeated as text is generated)
 *   {"type":"done","reply":"...","provider":"...","model":"..."}
 * or, if something goes wrong before any of the above:
 *   {"type":"error","error":"..."}
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const message = String(body.message ?? "").trim();

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const kernel = await getKernel();
        for await (const event of kernel.conversation.handleUserMessageStream(
          message,
          (body as { conversationId?: string | null }).conversationId ?? null
        )) {
          if (event.type === "done") {
            send({
              type: "done",
              conversationId: event.conversationId,
              reply: event.reply,
              provider: event.provider,
              model: event.model,
            });
          } else {
            send(event);
          }
        }
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
