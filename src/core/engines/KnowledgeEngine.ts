import type { Engine, EngineContext } from "../engine";
import type { EntityNode } from "@/types/domain";

/**
 * Knowledge Engine — the graph of Eden's world.
 * People, businesses, projects, goals, documents, meetings, devices,
 * properties and ideas, plus the relationships between them.
 */
export class KnowledgeEngine implements Engine {
  readonly id = "knowledge";
  readonly name = "Knowledge Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  async addEntity(
    kind: string,
    name: string,
    attributes: Record<string, unknown> = {}
  ): Promise<EntityNode> {
    return this.ctx.providers.database.entities.upsert({ kind, name, attributes });
  }

  async link(
    fromName: string,
    relationship: string,
    toName: string,
    kinds: { from?: string; to?: string } = {}
  ): Promise<void> {
    const db = this.ctx.providers.database;
    const from = await db.entities.upsert({
      kind: kinds.from ?? "idea",
      name: fromName,
      attributes: {},
    });
    const to = await db.entities.upsert({
      kind: kinds.to ?? "idea",
      name: toName,
      attributes: {},
    });
    await db.relationships.link({
      from_entity: from.id,
      to_entity: to.id,
      kind: relationship,
      attributes: {},
    });
    await this.ctx.bus.publish("KnowledgeLinked", this.id, {
      from: fromName,
      relationship,
      to: toName,
    });
  }
}
