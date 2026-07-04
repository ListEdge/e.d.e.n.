"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EdenOrb from "./orb/EdenOrb";
import TopBar from "./hud/TopBar";
import SystemPanel, { type EngineStatus } from "./hud/SystemPanel";
import ContextPanel from "./hud/ContextPanel";
import EventStream, { type StreamEvent } from "./hud/EventStream";
import CommandBar from "./hud/CommandBar";
import ApprovalsBar, { type PendingApproval } from "./hud/ApprovalsBar";
import RealtimeVoice from "./hud/RealtimeVoice";
import Dashboard, { type DashboardData, type DashboardEntry } from "./hud/Dashboard";

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

function extractCompleteSentences(text: string): { sentences: string[]; rest: string } {
  const matches = text.match(/[^.!?]*[.!?]+(\s+|$)/g);
  if (!matches) return { sentences: [], rest: text };
  const consumed = matches.join("");
  return { sentences: matches.map((s) => s.trim()).filter(Boolean), rest: text.slice(consumed.length) };
}

export default function EdenShell() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle" as "idle" | "connecting" | "listening" | "speaking" | "error");
  const conversationId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioLevelRef = useRef(0);
  const [dashboards, setDashboards] = useState<DashboardEntry[]>([]);
  const dashboardIdRef = useRef(0);

  const showDashboard = useCallback((data: DashboardData) => {
    const id = ++dashboardIdRef.current;
    setDashboards((prev) => [...prev, { id, data }].slice(-2));
  }, []);

  const dismissDashboard = useCallback((id: number) => {
    setDashboards((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const speechGen = useRef(0);
  const speechQueueRef = useRef<Promise<string | null>[]>([]);
  const playerRunningRef = useRef(false);

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

  const fetchClip = useCallback(async (text: string, gen: number): Promise<string | null> => {
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (speechGen.current !== gen) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, []);

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
        if (finalFlush
