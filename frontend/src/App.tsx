import { useCallback, useState } from "react";
import { History, Settings, Globe } from "lucide-react";
import { useRecorder, type AudioSource } from "./hooks/useRecorder";
import { useMeetingAI } from "./hooks/useMeetingAI";
import type { MeetingSettings } from "./hooks/useMeetingAI";
import RecordButton from "./components/RecordButton";
import AudioVisualizer from "./components/AudioVisualizer";
import LiveTranscript from "./components/LiveTranscript";
import BulletBlock from "./components/BulletBlock";
import FinalSummary from "./components/FinalSummary";
import MeetingHistory, {
  addMeetingToHistory,
} from "./components/MeetingHistory";
import SettingsModal from "./components/SettingsModal";

const DEFAULT_SETTINGS: MeetingSettings = {
  blockSize: 6,
  language: "auto" as const,
  workerUrl: import.meta.env.DEV ? "/api" : "https://zerops-meet-api.lucas-i-carrizo.workers.dev",
};

export default function App() {
  const [settings, setSettings] = useState<MeetingSettings>(DEFAULT_SETTINGS);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lang, setLang] = useState<"en" | "es">("en");

  const { state: aiState, transcribeChunk, generateFinalSummary, reset } =
    useMeetingAI(settings);

  const onChunk = useCallback(
    (blob: Blob, idx: number) => {
      transcribeChunk(blob, idx);
    },
    [transcribeChunk],
  );

  const [audioSource, setAudioSource] = useState<AudioSource>("both");
  const recorder = useRecorder(onChunk, 30_000, audioSource);

  const handleStop = useCallback(async () => {
    recorder.stop();
    await generateFinalSummary();

    // Save to history if we have a summary
    if (aiState.finalSummary || aiState.chunks.length > 0) {
      addMeetingToHistory({
        id: `m-${Date.now()}`,
        title: `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        date: new Date().toISOString(),
        durationSec: recorder.state.elapsed,
        summary: aiState.finalSummary ?? {
          executive: "Meeting ended before summary could be generated.",
          decisions: [],
          actionItems: [],
        },
        chunkCount: aiState.chunks.length,
      });
    }
  }, [recorder, generateFinalSummary, aiState]);

  const handleNewMeeting = () => {
    reset();
  };

  const t = {
    en: {
      title: "Zerops Meet",
      subtitle: "AI-powered meeting transcription & summarization",
      newMeeting: "New Meeting",
      bulletSummaries: "Bullet Summaries",
      noBullets: "Bullet summaries will appear as the meeting progresses...",
    },
    es: {
      title: "Zerops Meet",
      subtitle: "Transcripción y resumen de reuniones con IA",
      newMeeting: "Nueva Reunión",
      bulletSummaries: "Resúmenes",
      noBullets: "Los resúmenes aparecerán a medida que avance la reunión...",
    },
  }[lang];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center">
              <svg
                viewBox="0 0 32 32"
                className="w-5 h-5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M16 8a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z"
                  fill="white"
                />
                <path
                  d="M11 15a5 5 0 0 0 10 0"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="16"
                  y1="20"
                  x2="16"
                  y2="24"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100">
                {t.title}
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              className="btn-ghost flex items-center gap-1.5 text-xs"
            >
              <Globe className="w-3.5 h-3.5" />
              {lang.toUpperCase()}
            </button>

            {/* History */}
            <button
              onClick={() => setShowHistory(true)}
              className="btn-ghost"
              aria-label="Meeting history"
            >
              <History className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="btn-ghost"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column: Record + Transcript */}
          <div className="lg:col-span-3 space-y-6">
            {/* Record controls */}
            <div className="glass-card p-8 flex flex-col items-center">
              {/* Audio source selector */}
              {recorder.state.status === "idle" && (
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-xs text-gray-400 mr-2">Audio:</span>
                  {([
                    { key: "microphone" as AudioSource, label: "Mic", icon: "🎙️" },
                    { key: "system" as AudioSource, label: "System", icon: "🖥️" },
                    { key: "both" as AudioSource, label: "Both", icon: "🎙️+🖥️" },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setAudioSource(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        audioSource === opt.key
                          ? "bg-accent-500 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              )}
              <RecordButton
                state={recorder.state}
                onStart={recorder.start}
                onStop={handleStop}
                onPause={recorder.pause}
                onResume={recorder.resume}
              />

              <AudioVisualizer
                stream={recorder.stream}
                isActive={recorder.state.status === "recording" || recorder.state.status === "paused"}
                isPaused={recorder.state.status === "paused"}
              />

              {/* New meeting button (when idle with data) */}
              {recorder.state.status === "idle" &&
                aiState.chunks.length > 0 && (
                  <button
                    onClick={handleNewMeeting}
                    className="mt-4 text-sm text-accent-400 hover:text-accent-300 transition-colors"
                  >
                    {t.newMeeting}
                  </button>
                )}
            </div>

            {/* Live transcript */}
            <LiveTranscript
              chunks={aiState.chunks}
              processing={aiState.processing}
            />

            {/* Error banner */}
            {aiState.error && (
              <div className="glass-card border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                {aiState.error}
              </div>
            )}
          </div>

          {/* Right column: Bullets + Summary */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bullet blocks */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                {t.bulletSummaries}
              </h3>
              {aiState.bulletBlocks.length > 0 ? (
                <div className="space-y-3">
                  {aiState.bulletBlocks.map((block, i) => (
                    <BulletBlock key={block.id} block={block} index={i} />
                  ))}
                </div>
              ) : (
                <div className="glass-card p-4 text-center text-sm text-slate-500">
                  {t.noBullets}
                </div>
              )}
            </div>

            {/* Final summary */}
            {aiState.finalSummary && (
              <FinalSummary summary={aiState.finalSummary} />
            )}

            {/* Processing indicator for final summary */}
            {aiState.processing &&
              recorder.state.status === "idle" &&
              !aiState.finalSummary && (
                <div className="glass-card p-6 text-center">
                  <div className="flex justify-center gap-1 mb-2">
                    <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                  <p className="text-sm text-slate-400">
                    Generating meeting summary...
                  </p>
                </div>
              )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-4">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-600">
          Zerops Meet — Audio is processed securely and never stored.
        </div>
      </footer>

      {/* Modals */}
      <MeetingHistory
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
}
