"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RealtimeStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

/**
 * Real-time voice-to-voice — Eden's primary interface. Connects the
 * browser directly to OpenAI over WebRTC — audio never touches Eden's
 * own server, which is the entire reason this feels fast. Eden's server
 * is only involved for: minting the session token (/api/realtime/session),
 * running any tool call the model requests (/api/realtime/tool-call), and
 * saving transcripts (/api/realtime/transcript).
 *
 * IMPORTANT — read this before assuming something's broken:
 * The exact event names OpenAI's GA Realtime API uses for tool calls and
 * transcripts weren't fully confirmable without a live session (see
 * docs/REALTIME-VOICE-ARCHITECTURE.md). This component matches events by
 * pattern ("contains 'function_call'", "contains 'transcript'") rather
 * than one exact string, specifically so it has the best chance of
 * working even if the precise name differs from what's guessed here. The
 * raw event log below is the ground truth — if a tool call or transcript
 * doesn't behave right, that log shows the actual event type name OpenAI
 * sent, which is exactly what's needed to fix it precisely.
 */
export default function RealtimeVoice({
  available,
  muted = false,
  onStatusChange,
  audioLevelRef,
  onShowDashboard,
}: {
  available: boolean;
  muted?: boolean;
  onStatusChange?: (status: RealtimeStatus) => void;
  /** Written to continuously with the current output audio level, so the
   *  orb (or anything else) can move in sync with the actual sound. */
  audioLevelRef?: { current: number };
  /** Fired when the show_dashboard tool is called — the tool's own result
   *  IS the dashboard payload, passed straight through untouched. */
  onShowDashboard?: (data: { title: string; summary?: string; items?: Array<{ title: string; detail?: string; url?: string }> }) => void;
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
  const toolCallBuffers = useRef<Map<string, { name: string; args: string }>>(new Map());
  const transcriptBuffers = useRef<Map<string, string>>(new Map());
  const analysisContextRef = useRef<AudioContext | null>(null);
  const analysisFrameRef = useRef<number | null>(null);

  const setStatus = useCallback(
    (next: RealtimeStatus) => {
      setStatusState(next);
      onStatusChange?.(next);
    },
    [onStatusChange]
  );

  // Keep the shared mute toggle meaningful for voice mode too — it has
  // its own audio element, separate from the old text-reply player.
  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = muted;
  }, [muted]);

  const log = useCallback((line: string) => {
    setEventLog((prev) => [...prev.slice(-59), line]);
  }, []);

  const disconnect = useCallback(() => {
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
    setStatus("idle");
  }, [setStatus, audioLevelRef]);

  useEffect(() => disconnect, [disconnect]); // clean up if the page navigates away mid-call

  const relayToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsJson || "{}");
      } catch {
        /* malformed arguments — the executor below still runs, just with nothing */
      }

      log(`→ tool: ${name}(${argsJson})`);
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

      // show_dashboard's result is a JSON payload meant for the screen, not
      // the model's ears — detect it, hand it to the UI, and tell the model
      // something short and natural instead of reading raw JSON back to it.
      let spokenResult = result;
      try {
        const parsed = JSON.parse(result);
        if (parsed?.dashboard?.title) {
          onShowDashboard?.(parsed.dashboard);
          spokenResult = "Shown on screen.";
        }
      } catch {
        /* an ordinary text result, not a dashboard payload — nothing to do */
      }

      const dc = dcRef.current;
      if (dc && dc.readyState === "open") {
        dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify({ result: spokenResult }),
            },
          })
        );
        dc.send(JSON.stringify({ type: "response.create" }));
      }
    },
    [log, onShowDashboard]
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
      /* saving history is best-effort — never interrupts the live conversation */
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

      // Tool calls — pattern-matched, see the note at the top of this file.
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

      // Eden's own spoken output, transcribed.
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

      // What the person said, transcribed.
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

  const connect = useCallback(async () => {
    setErrorMessage(null);
    setEventLog([]);
    setTranscript([]);
    setStatus("connecting");
    setExpanded(true);

    try {
      const sessionRes = await fetch("/api/realtime/session", { method: "POST" });
      const session = await sessionRes.json();
      if (!sessionRes.ok) {
        throw new Error(session.error ?? "Could not start a voice session.");
      }
      log("session minted");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.muted = muted;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        audioEl.srcObject = stream;

        // Analyse the actual output audio so the orb (or anything else)
        // can move with real sound rather than a fixed, synthetic rhythm.
        // Purely visual — if this fails for any reason, playback is
        // completely unaffected.
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
          /* the orb just won't pulse to real audio — everything else still works */
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
        setStatus("listening");
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // GA endpoint. No "?model=" query param here — the ephemeral token
      // from /api/realtime/session already carries the model; adding the
      // query param causes OpenAI to reject the request.
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
        log(`connection: ${pc.connectionState}`);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setStatus("error");
          setErrorMessage("The voice connection dropped.");
        }
      };
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Couldn't start the voice session.");
      disconnect();
    }
  }, [handleDataChannelMessage, log, disconnect, muted, setStatus, audioLevelRef]);

  if (!available) return null;

  const statusLabel: Record<RealtimeStatus, string> = {
    idle: "TALK TO EDEN",
    connecting: "CONNECTING…",
    listening: "LISTENING…",
    speaking: "EDEN IS SPEAKING",
    error: "TRY AGAIN",
  };

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2.5">
      <button
        onClick={status === "idle" || status === "error" ? connect : disconnect}
        className={`flex w-full items-center justify-center gap-3 rounded-full px-6 py-4 font-hud text-[12px] tracking-[0.25em] transition-colors ${
          status === "idle" || status === "error"
            ? "bg-pulseblue/20 text-pulseblue hover:bg-pulseblue/30"
            : "bg-pulsemagenta/20 text-pulsemagenta"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            status === "listening" || status === "speaking"
              ? "bg-pulsemagenta dot-online"
              : status === "connecting"
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
