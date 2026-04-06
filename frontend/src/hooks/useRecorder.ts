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

/**
 * Hook that records audio from the microphone and emits a Blob every
 * `chunkIntervalMs` milliseconds (default 30 s).
 */
export function useRecorder(
  onChunk: (blob: Blob, chunkIndex: number) => void,
  chunkIntervalMs = 30_000,
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMime();
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 64_000,
      });
      recorderRef.current = recorder;
      chunkIdxRef.current = 0;
      pausedElapsedRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          onChunk(e.data, chunkIdxRef.current);
          chunkIdxRef.current += 1;
        }
      };

      recorder.onerror = () => {
        setState((s) => ({ ...s, status: "idle", error: "Recording error" }));
        stopTimer();
      };

      recorder.start(chunkIntervalMs);
      setState({ status: "recording", elapsed: 0, error: null });
      startTimer();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone access denied";
      setState({ status: "idle", elapsed: 0, error: msg });
    }
  }, [onChunk, chunkIntervalMs, startTimer, stopTimer]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
