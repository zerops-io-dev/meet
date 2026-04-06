import { useCallback, useEffect, useRef, useState } from "react";

export interface RecorderState {
  status: "idle" | "recording" | "paused";
  elapsed: number; // seconds
  error: string | null;
}

export interface UseRecorderReturn {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/** Preferred MIME types in order. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime(): string {
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export type AudioSource = "microphone" | "system" | "both";

/**
 * Hook that records audio and emits a Blob every
 * `chunkIntervalMs` milliseconds (default 30 s).
 *
 * Sources:
 * - "microphone": captures mic only (getUserMedia)
 * - "system": captures system/tab audio only (getDisplayMedia)
 * - "both": mixes mic + system audio together (ideal for meetings)
 */
export function useRecorder(
  onChunk: (blob: Blob, chunkIndex: number) => void,
  chunkIntervalMs = 30_000,
  audioSource: AudioSource = "both",
): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>({
    status: "idle",
    elapsed: 0,
    error: null,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIdxRef = useRef(0);
  const startTimeRef = useRef(0);
  const pausedElapsedRef = useRef(0);
  const stateRef = useRef<"idle" | "recording" | "paused">("idle");

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const running = (now - startTimeRef.current) / 1000;
      setState((s) => ({ ...s, elapsed: pausedElapsedRef.current + running }));
    }, 250);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      let finalStream: MediaStream;

      if (audioSource === "microphone") {
        // Mic only
        finalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else if (audioSource === "system") {
        // System audio only — user picks a tab/screen to share
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // required by browser, we'll discard it
          audio: true, // this captures system/tab audio
        });
        // Remove video tracks — we only want audio
        displayStream.getVideoTracks().forEach((t) => t.stop());
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error("No system audio captured. Make sure to check 'Share audio' when selecting a tab.");
        }
        finalStream = new MediaStream(audioTracks);
      } else {
        // Both: mix mic + system audio
        const [micStream, displayStream] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: true }),
          navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          }),
        ]);
        // Remove video tracks
        displayStream.getVideoTracks().forEach((t) => t.stop());
        const systemAudioTracks = displayStream.getAudioTracks();

        if (systemAudioTracks.length === 0) {
          // Fallback to mic only if user didn't share audio
          micStream.getTracks().forEach(() => {}); // keep mic
          finalStream = micStream;
        } else {
          // Mix both streams using AudioContext
          const audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          const micSource = audioCtx.createMediaStreamSource(micStream);
          const sysSource = audioCtx.createMediaStreamSource(new MediaStream(systemAudioTracks));
          micSource.connect(dest);
          sysSource.connect(dest);
          finalStream = dest.stream;

          // Store references for cleanup
          (finalStream as any)._extraStreams = [micStream, displayStream];
          (finalStream as any)._audioCtx = audioCtx;
        }
      }

      streamRef.current = finalStream;

      const mimeType = pickMime();
      const recorder = new MediaRecorder(finalStream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 64_000,
      });
      recorderRef.current = recorder;
      chunkIdxRef.current = 0;
      pausedElapsedRef.current = 0;

      // Collect all data for the current segment
      let segmentBlobs: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          segmentBlobs.push(e.data);
        }
      };

      recorder.onstop = () => {
        // When recorder stops (either manually or via restart), emit the complete chunk
        if (segmentBlobs.length > 0) {
          const completeChunk = new Blob(segmentBlobs, { type: recorder.mimeType || "audio/webm" });
          onChunk(completeChunk, chunkIdxRef.current);
          chunkIdxRef.current += 1;
          segmentBlobs = [];
        }

        // Auto-restart if still in recording state (chunk rotation)
        if (streamRef.current && stateRef.current === "recording") {
          const newRecorder = new MediaRecorder(streamRef.current, {
            mimeType: mimeType || undefined,
            audioBitsPerSecond: 64_000,
          });
          recorderRef.current = newRecorder;
          segmentBlobs = [];
          
          newRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) segmentBlobs.push(e.data);
          };
          newRecorder.onstop = recorder.onstop;
          newRecorder.onerror = recorder.onerror;
          newRecorder.start();
          
          // Schedule next stop
          setTimeout(() => {
            if (newRecorder.state === "recording") newRecorder.stop();
          }, chunkIntervalMs);
        }
      };

      recorder.onerror = () => {
        setState((s) => ({ ...s, status: "idle", error: "Recording error" }));
        stopTimer();
      };

      // Start recording — will stop after chunkIntervalMs to create a complete file
      recorder.start();
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, chunkIntervalMs);
      
      stateRef.current = "recording";
      setState({ status: "recording", elapsed: 0, error: null });
      startTimer();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Audio access denied";
      stateRef.current = "idle";
      setState({ status: "idle", elapsed: 0, error: msg });
    }
  }, [onChunk, chunkIntervalMs, audioSource, startTimer, stopTimer]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      // Clean up extra streams from "both" mode
      const extras = (stream as any)._extraStreams as MediaStream[] | undefined;
      extras?.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      const audioCtx = (stream as any)._audioCtx as AudioContext | undefined;
      audioCtx?.close();
    }
    stateRef.current = "idle";
    stopTimer();
    setState((s) => ({ ...s, status: "idle" }));
  }, [stopTimer]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.pause();
      pausedElapsedRef.current += (Date.now() - startTimeRef.current) / 1000;
      stopTimer();
      setState((s) => ({ ...s, status: "paused" }));
    }
  }, [stopTimer]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "paused") {
      recorder.resume();
      startTimer();
      setState((s) => ({ ...s, status: "recording" }));
    }
  }, [startTimer]);

  return { state, start, stop, pause, resume };
}
