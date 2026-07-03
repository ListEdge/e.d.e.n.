import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/voice/speak  { text: string, voice?: string } → audio/mpeg */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const kernel = await getKernel();
    const voice = kernel.providers.voice;
    if (!voice || !voice.available()) {
      return NextResponse.json(
        { error: "Voice is not connected. Add OPENAI_API_KEY to enable it." },
        { status: 503 }
      );
    }

    const audio = await voice.speak(text, body.voice);
    return new NextResponse(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
