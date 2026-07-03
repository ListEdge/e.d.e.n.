import { config } from "@/lib/config";
import type { Engine, EngineContext } from "../engine";
import type { AIMessage } from "@/providers/ai";
import type { Memory, Message } from "@/types/domain";

type SearchHit = { title: string; url: string; snippet: string };

export type ConversationStreamEvent =
  | { type: "conversationId"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "done"; conversationId: string; reply: string; provider: string; model: string };

/**
 * Conversation Engine — turns user intent into a considered reply.
 * Persists both sides of the exchange, recalls relevant memories for
 * context, and publishes events so the rest of Eden can react.
 *
 * Two entry points share the same setup and wrap-up: handleUserMessage
 * waits for the complete reply (used by anything that just wants text
 * back — a future SMS or Telegram bot, for example); handleUserMessageStream
 * yields the reply as it's generated, which is what the HUD uses so Eden
 * can start speaking before it's finished "thinking."
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
    const locationLine = config.identity.ownerLocation
      ? `The user is based in ${config.identity.ownerLocation}. Use this for weather, local, or "near me" questions unless they name another place.`
      : "";
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
      locationLine,
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

  /**
   * Weather, forecast, and "near me" style questions are meaningless to a
   * generic web search without a place attached — it just returns results
   * for wherever ranks highest, which is how Eden ends up reporting the
   * weather in the Bahamas. Ground the query in the owner's known location
   * unless the user already named somewhere else. Only affects the search
   * query, never the message actually stored or shown.
   */
  private buildSearchQuery(text: string): string {
    const isLocal = /\b(weather|forecast|temperature|rain|humidity|wind|near me|nearby|local)\b/i.test(
      text
    );
    const mentionsPlace = /\b(?:in|at|near)\s+[A-Z][a-zA-Z]+/.test(text);
    if (isLocal && !mentionsPlace && config.identity.ownerLocation) {
      return `${text} in ${config.identity.ownerLocation}`;
    }
    return text;
  }

  /**
   * Everything that has to happen before Eden can even start replying:
   * make sure a conversation exists, persist the user's message, recall
   * memories, assemble history, and search the web if the question needs
   * it. Shared by both the streaming and non-streaming entry points.
   */
  private async prepareTurn(
    text: string,
    conversationId?: string | null
  ): Promise<{ convoId: string; aiMessages: AIMessage[]; memories: Memory[]; searchResults?: SearchHit[] }> {
    const { bus, providers } = this.ctx;
    const db = providers.database;

    let convoId = conversationId ?? null;
    if (!convoId) {
      const convo = await db.conversations.create(text.slice(0, 80));
      convoId = convo.id;
      await bus.publish("ConversationStarted", this.id, { conversationId: convoId });
    }

    await db.messages.add({ conversation_id: convoId, role: "user", content: text });
    await bus.publish("MessageReceived", this.id, { conversationId: convoId, text });

    const memories = await db.memories.search(text, 5);
    if (memories.length > 0) {
      await bus.publish("MemoryRecalled", this.id, { count: memories.length });
    }

    const history = await db.messages.listByConversation(convoId, 20);
    const aiMessages: AIMessage[] = history
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let searchResults: SearchHit[] | undefined;
    if (providers.search?.available() && this.needsSearch(text)) {
      try {
        searchResults = await providers.search.search(this.buildSearchQuery(text), 5);
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

    return { convoId, aiMessages, memories, searchResults };
  }

  /**
   * Persists the finished reply, announces it, and runs explicit memory
   * capture on the user's original message. Shared by both entry points.
   */
  private async finishTurn(
    convoId: string,
    replyText: string,
    provider: string,
    model: string,
    originalText: string
  ): Promise<Message> {
    const { bus, providers } = this.ctx;
    const db = providers.database;

    const reply = await db.messages.add({
      conversation_id: convoId,
      role: "assistant",
      content: replyText,
      provider,
      model,
    });
    await bus.publish("MessageSent", this.id, { conversationId: convoId, provider, model });

    const rememberMatch = originalText.match(/^\s*(?:eden[,\s]+)?remember(?:\s+that)?\s+(.{4,})/i);
    if (rememberMatch) {
      const memory = await db.memories.add({
        type: "long_term",
        content: rememberMatch[1].trim(),
        importance: 3,
        metadata: { source: "explicit", conversationId: convoId },
      });
      await bus.publish("MemoryCreated", this.id, { memoryId: memory.id });
    }

    return reply;
  }

  /** Waits for the complete reply. Simple, for callers that don't stream. */
  async handleUserMessage(
    text: string,
    conversationId?: string | null
  ): Promise<{ conversationId: string; reply: Message }> {
    const { bus, providers } = this.ctx;
    const { convoId, aiMessages, memories, searchResults } = await this.prepareTurn(
      text,
      conversationId
    );

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

    const reply = await this.finishTurn(convoId, replyText, provider, model, text);
    return { conversationId: convoId, reply };
  }

  /**
   * Streams the reply as the model generates it. This is what lets the
   * HUD show Eden's words appearing live and start speaking a sentence
   * before the rest of the reply even exists.
   */
  async *handleUserMessageStream(
    text: string,
    conversationId?: string | null
  ): AsyncGenerator<ConversationStreamEvent> {
    const { bus, providers } = this.ctx;
    const { convoId, aiMessages, memories, searchResults } = await this.prepareTurn(
      text,
      conversationId
    );

    yield { type: "conversationId", conversationId: convoId };

    let replyText = "";
    const provider = providers.ai.id;
    const model = providers.ai.defaultModel;
    try {
      for await (const chunk of providers.ai.chatStream({
        system: this.systemPrompt(memories, searchResults),
        messages: aiMessages,
        maxTokens: 1024,
      })) {
        replyText += chunk;
        yield { type: "delta", text: chunk };
      }
    } catch (err) {
      await bus.publish("ProviderError", this.id, {
        provider,
        error: err instanceof Error ? err.message : String(err),
      });
      const fallback = `I hit a problem reaching my ${provider} core, ${config.identity.userTitle}. The error has been logged.`;
      replyText += fallback;
      yield { type: "delta", text: fallback };
    }

    const reply = await this.finishTurn(convoId, replyText, provider, model, text);
    yield { type: "done", conversationId: convoId, reply: reply.content, provider, model };
  }
}
