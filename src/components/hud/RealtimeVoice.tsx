"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  friendlyRegionName,
  sanitizeSvg,
  type DashboardData,
  type DashboardRegion,
  type DashboardSize,
} from "./Dashboard";

type RealtimeStatus = "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "error";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

/**
 * Real-time voice-to-voice - Eden's primary interface. Connects the
 * browser directly to OpenAI over WebRTC - audio never touches Eden's
 * own server, which is the entire reason this feels fast. Eden's server
 * is only involved for: minting the session token (/api/realtime/session),
 * running any tool call the model requests (/api/realtime/tool-call), and
 * saving transcripts (/api/realtime/transcript).
 *
 * Realtime sessions have a hard time limit and can drop unexpectedly -
 * this component distinguishes a deliberate stop (the person tapped the
 * button) from an unexpected drop (the session ended or the network
 * hiccuped), and for the latter, automatically reconnects a few times,
 * carrying the conversation ID forward so the new session's instructions
 * include what was just being discussed - Eden picks back up rather than
 * starting over. After a few failed attempts it gives up and asks for a
 * manual tap rather than retrying forever.
 *
 * IMPORTANT - read this before assuming something's broken:
 * The exact event names OpenAI's GA Realtime API uses for tool calls and
 * transcripts weren't fully confirmable without a live session (see
 * docs/REALTIME-VOICE-ARCHITECTURE.md). This component matches events by
 * pattern ("contains 'function_call'", "contains 'transcript'") rather
 * than one exact string. The raw event log below is the ground truth.
 */
export default function RealtimeVoice({
  available,
  muted = false,
  onStatusChange,
  audioLevelRef,
  onShowDashboard,
  onDismissDashboard,
  onMoveDashboard,
  getDashboardState,
  onShowSystemStatus,
  onShowEventLog,
  onStartMindmap,
  onAddMindmapIdea,
  onAddMindmapResearch,
  getMindmapStructure,
  onRemoveMindmapNode,
}: {
  available: boolean;
  muted?: boolean;
  onStatusChange?: (status: RealtimeStatus) => void;
  audioLevelRef?: { current: number };
  /** Places a dashboard and returns which region it actually landed in -
   *  the requested region might already be taken, so the caller needs to
   *  report back the real outcome for an accurate spoken confirmation. */
  onShowDashboard?: (data: DashboardData, size: DashboardSize, region?: DashboardRegion) => DashboardRegion;
  /** Closes whatever matches the reference and returns a confirmation
   *  string - this is client state, so it can't go through the server. */
  onDismissDashboard?: (reference: string) => string;
  /** Moves/resizes something already showing and returns a confirmation
   *  string - also client state, same reasoning as dismiss. */
  onMoveDashboard?: (reference: string, size?: DashboardSize, region?: DashboardRegion) => string;
  /** Reports exactly what's on screen right now - also client state. */
  getDashboardState?: () => Array<{ region: string; type: string; title: string }>;
  /** Shows engine/context status as a dashboard - client state, on request only. */
  onShowSystemStatus?: () => DashboardRegion;
  /** Shows the recent event log as a dashboard - client state, on request only. */
  onShowEventLog?: () => DashboardRegion;
  /** Starts a fresh mind map for the given topic - client state. */
  onStartMindmap?: (topic: string) => DashboardRegion;
  /** Adds a plain idea node under an existing branch - client state. */
  onAddMindmapIdea?: (parent: string, label: string, detail?: string) => string;
  /** Attaches real search results (already fetched server-side) as new
   *  nodes under an existing branch - client state. */
  onAddMindmapResearch?: (parent: string, nodes: Array<{ label: string; detail?: string }>) => string;
  /** Reports the full current mind map structure - client state. */
  getMindmapStructure?: () => { nodes: Array<{ label: string; parent: string | null }> };
  /** Removes a branch (and its sub-branches) from the mind map - client state. */
  onRemoveMindmapNode?: (reference: string) => string;
}) {
  const [status, setStatusState] = useState<RealtimeStatus>("idle");
  const [expanded, setExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<Array<{ role: "user" | "assistant"; text: string }>>(
    []
  );

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const originalInstructionsRef = useRef<string>("You are Eden, a helpful personal AI assistant.");
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [rehearsalScenario, setRehearsalScenario] = useState("");
  const toolCallBuffers = useRef<Map<string, { name: string; args: string }>>(new Map());
  const transcriptBuffers = useRef<Map<string, string>>(new Map());
  const analysisContextRef = useRef<AudioContext | null>(null);
  const analysisFrameRef = useRef<number | null>(null);

  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref-indirection breaks the circular dependency between establishConnection
  // (which needs to call handleUnexpectedDisconnect on drop) and
  // handleUnexpectedDisconnect (which needs to call establishConnection to
  // retry) - two useCallbacks can't directly reference each other.
  const establishConnectionRef = useRef<(isReconnect: boolean) => Promise<void>>(async () => {});
  const handleUnexpectedDisconnectRef = useRef<() => void>(() => {});

  const setStatus = useCallback(
    (next: RealtimeStatus) => {
      setStatusState(next);
      onStatusChange?.(next);
    },
    [onStatusChange]
  );

  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = muted;
  }, [muted]);

  const log = useCallback((line: string) => {
    setEventLog((prev) => [...prev.slice(-59), line]);
  }, []);

  /**
   * Tears down the live connection's resources. Detaches
   * onconnectionstatechange FIRST, before closing anything - that's what
   * stops a deliberate stop from being mistaken for an unexpected drop,
   * rather than relying on timing around when the event actually fires.
   */
  const teardownConnection = useCallback(() => {
    if (pcRef.current) pcRef.current.onconnectionstatechange = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    micStreamRef.current = null;
    dcRef.current = null;
    pcRef.current = null;
    toolCallBuffers.current.clear();
    transcriptBuffers.current.clear();
    if (analysisFrameRef.current) cancelAnimationFrame(analysisFrameRef.current);
    analysisFrameRef.current = null;
    analysisContextRef.current?.close().catch(() => {});
    analysisContextRef.current = null;
    if (audioLevelRef) audioLevelRef.current = 0;
  }, [audioLevelRef]);

  /** Full, deliberate stop - cancels any pending reconnect too. */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    teardownConnection();
    setStatus("idle");
    setIsRehearsing(false);
    setRehearsalScenario("");
  }, [teardownConnection, setStatus]);

  useEffect(() => disconnect, [disconnect]);

  /** Updates the live session's own instructions without disconnecting -
   *  this is what lets rehearsal mode swap Eden's persona mid-conversation
   *  and swap it back, all within one continuous connection. */
  const sendSessionUpdate = useCallback((instructions: string) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(
        JSON.stringify({
          type: "session.update",
          session: { instructions },
        })
      );
    }
  }, []);

  /** Sends a tool's result back into the live session and asks it to
   *  continue - shared by every tool path, server-executed or not. */
  const sendToolResult = useCallback((callId: string, result: string) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ result }),
          },
        })
      );
      dc.send(JSON.stringify({ type: "response.create" }));
    }
  }, []);

  const relayToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsJson || "{}");
      } catch {
        /* malformed arguments - the executor below still runs, just with nothing */
      }

      log(`→ tool: ${name}(${argsJson})`);

      // These two are about what's currently on screen, which only the
      // browser knows - answered directly here, no server round trip.
      if (name === "get_dashboard_state") {
        const state = getDashboardState ? getDashboardState() : [];
        const resultText = JSON.stringify({ screen: state });
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "show_system_status") {
        const region = onShowSystemStatus ? onShowSystemStatus() : "full";
        const resultText = region === "full" ? "Shown on screen." : "Shown in the " + friendlyRegionName(region) + ".";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "show_event_log") {
        const region = onShowEventLog ? onShowEventLog() : "full";
        const resultText = region === "full" ? "Shown on screen." : "Shown in the " + friendlyRegionName(region) + ".";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "start_mindmap") {
        const topic = typeof args.topic === "string" && args.topic ? args.topic : "New idea";
        onStartMindmap?.(topic);
        const resultText = "Started a mind map for " + topic + ".";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "add_mindmap_idea") {
        const parent = typeof args.parent === "string" ? args.parent : "";
        const label = typeof args.label === "string" ? args.label : "";
        const detail = typeof args.detail === "string" ? args.detail : undefined;
        const resultText =
          parent && label && onAddMindmapIdea
            ? onAddMindmapIdea(parent, label, detail)
            : "I need both a branch to attach to and a label.";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "get_mindmap_structure") {
        const structure = getMindmapStructure ? getMindmapStructure() : { nodes: [] };
        const resultText = JSON.stringify(structure);
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "remove_mindmap_node") {
        const reference = typeof args.reference === "string" ? args.reference : "";
        const resultText = onRemoveMindmapNode ? onRemoveMindmapNode(reference) : "Nothing to remove.";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "dismiss_dashboard") {
        const reference = typeof args.reference === "string" ? args.reference : "";
        const resultText = onDismissDashboard ? onDismissDashboard(reference) : "Nothing to dismiss.";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "move_dashboard") {
        const reference = typeof args.reference === "string" ? args.reference : "";
        const size = args.size === "full" || args.size === "quadrant" ? (args.size as DashboardSize) : undefined;
        const region =
          typeof args.region === "string" ? (args.region as DashboardRegion) : undefined;
        const resultText = onMoveDashboard
          ? onMoveDashboard(reference, size, region)
          : "Nothing to move.";
        log(`← (client) ${resultText}`);
        sendToolResult(callId, resultText);
        return;
      }
      if (name === "start_rehearsal") {
        const scenario = typeof args.scenario === "string" && args.scenario ? args.scenario : "a practice conversation";
        const rehearsalInstructions = [
          "You are now playing a character for a rehearsal, not being Eden the assistant.",
          "The user wants to practice: " + scenario,
          "Fully embody this character - their attitude, likely objections, tone, and manner - realistically and convincingly.",
          "Do not break character, do not offer assistant-style help, do not refer to yourself as Eden, and do not give meta-commentary about the roleplay while it's in progress.",
          "A good rehearsal partner is genuinely a little difficult - raise real objections, push back, don't make it easy - since the whole point is useful practice, not a pushover.",
          "If the user says something like \"end rehearsal\" or \"stop\", call the end_rehearsal tool immediately and return to being yourself.",
        ].join(" ");
        sendSessionUpdate(rehearsalInstructions);
        setIsRehearsing(true);
        setRehearsalScenario(scenario);
        log(`← (client) rehearsal started: ${scenario}`);
        sendToolResult(callId, "Rehearsal started.");
        return;
      }
      if (name === "end_rehearsal") {
        const debriefAddendum =
          " The rehearsal you were just running as a character has just ended. Before moving on to anything else, briefly and constructively reflect out loud on how the user just handled it - one or two honest, specific observations about what worked and what could be sharper - then ask if they'd like to try again or move on.";
        sendSessionUpdate(originalInstructionsRef.current + debriefAddendum);
        setIsRehearsing(false);
        setRehearsalScenario("");
        log("← (client) rehearsal ended");
        sendToolResult(callId, "Rehearsal ended.");
        return;
      }

      let result = "Something went wrong running that.";
      try {
        const res = await fetch("/api/realtime/tool-call", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, arguments: args }),
        });
        const data = await res.json();
        result = data.result ?? data.error ?? result;
      } catch {
        /* keep the default failure message */
      }
      log(`← tool result: ${result}`);

      let spokenResult = result;
      try {
        const parsed = JSON.parse(result);
        if (parsed?.dashboard?.title) {
          const size: DashboardSize = parsed.dashboard.size === "full" ? "full" : "quadrant";
          const requestedRegion = parsed.dashboard.region as DashboardRegion | undefined;
          const actualRegion = onShowDashboard
            ? onShowDashboard(parsed.dashboard, size, requestedRegion)
            : "full";
          spokenResult =
            size === "full" ? "Shown on screen." : "Shown in the " + friendlyRegionName(actualRegion) + ".";
        } else if (parsed?.mindmapResearch?.parent && Array.isArray(parsed.mindmapResearch.nodes)) {
          spokenResult = onAddMindmapResearch
            ? onAddMindmapResearch(parsed.mindmapResearch.parent, parsed.mindmapResearch.nodes)
            : "Research couldn't be added to the map.";
        } else if (parsed?.customGraphic?.title && typeof parsed.customGraphic.svg === "string") {
          // This is the actual security boundary - the SVG text above is
          // untrusted AI output. It only ever gets rendered if it passes
          // the strict allowlist sanitizer; otherwise nothing is shown.
          const cleanSvg = sanitizeSvg(parsed.customGraphic.svg);
          if (!cleanSvg) {
            spokenResult = "I generated something but it wasn't safe to show - try describing it a bit differently.";
          } else {
            const size: DashboardSize = parsed.customGraphic.size === "quadrant" ? "quadrant" : "full";
            const data: DashboardData = { title: parsed.customGraphic.title, customGraphic: cleanSvg };
            const actualRegion = onShowDashboard ? onShowDashboard(data, size) : "full";
            spokenResult =
              size === "full" ? "Shown on screen." : "Shown in the " + friendlyRegionName(actualRegion) + ".";
          }
        }
      } catch {
        /* an ordinary text result, not a special payload */
      }

      sendToolResult(callId, spokenResult);
    },
    [
      log,
      onShowDashboard,
      onDismissDashboard,
      onMoveDashboard,
      getDashboardState,
      onShowSystemStatus,
      onShowEventLog,
      onStartMindmap,
      onAddMindmapIdea,
      onAddMindmapResearch,
      getMindmapStructure,
      onRemoveMindmapNode,
      sendToolResult,
      sendSessionUpdate,
    ]
  );

  const persistTranscript = useCallback(async (role: "user" | "assistant", text: string) => {
    if (!text.trim()) return;
    setTranscript((prev) => [...prev.slice(-19), { role, text }]);
    try {
      const res = await fetch("/api/realtime/transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, text, conversationId: conversationIdRef.current }),
      });
      const data = await res.json();
      if (data.conversationId) conversationIdRef.current = data.conversationId;
    } catch {
      /* saving history is best-effort - never interrupts the live conversation */
    }
  }, []);

  const handleDataChannelMessage = useCallback(
    (raw: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      const type = typeof event.type === "string" ? event.type : "unknown";
      log(type);

      if (type.includes("response.created")) setStatus("speaking");
      if (type === "response.done") setStatus("listening");

      if (type.includes("function_call_arguments")) {
        const callId = String(event.call_id ?? event.item_id ?? "");
        const delta = typeof event.delta === "string" ? event.delta : "";
        const name = typeof event.name === "string" ? event.name : undefined;
        const buf = toolCallBuffers.current.get(callId) ?? { name: name ?? "", args: "" };
        if (name) buf.name = name;
        buf.args += delta;
        toolCallBuffers.current.set(callId, buf);

        if (type.includes("done")) {
          const finished = toolCallBuffers.current.get(callId);
          toolCallBuffers.current.delete(callId);
          if (finished?.name) relayToolCall(callId, finished.name, finished.args);
        }
        return;
      }
      if (type.includes("function_call") && typeof event.name === "string") {
        const callId = String(event.call_id ?? event.item_id ?? crypto.randomUUID());
        const argsJson =
          typeof event.arguments === "string" ? event.arguments : JSON.stringify(event.arguments ?? {});
        relayToolCall(callId, event.name, argsJson);
        return;
      }

      if (type.includes("output_audio_transcript")) {
        const itemId = String(event.item_id ?? "default");
        const delta = typeof event.delta === "string" ? event.delta : "";
        const current = (transcriptBuffers.current.get(`out:${itemId}`) ?? "") + delta;
        transcriptBuffers.current.set(`out:${itemId}`, current);
        if (type.includes("done") || type.includes("completed")) {
          transcriptBuffers.current.delete(`out:${itemId}`);
          persistTranscript("assistant", current);
        }
        return;
      }

      if (type.includes("input_audio_transcript")) {
        const itemId = String(event.item_id ?? "default");
        if (type.includes("delta")) {
          const delta = typeof event.delta === "string" ? event.delta : "";
          const current = (transcriptBuffers.current.get(`in:${itemId}`) ?? "") + delta;
          transcriptBuffers.current.set(`in:${itemId}`, current);
        } else if (type.includes("completed") || type.includes("done")) {
          const finalText =
            typeof event.transcript === "string"
              ? event.transcript
              : transcriptBuffers.current.get(`in:${itemId}`) ?? "";
          transcriptBuffers.current.delete(`in:${itemId}`);
          persistTranscript("user", finalText);
        }
        return;
      }

      if (type === "error") log(`ERROR: ${JSON.stringify(event)}`);
    },
    [log, relayToolCall, persistTranscript, setStatus]
  );

  /**
   * The actual connection sequence - session mint, WebRTC setup, SDP
   * exchange. Shared by the first connection and every automatic
   * reconnect, which is why isReconnect is a parameter rather than
   * something read off state.
   */
  const establishConnection = useCallback(
    async (isReconnect: boolean) => {
      setErrorMessage(null);
      if (!isReconnect) {
        setEventLog([]);
        setTranscript([]);
      }
      setStatus(isReconnect ? "reconnecting" : "connecting");
      setExpanded(true);

      try {
        const sessionRes = await fetch("/api/realtime/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId: conversationIdRef.current }),
        });
        const session = await sessionRes.json();
        if (!sessionRes.ok) {
          throw new Error(session.error ?? "Could not start a voice session.");
        }
        if (typeof session.instructions === "string" && session.instructions) {
          originalInstructionsRef.current = session.instructions;
        }
        setIsRehearsing(false);
        setRehearsalScenario("");
        log(isReconnect ? "reconnecting - session minted" : "session minted");

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.muted = muted;
        audioElRef.current = audioEl;
        pc.ontrack = (e) => {
          const stream = e.streams[0];
          audioEl.srcObject = stream;

          try {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const audioContext = new AudioCtx();
            analysisContextRef.current = audioContext;
            audioContext.resume().catch(() => {});

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);

            const sample = () => {
              analyser.getByteTimeDomainData(data);
              let sumSquares = 0;
              for (let i = 0; i < data.length; i++) {
                const v = (data[i] - 128) / 128;
                sumSquares += v * v;
              }
              const rms = Math.sqrt(sumSquares / data.length);
              if (audioLevelRef) audioLevelRef.current = rms;
              analysisFrameRef.current = requestAnimationFrame(sample);
            };
            sample();
          } catch {
            /* the orb just won't pulse to real audio - everything else still works */
          }
        };

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        pc.addTrack(micStream.getTracks()[0]);

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.addEventListener("message", (e) => handleDataChannelMessage(e.data));
        dc.addEventListener("open", () => {
          log("data channel open");
          reconnectAttemptsRef.current = 0; // a real connection resets the retry count
          setStatus("listening");
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${session.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        });

        if (!sdpResponse.ok) {
          throw new Error(`OpenAI rejected the connection (status ${sdpResponse.status}).`);
        }

        const answerSdp = await sdpResponse.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        log("WebRTC connected");

        pc.onconnectionstatechange = () => {
          log("connection: " + pc.connectionState);
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            handleUnexpectedDisconnectRef.current();
          }
        };
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Couldn't start the voice session.");
        teardownConnection();
      }
    },
    [handleDataChannelMessage, log, muted, setStatus, audioLevelRef, teardownConnection]
  );

  useEffect(() => {
    establishConnectionRef.current = establishConnection;
  }, [establishConnection]);

  /**
   * Fires when the connection drops on its own - never for a deliberate
   * stop, since teardownConnection detaches this handler before closing
   * anything in that path. Retries a few times with a growing delay,
   * carrying conversationIdRef forward so the reconnect's session
   * instructions include what was just being discussed. Gives up after
   * MAX_RECONNECT_ATTEMPTS rather than looping forever against a problem
   * that isn't going to resolve itself (like a dead API key).
   */
  const handleUnexpectedDisconnect = useCallback(() => {
    teardownConnection();

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("error");
      setErrorMessage("Lost the connection and couldn't get it back automatically. Tap to try again.");
      return;
    }

    reconnectAttemptsRef.current += 1;
    const attempt = reconnectAttemptsRef.current;
    setStatus("reconnecting");
    log(`connection dropped - reconnecting (attempt ${attempt} of ${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      establishConnectionRef.current(true);
    }, RECONNECT_DELAY_MS * attempt);
  }, [teardownConnection, setStatus, log]);

  useEffect(() => {
    handleUnexpectedDisconnectRef.current = handleUnexpectedDisconnect;
  }, [handleUnexpectedDisconnect]);

  /** The button's "start" action - a genuinely fresh conversation. */
  const connect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    conversationIdRef.current = null;
    establishConnection(false);
  }, [establishConnection]);

  if (!available) return null;

  const statusLabel: Record<RealtimeStatus, string> = {
    idle: "TALK TO EDEN",
    connecting: "CONNECTING…",
    listening: "LISTENING…",
    speaking: "EDEN IS SPEAKING",
    reconnecting: "RECONNECTING…",
    error: "TRY AGAIN",
  };

  const isIdleOrError = status === "idle" || status === "error";

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2.5">
      {isRehearsing && (
        <div className="flex items-center gap-2 rounded-full bg-yellow-400/15 px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 dot-online" />
          <span className="font-hud text-[10px] tracking-[0.2em] text-yellow-300">
            REHEARSING{rehearsalScenario ? ": " + rehearsalScenario.slice(0, 40) : ""}
          </span>
        </div>
      )}

      <button
        onClick={isIdleOrError ? connect : disconnect}
        className={`flex w-full items-center justify-center gap-3 rounded-full px-6 py-4 font-hud text-[12px] tracking-[0.25em] transition-colors ${
          isIdleOrError
            ? "bg-pulseblue/20 text-pulseblue hover:bg-pulseblue/30"
            : "bg-pulsemagenta/20 text-pulsemagenta"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            status === "listening" || status === "speaking"
              ? "bg-pulsemagenta dot-online"
              : status === "connecting" || status === "reconnecting"
                ? "bg-yellow-400 dot-online"
                : status === "error"
                  ? "bg-red-400"
                  : "bg-pulseblue"
          }`}
        />
        {statusLabel[status]}
      </button>

      {expanded && (
        <div className="hud-panel flex w-full flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-hud text-[10px] tracking-[0.2em] text-dim">VOICE SESSION</span>
            <button
              onClick={() => setExpanded(false)}
              className="font-hud text-[10px] tracking-widest text-dim hover:text-ink"
            >
              HIDE
            </button>
          </div>

          {errorMessage && <p className="text-[12px] text-red-400">{errorMessage}</p>}

          {transcript.length > 0 && (
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto border-t border-white/5 pt-2">
              {transcript.map((line, i) => (
                <p key={i} className="text-[12px] leading-snug text-ink/90">
                  <span className="text-dim">{line.role === "user" ? "You: " : "Eden: "}</span>
                  {line.text}
                </p>
              ))}
            </div>
          )}

          <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto border-t border-white/5 pt-2 font-hud text-[10px] leading-relaxed text-dim/80">
            {eventLog.length === 0 ? (
              <span>Waiting for events…</span>
            ) : (
              eventLog.map((line, i) => <span key={i}>{line}</span>)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
