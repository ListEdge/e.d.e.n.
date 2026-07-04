import { config } from "@/lib/config";
import { captureExplicitMemory } from "@/lib/memory-capture";
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

  private systemPrompt(
    memories: Memory[],
    searchResults?: SearchHit[],
    emailActionResult?: string,
    emailAddressMissing?: boolean
  ): string {
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
    const emailBlock = emailActionResult
      ? `\n\nEmail action just taken on the user's behalf: ${emailActionResult} Report this outcome to the user naturally, in your own words — don't claim anything beyond what's stated here, and don't say you can't send emails since you just attempted to.`
      : "";
    const missingAddressBlock = emailAddressMissing
      ? `\n\nThe user's message looks like a request to send an email, but Eden could not confirm a valid recipient address from it, so nothing was sent or attempted. Ask them to confirm the recipient's email address. Do not say or imply that an email was sent.`
      : "";

    return [
      `You are Eden, a personal AI operating system built for ${owner}.`,
      `Address the user as "${title}" — composed, precise, quietly capable. Think JARVIS, not a chatbot.`,
      `Be concise. Prefer plain English. When asked to do something Eden cannot yet do, say so honestly and describe what capability would need to be connected.`,
      `You CAN send email on the user's behalf when given a recipient's email address, a subject, and what should be said — sending still requires the user's approval, which appears as a card in the interface for them to tap. If they want to email someone but haven't given an actual email address, ask for it rather than guessing one.`,
      `Never say or imply that you have sent an email, made a call, or completed any other action requiring approval unless this system prompt explicitly confirms it happened (look for a line starting "Email action just taken"). If no such confirmation appears below, you have not performed that action this turn — say so honestly rather than assuming or claiming success.`,
      locationLine,
      memoryBlock,
      searchBlock,
      emailBlock,
      missingAddressBlock,
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
   * Cheap, reliable trigger: does this message actually contain an email
   * address AND mention email/mail? Both together are a strong signal —
   * real email addresses almost never show up in messages that aren't
   * about sending mail. No AI call needed just to decide this.
   */
  private looksLikeEmailRequest(text: string): boolean {
    const hasEmailAddress = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+/.test(text);
    const mentionsEmail = /\b(email|e-mail|mail)\b/i.test(text);
    return hasEmailAddress && mentionsEmail;
  }

  /**
   * Only called once looksLikeEmailRequest is true. Asks the AI to turn
   * the request into a proper subject and body — the recipient address
   * must be lifted verbatim from the message, never invented.
   */
  private async extractEmailIntent(
    text: string
  ): Promise<{ to: string; subject: string; body: string } | null> {
    try {
      const response = await this.ctx.providers.ai.chat({
        system: [
          "Extract the email the user wants sent, from their message.",
          'Respond with ONLY strict JSON, no prose, no markdown fences: {"to": "...", "subject": "...", "body": "..."}',
          'Use the exact email address as it literally appears in the message for "to" — never invent or guess one.',
          "Write a short, appropriate subject line and a clear, well-written body reflecting what the user wants said.",
          'If no real email address appears anywhere in the message, respond with exactly: {"to": null}',
        ].join(" "),
        messages: [{ role: "user", content: text }],
        maxTokens: 400,
        temperature: 0.3,
        json: true,
      });
      const clean = response.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (!parsed?.to || typeof parsed.to !== "string") return null;
      return {
        to: parsed.to,
        subject:
          typeof parsed.subject === "string" && parsed.subject ? parsed.subject : "Message from Eden",
        body: typeof parsed.body === "string" ? parsed.body : "",
      };
    } catch {
      return null; // malformed or offline — the normal reply proceeds without it
    }
  }

  /**
   * Everything that has to happen before Eden can even start replying:
   * make sure a conversation exists, persist the user's message, recall
   * memories, assemble history, search the web if needed, and act on an
   * email request if one was made. Shared by both the streaming and
   * non-streaming entry points.
   */
  private async prepareTurn(
    text: string,
    conversationId?: string | null
  ): Promise<{
    convoId: string;
    aiMessages: AIMessage[];
    memories: Memory[];
    searchResults?: SearchHit[];
    emailActionResult?: string;
    emailAddressMissing?: boolean;
  }> {
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

    let emailActionResult: string | undefined;
    let emailAddressMissing = false;
    if (this.looksLikeEmailRequest(text)) {
      const intent = await this.extractEmailIntent(text);
      if (intent) {
        emailActionResult = await this.ctx.sendEmail(intent.to, intent.subject, intent.body);
      } else {
        emailAddressMissing = true;
      }
    }

    return { convoId, aiMessages, memories, searchResults, emailActionResult, emailAddressMissing };
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

    await captureExplicitMemory(originalText, db, bus, this.id, { conversationId: convoId });

    return reply;
  }

  /** Waits for the complete reply. Simple, for callers that don't stream. */
  async handleUserMessage(
    text: string,
    conversationId?: string | null
  ): Promise<{ conversationId: string; reply: Message }> {
    const { bus, providers } = this.ctx;
    const { convoId, aiMessages, memories, searchResults, emailActionResult, emailAddressMissing } =
      await this.prepareTurn(text, conversationId);

    let replyText: string;
    let provider = providers.ai.id;
    let model = providers.ai.defaultModel;
    try {
      const response = await providers.ai.chat({
        system: this.systemPrompt(memories, searchResults, emailActionResult, emailAddressMissing),
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
    const { convoId, aiMessages, memories, searchResults, emailActionResult, emailAddressMissing } =
      await this.prepareTurn(text, conversationId);

    yield { type: "conversationId", conversationId: convoId };

    let replyText = "";
    const provider = providers.ai.id;
    const model = providers.ai.defaultModel;
    try {
      for await (const chunk of providers.ai.chatStream({
        system: this.systemPrompt(memories, searchResults, emailActionResult, emailAddressMissing),
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
