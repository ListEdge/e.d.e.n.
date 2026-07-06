"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EdenOrb from "./orb/EdenOrb";
import TopBar from "./hud/TopBar";
import type { EngineStatus } from "./hud/SystemPanel";
import type { StreamEvent } from "./hud/EventStream";
import CommandBar from "./hud/CommandBar";
import ApprovalsBar, { type PendingApproval } from "./hud/ApprovalsBar";
import RealtimeVoice from "./hud/RealtimeVoice";
import Dashboard, {
  friendlyRegionName,
  type DashboardData,
  type DashboardRegion,
  type DashboardSize,
  type DashboardSlot,
  type MindMapNode,
} from "./hud/Dashboard";

interface SystemStatus {
  ai: { provider: string; model: string; online: boolean };
  database: { provider: string; persistent: boolean };
  voice: { available: boolean };
  realtime: { available: boolean };
  engines: EngineStatus[];
  capabilities: Array<{ id: string; enabled: boolean }>;
  presence: string;
  scene: string;
  context: { phase?: string };
  identity: { userTitle: string };
}

const MUTE_STORAGE_KEY = "eden_voice_muted";

/** Finds complete sentences at the start of `text`. Returns each sentence
 *  (including its trailing punctuation/space) plus whatever's left over
 *  and not yet terminated by ./!/? */
function extractCompleteSentences(text: string): { sentences: string[]; rest: string } {
  const matches = text.match(/[^.!?]*[.!?]+(\s+|$)/g);
  if (!matches) return { sentences: [], rest: text };
  const consumed = matches.join("");
  return { sentences: matches.map((s) => s.trim()).filter(Boolean), rest: text.slice(consumed.length) };
}

/**
 * Pure placement algorithm shared by placeDashboard (a genuinely new item)
 * and moveDashboardByReference (relocating an existing one, which is just
 * "remove it, then place it fresh with new intent"). "full" always clears
 * everything else. Otherwise: an explicitly requested empty region wins,
 * then any empty region, and only when all four are occupied does the
 * oldest one get replaced.
 */
function computePlacement(
  currentSlots: DashboardSlot[],
  id: number,
  data: DashboardData,
  size: DashboardSize,
  region: DashboardRegion | undefined
): { slots: DashboardSlot[]; placedRegion: DashboardRegion } {
  if (size === "full") {
    return { slots: [{ id, region: "full", data }], placedRegion: "full" };
  }

  let slots = currentSlots.filter((s) => s.region !== "full");
  const quadrants: DashboardRegion[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
  const occupied = new Set(slots.map((s) => s.region));

  let target: DashboardRegion | undefined =
    region && quadrants.includes(region) && !occupied.has(region) ? region : undefined;
  if (!target) target = quadrants.find((q) => !occupied.has(q));

  if (!target) {
    const oldest = slots.reduce((a, b) => (a.id < b.id ? a : b));
    target = oldest.region;
    slots = slots.filter((s) => s.id !== oldest.id);
  }

  return { slots: [...slots, { id, region: target, data }], placedRegion: target };
}

export default function EdenShell() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<
    "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "error"
  >("idle");
  const conversationId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioLevelRef = useRef(0);
  const [dashboardSlots, setDashboardSlots] = useState<DashboardSlot[]>([]);
  const dashboardIdRef = useRef(0);

  /**
   * Places a dashboard and returns which region it actually landed in.
   */
  const placeDashboard = useCallback(
    (data: DashboardData, size: DashboardSize, region?: DashboardRegion): DashboardRegion => {
      const id = ++dashboardIdRef.current;
      let placedRegion: DashboardRegion = "full";

      setDashboardSlots((prev) => {
        const result = computePlacement(prev, id, data, size, region);
        placedRegion = result.placedRegion;
        return result.slots;
      });

      return placedRegion;
    },
    []
  );

  /** Closes whatever's on screen that matches reference (title match). */
  const dismissDashboardByReference = useCallback((reference: string): string => {
    const needle = reference.trim().toLowerCase();
    let matchedTitle = "";
    setDashboardSlots((prev) => {
      const match = needle
        ? prev.find((s) => s.data.title.toLowerCase().includes(needle))
        : undefined;
      if (!match) return prev;
      matchedTitle = match.data.title;
      return prev.filter((s) => s.id !== match.id);
    });
    return matchedTitle ? `Closed "${matchedTitle}".` : "I couldn't find anything on screen matching that.";
  }, []);

  /**
   * Moves or resizes something already on screen. If size isn't given,
   * toggles between full and quadrant - a sensible default for "give this
   * more room" or "shrink it back down" without needing to be specific.
   */
  const moveDashboardByReference = useCallback(
    (reference: string, size?: DashboardSize, region?: DashboardRegion): string => {
      const needle = reference.trim().toLowerCase();
      let matchedTitle = "";
      let finalRegion: DashboardRegion = "full";

      setDashboardSlots((prev) => {
        const match = needle
          ? prev.find((s) => s.data.title.toLowerCase().includes(needle))
          : undefined;
        if (!match) return prev;
        matchedTitle = match.data.title;

        const remaining = prev.filter((s) => s.id !== match.id);
        const finalSize: DashboardSize =
          size ?? (region ? "quadrant" : match.region === "full" ? "quadrant" : "full");

        const result = computePlacement(remaining, match.id, match.data, finalSize, region);
        finalRegion = result.placedRegion;
        return result.slots;
      });

      if (!matchedTitle) return "I couldn't find anything on screen matching that.";
      const where = finalRegion === "full" ? "full size" : friendlyRegionName(finalRegion);
      return `Moved "${matchedTitle}" to ${where}.`;
    },
    []
  );

  /** Exactly what's on screen right now, for Eden to check on demand. */
  const getDashboardState = useCallback(() => {
    return dashboardSlots.map((s) => ({
      region: s.region,
      type: s.data.chart ? "chart" : "list",
      title: s.data.title,
      itemCount: s.data.items?.length ?? s.data.chart?.values.length ?? 0,
    }));
  }, [dashboardSlots]);

  const capsEnabled = status?.capabilities.filter((c) => c.enabled).length ?? 0;

  /** Shows Eden's engine/context status as a dashboard, on request - not
   *  visible by default, same rule as everything else on screen now. */
  const showSystemStatus = useCallback((): DashboardRegion => {
    const engineItems = (status?.engines ?? []).map((e) => ({
      title: e.name,
      detail: e.online ? "online" : "offline",
    }));
    const contextLine =
      "Presence: " +
      (status?.presence ?? "unknown") +
      " · Scene: " +
      (status?.scene ?? "ambient") +
      " · Capabilities: " +
      capsEnabled +
      "/" +
      (status?.capabilities.length ?? 0);
    const data: DashboardData = { title: "System Status", summary: contextLine, items: engineItems };
    return placeDashboard(data, engineItems.length > 4 ? "full" : "quadrant");
  }, [status, capsEnabled, placeDashboard]);

  /** Shows the recent internal event log as a dashboard, on request. */
  const showEventLog = useCallback((): DashboardRegion => {
    const recent = events.slice(0, 8);
    const items = recent.map((e) => ({
      title: e.type,
      detail: e.source + " · " + new Date(e.at).toLocaleTimeString(),
    }));
    const data: DashboardData = { title: "Event Log", items };
    return placeDashboard(data, items.length > 4 ? "full" : "quadrant");
  }, [events, placeDashboard]);

  const mindmapNodeIdRef = useRef(0);

  /** A mind map is just dashboard content, like everything else - it
   *  always claims the full slot since a growing branching structure
   *  needs the room, and starting a new one replaces any old one. */
  const startMindmap = useCallback(
    (topic: string): DashboardRegion => {
      const rootId = ++mindmapNodeIdRef.current;
      const data: DashboardData = {
        title: topic,
        mindmap: [{ id: rootId, label: topic, parentId: null }],
      };
      return placeDashboard(data, "full");
    },
    [placeDashboard]
  );

  /** Finds the current mind map slot, if any - shared by every mind map
   *  mutation below so they all agree on what "the current map" means. */
  const findMindmapSlot = useCallback((slots: DashboardSlot[]) => {
    return slots.find((s) => s.data.mindmap && s.data.mindmap.length > 0);
  }, []);

  const addMindmapIdea = useCallback(
    (parentReference: string, label: string, detail?: string): string => {
      let result = "There's no mind map open to add that to.";
      setDashboardSlots((prev) => {
        const slot = findMindmapSlot(prev);
        if (!slot || !slot.data.mindmap) return prev;

        const needle = parentReference.trim().toLowerCase();
        const parent = slot.data.mindmap.find((n) => n.label.toLowerCase().includes(needle));
        if (!parent) {
          result = `I couldn't find "${parentReference}" on the map.`;
          return prev;
        }

        const newNode: MindMapNode = {
          id: ++mindmapNodeIdRef.current,
          label,
          detail,
          parentId: parent.id,
        };
        result = `Added "${label}" under "${parent.label}".`;
        const updatedMindmap = [...slot.data.mindmap, newNode];
        return prev.map((s) =>
          s.id === slot.id ? { ...s, data: { ...s.data, mindmap: updatedMindmap } } : s
        );
      });
      return result;
    },
    [findMindmapSlot]
  );

  /** Attaches real search results as new nodes under an existing branch -
   *  the search itself already happened server-side; this just wires the
   *  results into the map's state. */
  const addMindmapResearchNodes = useCallback(
    (parentReference: string, nodes: Array<{ label: string; detail?: string }>): string => {
      let result = "There's no mind map open to add that to.";
      setDashboardSlots((prev) => {
        const slot = findMindmapSlot(prev);
        if (!slot || !slot.data.mindmap) return prev;

        const needle = parentReference.trim().toLowerCase();
        const parent = slot.data.mindmap.find((n) => n.label.toLowerCase().includes(needle));
        if (!parent) {
          result = `I couldn't find "${parentReference}" on the map.`;
          return prev;
        }

        const newNodes: MindMapNode[] = nodes.map((n) => ({
          id: ++mindmapNodeIdRef.current,
          label: n.label,
          detail: n.detail,
          parentId: parent.id,
        }));
        result = `Added ${newNodes.length} result${newNodes.length === 1 ? "" : "s"} under "${parent.label}".`;
        const updatedMindmap = [...slot.data.mindmap, ...newNodes];
        return prev.map((s) =>
          s.id === slot.id ? { ...s, data: { ...s.data, mindmap: updatedMindmap } } : s
        );
      });
      return result;
    },
    [findMindmapSlot]
  );

  const getMindmapStructure = useCallback((): { nodes: Array<{ label: string; parent: string | null }> } => {
    const slot = findMindmapSlot(dashboardSlots);
    if (!slot || !slot.data.mindmap) return { nodes: [] };
    const byId = new Map(slot.data.mindmap.map((n) => [n.id, n.label]));
    return {
      nodes: slot.data.mindmap.map((n) => ({
        label: n.label,
        parent: n.parentId !== null ? (byId.get(n.parentId) ?? null) : null,
      })),
    };
  }, [dashboardSlots, findMindmapSlot]);

  /** Removes a branch and everything under it - cascading, so nothing is
   *  left pointing at a parent that no longer exists. */
  const removeMindmapNode = useCallback(
    (reference: string): string => {
      let result = "I couldn't find that on the map.";
      setDashboardSlots((prev) => {
        const slot = findMindmapSlot(prev);
        if (!slot || !slot.data.mindmap) return prev;

        const needle = reference.trim().toLowerCase();
        const target = slot.data.mindmap.find(
          (n) => n.parentId !== null && n.label.toLowerCase().includes(needle)
        );
        if (!target) {
          result = `I couldn't find "${reference}" on the map - if that's the main topic, close the whole map instead.`;
          return prev;
        }

        const toRemove = new Set<number>([target.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const n of slot.data.mindmap) {
            if (n.parentId !== null && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
              toRemove.add(n.id);
              changed = true;
            }
          }
        }

        result = `Removed "${target.label}"${toRemove.size > 1 ? " and its sub-branches." : "."}`;
        const updatedMindmap = slot.data.mindmap.filter((n) => !toRemove.has(n.id));
        return prev.map((s) =>
          s.id === slot.id ? { ...s, data: { ...s.data, mindmap: updatedMindmap } } : s
        );
      });
      return result;
    },
    [findMindmapSlot]
  );

  // Generation counter: invalidates stale speech loops when a new message
  // is sent or voice is muted mid-reply.
  const speechGen = useRef(0);
  const speechQueueRef = useRef<Promise<string | null>[]>([]);
  const playerRunningRef = useRef(false);

  // Restore the mute preference once, on first mount, client-side only.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === "true");
    } catch {
      /* localStorage unavailable — default to unmuted */
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* HUD degrades gracefully */
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      /* HUD degrades gracefully */
    }
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.pending ?? []);
      }
    } catch {
      /* HUD degrades gracefully */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshEvents();
    refreshApprovals();
    const id = setInterval(() => {
      refreshEvents();
      refreshApprovals();
    }, 6000);
    return () => clearInterval(id);
  }, [refreshStatus, refreshEvents, refreshApprovals]);


  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      } catch {
        /* ignore — preference just won't persist */
      }
      if (next) {
        speechGen.current += 1;
        speechQueueRef.current = [];
        audioRef.current?.pause();
      }
      return next;
    });
  }, []);

  /** Fetches one sentence's audio clip. Never throws — a failed clip is
   *  just skipped rather than stalling the rest of the reply. */
  const fetchClip = useCallback(async (text: string, gen: number): Promise<string | null> => {
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (speechGen.current !== gen) return null; // superseded while downloading
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, []);

  /** Plays whatever's in the speech queue, in order, gaplessly. Only one
   *  loop ever runs at a time; enqueueSentence starts it if it's idle. */
  const runPlayerLoop = useCallback(async (gen: number) => {
    if (playerRunningRef.current) return;
    playerRunningRef.current = true;
    try {
      const audio = audioRef.current;
      while (speechQueueRef.current.length > 0) {
        if (speechGen.current !== gen || !audio) return;
        const clip = speechQueueRef.current.shift();
        if (!clip) continue;
        const url = await clip;
        if (!url || speechGen.current !== gen) {
          if (url) URL.revokeObjectURL(url);
          continue;
        }
        audio.src = url;
        const finished = new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
        await audio.play().catch(() => {
          /* autoplay can be blocked by the browser — the text reply already shown is enough */
        });
        await finished;
        URL.revokeObjectURL(url);
      }
    } finally {
      playerRunningRef.current = false;
    }
  }, []);

  const enqueueSentence = useCallback(
    (text: string, gen: number) => {
      if (!text.trim() || muted || !status?.voice.available) return;
      speechQueueRef.current.push(fetchClip(text, gen));
      runPlayerLoop(gen);
    },
    [muted, status?.voice.available, fetchClip, runPlayerLoop]
  );

  const resolveApproval = useCallback(
    async (approvalId: string, decision: "approved" | "denied") => {
      setResolvingId(approvalId);
      // Cut off anything still playing and start a fresh speech lane, same
      // as sending a new message — this result deserves to be heard, not
      // silently overwritten by leftover audio from an earlier turn.
      const gen = ++speechGen.current;
      speechQueueRef.current = [];
      audioRef.current?.pause();

      let message: string;
      try {
        const res = await fetch("/api/approvals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ approvalId, decision }),
        });
        const data = await res.json().catch(() => ({}) as { result?: string; error?: string });
        message = res.ok
          ? data.result ?? (decision === "approved" ? "Approved." : "Denied.")
          : `Something went wrong updating that: ${data.error ?? "unknown error"}`;
      } catch {
        message = "I couldn't confirm that went through — check the event stream.";
      }

      setReply(message);
      enqueueSentence(message, gen);
      setResolvingId(null);
      refreshApprovals();
      refreshEvents();
    },
    [refreshApprovals, refreshEvents, enqueueSentence]
  );

  const sendIntent = useCallback(
    async (text: string) => {
      // Cut off anything still playing from the previous turn.
      const gen = ++speechGen.current;
      speechQueueRef.current = [];
      audioRef.current?.pause();

      setBusy(true);
      setReply(null);

      let fullText = "";
      let spokenUpTo = 0;

      const speakReadySentences = (finalFlush: boolean) => {
        const { sentences, rest } = extractCompleteSentences(fullText.slice(spokenUpTo));
        for (const sentence of sentences) {
          enqueueSentence(sentence, gen);
        }
        spokenUpTo = fullText.length - rest.length;
        if (finalFlush && rest.trim()) {
          enqueueSentence(rest.trim(), gen);
          spokenUpTo = fullText.length;
        }
      };

      try {
        const res = await fetch("/api/conversation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, conversationId: conversationId.current }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          setReply(`Something went wrong: ${data.error ?? "unknown error"}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: { type: string; [key: string]: unknown };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.type === "conversationId") {
              conversationId.current = evt.conversationId as string;
            } else if (evt.type === "delta") {
              fullText += evt.text as string;
              setReply(fullText);
              speakReadySentences(false);
            } else if (evt.type === "error") {
              const message = (evt.error as string) || "Something went wrong.";
              fullText = fullText || message;
              setReply(fullText);
            } else if (evt.type === "done") {
              fullText = (evt.reply as string) ?? fullText;
              setReply(fullText);
            }
          }
        }

        speakReadySentences(true);
      } catch {
        setReply("I couldn't reach my own core. Check the deployment logs.");
      } finally {
        setBusy(false);
        refreshEvents();
        refreshStatus();
        refreshApprovals();
      }
    },
    [refreshEvents, refreshStatus, refreshApprovals, enqueueSentence]
  );

  const orbState = voiceStatus === "speaking" ? "speaking" : busy ? "thinking" : "idle";
  const voiceIsPrimary = status?.realtime.available ?? false;

  return (
    <main className="core-glow relative h-dvh w-full overflow-hidden">
      {/* The Eden Core */}
      <EdenOrb state={orbState} audioLevelRef={voiceAudioLevelRef} compact={dashboardSlots.length > 0} />

      {/* Off-screen player for spoken replies (legacy text-chat fallback) */}
      <audio ref={audioRef} className="hidden" />

      <TopBar
        provider={status?.ai.provider ?? "…"}
        persistent={status?.database.persistent ?? false}
        presence={status?.presence ?? "unknown"}
        voiceAvailable={status?.voice.available ?? false}
        muted={muted}
        onToggleMute={toggleMute}
      />

      {/* Middle — floating dashboards appear here, in the space the orb clears when
          compact. Bounded on both top and bottom (not just anchored from the top) so
          it can never grow into the control bar below, however much content it has. */}
      {dashboardSlots.length > 0 && (
        <div className="absolute inset-x-0 top-[18%] bottom-40 z-10 px-5 sm:top-[20%] sm:bottom-44">
          <Dashboard slots={dashboardSlots} />
        </div>
      )}

      {/* Bottom — approvals, then either voice (primary) or typed chat (fallback) */}
      <div className="absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl px-5 pb-6 sm:pb-8">
        <ApprovalsBar approvals={approvals} onResolve={resolveApproval} resolvingId={resolvingId} />

        {voiceIsPrimary ? (
          <RealtimeVoice
            available
            muted={muted}
            onStatusChange={setVoiceStatus}
            audioLevelRef={voiceAudioLevelRef}
            onShowDashboard={placeDashboard}
            onDismissDashboard={dismissDashboardByReference}
            onMoveDashboard={moveDashboardByReference}
            onShowSystemStatus={showSystemStatus}
            onShowEventLog={showEventLog}
            onStartMindmap={startMindmap}
            onAddMindmapIdea={addMindmapIdea}
            onAddMindmapResearch={addMindmapResearchNodes}
            getMindmapStructure={getMindmapStructure}
            onRemoveMindmapNode={removeMindmapNode}
            getDashboardState={getDashboardState}
          />
        ) : (
          <>
            {(reply || busy) && (
              <div className="hud-panel mb-3 max-h-56 overflow-y-auto px-5 py-4">
                {reply ? (
                  <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink/95">
                    {reply}
                    {busy && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse align-middle bg-ink/60" />
                    )}
                  </p>
                ) : (
                  <p className="font-hud text-[12px] tracking-widest text-dim">EDEN IS THINKING…</p>
                )}
              </div>
            )}
            <CommandBar onSubmit={sendIntent} busy={busy} />
          </>
        )}

        <p className="mt-2.5 text-center font-hud text-[10px] tracking-[0.25em] text-dim/60">
          HUMAN INTENTION IN · COMPLETED OUTCOMES OUT
        </p>
      </div>
    </main>
  );
}
