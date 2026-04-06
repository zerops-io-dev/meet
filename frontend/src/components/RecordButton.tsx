import { Mic, MicOff, Pause, Play, Square } from "lucide-react";
import type { RecorderState } from "../hooks/useRecorder";

interface Props {
  state: RecorderState;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function RecordButton({
  state,
  onStart,
  onStop,
  onPause,
  onResume,
}: Props) {
  const isRecording = state.status === "recording";
  const isPaused = state.status === "paused";
  const isActive = isRecording || isPaused;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main record button */}
      <div className="relative">
        {/* Pulse ring */}
        {isRecording && (
          <div className="absolute inset-0 rounded-full bg-red-500/20 animate-pulse-record" />
        )}

        <button
          onClick={isActive ? onStop : onStart}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-200 shadow-lg
            ${
              isRecording
                ? "bg-red-600 hover:bg-red-500 shadow-red-500/25"
                : isPaused
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-500/25"
                  : "bg-slate-700 hover:bg-accent-600 hover:shadow-accent-500/25"
            }`}
          aria-label={isActive ? "Stop recording" : "Start recording"}
        >
          {isActive ? (
            <Square className="w-7 h-7 text-white fill-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </button>
      </div>

      {/* Timer */}
      {isActive && (
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl text-slate-200 tabular-nums">
            {formatTimer(state.elapsed)}
          </span>

          {/* Pause / Resume */}
          <button
            onClick={isPaused ? onResume : onPause}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700
              flex items-center justify-center transition-colors"
            aria-label={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? (
              <Play className="w-4 h-4 text-slate-300 ml-0.5" />
            ) : (
              <Pause className="w-4 h-4 text-slate-300" />
            )}
          </button>
        </div>
      )}

      {/* Idle hint */}
      {state.status === "idle" && !state.error && (
        <p className="text-sm text-slate-500">Click to start recording</p>
      )}

      {/* Error */}
      {state.error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <MicOff className="w-4 h-4" />
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
}
