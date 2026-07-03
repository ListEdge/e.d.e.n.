import { config } from "@/lib/config";
import type { Engine, EngineContext } from "../engine";
import type { Memory, Message } from "@/types/domain";

type SearchHit = { title: string; url: string; snippet: string };

/**
 * Conversation Engine — turns user intent into a considered reply.
 * Persists both sides of the exchange, recalls relevant memories for
 * context, and publishes events so the rest of Eden can react.
 */
export class ConversationEngine implements Engine {
  readonly id = "conversation";
  readonly name = "Conversation Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  private systemPrompt(memories: Memory[], searchResults?: SearchHit[]): string {
    const title = config.identity.userTitle;
    const owner = config.identity.ownerName || "the user";
    const memoryBlock =
      memories.length > 0
        ? `\n\nRelevant things you remember:\n${memories
            .map((m) => `- [${m.type}] ${m.content}`)
            .join("\n")}`
        : "";
    const searchBlock =
      searchResults && searchResults.length > 0
        ? `\n\nLive web search results (use these for current facts, cite naturally, do not invent beyond them):\n${searchResults
            .map((r) => `- ${r.title}: ${r.snippet} (${r.url})`)
            .join("\n")}`
        : "";

    return [
      `You are Eden, a personal AI operating system built for ${owner}.`,
      `Address the user as "${title}" — composed, precise, quietly capable. Think JARVIS, not a chatbot.`,
      `Be concise. Prefer plain English. When asked to do something Eden cannot yet do, say so honestly and describe what capability would need to be connected.`,
      memoryBlock,
      searchBlock,
    ].join("\n");
  }

  /**
   * Heuristic: does this message need live, current-world information
   * that Eden's training data can't be trusted to know? Kept deliberately
   * simple and cheap — no extra AI call just to decide whether to search.
   */
  private needsSearch(text: string): boolean {
    const t = text.toLowerCase();
    const currentEventWords =
      /\b(today|tonight|tomorrow|this week|this weekend|right now|currently|latest|breaking|news|score|scores|result|results|weather|forecast|price|prices|stock|exchange rate|who is the|current|upcoming|schedule|release date|just (?:announced|released|happened))\b/;
    const yearMention = /\b20(2[5-9]|[3-9]\d)\b/; // 2025 onward — recent-year questions
    return currentEventWords.test(t) || yearMention.test(t);
  }

  async handleUserMessage(
    text: string,
    conversationId?: string | null
  ): Promise<{ conversationId: string; reply: Message }> {
    const { bus, providers } = this.ctx;
    const db = providers.database;

    // 1. Ensure a conversation exists
    let convoId = conversationId ?? null;
    if (!convoId) {
      const convo = await db.conversations.create(text.slice(0, 80));
      convoId = convo.id;
      await bus.publish("ConversationStarted", this.id, { conversationId: convoId });
    }

    // 2. Persist the user's message
    await db.messages.add({ conversation_id: convoId, role: "user", content: text });
    await bus.publish("MessageReceived", this.id, { conversationId: convoId, text });

    // 3. Recall relevant memories
    const memories = await db.memories.search(text, 5);
    if (memories.length > 0) {
      await bus.publish("MemoryRecalled", this.id, { count: memories.length });
    }

    // 4. Build context from recent history
    const history = await db.messages.listByConversation(convoId, 20);
    const aiMessages = history
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // 4b. Reach for live web search when the question needs current-world
    // facts Eden's training data can't be trusted to know. Never fatal —
    // a search failure just means Eden answers without it.
    let searchResults: SearchHit[] | undefined;
    if (providers.search?.available() && this.needsSearch(text)) {
      try {
        searchResults = await providers.search.search(text, 5);
        await bus.publish("SearchPerformed", this.id, {
          conversationId: convoId,
          query: text,
          resultCount: searchResults.length,
        });
      } catch (err) {
        await bus.publish("ProviderError", this.id, {
          provider: providers.search.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 5. Ask the active AI provider
    let replyText: string;
    let provider = providers.ai.id;
    let model = providers.ai.defaultModel;
    try {
      const response = await providers.ai.chat({
        system: this.systemPrompt(memories, searchResults),
        messages: aiMessages,
        maxTokens: 1024,
      });
      replyText = response.text;
      provider = response.provider;
      model = response.model;
    } catch (err) {
      await bus.publish("ProviderError", this.id, {
        provider,
        error: err instanceof Error ? err.message : String(err),
      });
      replyText = `I hit a problem reaching my ${provider} core, ${config.identity.userTitle}. The error has been logged.`;
    }

    // 6. Persist and announce the reply
    const reply = await db.messages.add({
      conversation_id: convoId,
      role: "assistant",
      content: replyText,
      provider,
      model,
    });
    await bus.publish("MessageSent", this.id, { conversationId: convoId, provider, model });

    // 7. Simple explicit memory capture: "remember ..." / "remember that ..."
    const rememberMatch = text.match(/^\s*(?:eden[,\s]+)?remember(?:\s+that)?\s+(.{4,})/i);
    if (rememberMatch) {
      const memory = await db.memories.add({
        type: "long_term",
        content: rememberMatch[1].trim(),
        importance: 3,
        metadata: { source: "explicit", conversationId: convoId },
      });
      await bus.publish("MemoryCreated", this.id, { memoryId: memory.id });
    }

    return { conversationId: convoId, reply };
  }
}
