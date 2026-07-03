import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/** GET /api/system/status — everything the Mission Control HUD needs. */
export async function GET() {
  const kernel = await getKernel();
  return NextResponse.json({
    bootedAt: kernel.bootedAt,
    ai: {
      provider: kernel.providers.ai.id,
      model: kernel.providers.ai.defaultModel,
      online: kernel.providers.ai.id !== "offline",
    },
    database: {
      provider: kernel.providers.database.id,
      persistent: kernel.providers.database.persistent,
    },
    voice: {
      available: Boolean(kernel.providers.voice?.available()),
    },
    engines: kernel.engines.map((e) => ({ id: e.id, name: e.name, online: true })),
    capabilities: kernel.capabilities.list(),
    presence: kernel.presence.current(),
    scene: kernel.scenes.current(),
    context: kernel.context.current(),
    analytics: kernel.analytics.summary(),
    identity: { userTitle: config.identity.userTitle },
  });
}
