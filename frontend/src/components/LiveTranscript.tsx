import { useEffect, useRef } from "react";
import { Languages, Clock } from "lucide-react";
import type { TranscriptChunk } from "../hooks/useMeetingAI";

interface Props {
  chunks: TranscriptChunk[];
  processing: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LiveTranscript({ chunks, processing }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks.length]);

  if (chunks.length === 0 && !processing) {
    return (
      <div className="glass-card p-6 text-center text-slate-500">
        <p className="text-sm">Transcript will appear here as you record...</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Live Transcript</h3>
        <span className="text-xs text-slate-500">
          {chunks.length} segment{chunks.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto p-4 space-y-3">
        {chunks.map((chunk) => (
          <div key={chunk.index} className="group flex gap-3">
            {/* Timestamp gutter */}
            <div className="flex-shrink-0 pt-0.5">
              <span className="flex items-center gap-1 text-xs text-slate-600 font-mono">
                <Clock className="w-3 h-3" />
                {formatTime(chunk.startSec)}
              </span>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300 leading-relaxed">
                {chunk.text}
              </p>
              <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 uppercase tracking-wider">
                  <Languages className="w-3 h-3" />
                  {chunk.language}
                </span>
                <span className="text-[10px] text-slate-700">
                  {chunk.timestamp}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Processing indicator */}
        {processing && (
          <div className="flex items-center gap-2 text-sm text-accent-400">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
            <span>Transcribing...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
