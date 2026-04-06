import { useState } from "react";
import { X, Settings } from "lucide-react";
import type { MeetingSettings } from "../hooks/useMeetingAI";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: MeetingSettings;
  onSave: (settings: MeetingSettings) => void;
}

export default function SettingsModal({
  open,
  onClose,
  settings,
  onSave,
}: Props) {
  const [local, setLocal] = useState<MeetingSettings>(settings);

  if (!open) return null;

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-sm glass-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent-500" />
            <h2 className="font-medium text-slate-200">Settings</h2>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Block size */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Summary block size
          </label>
          <div className="flex gap-2">
            {[6, 12].map((n) => (
              <button
                key={n}
                onClick={() => setLocal({ ...local, blockSize: n })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    local.blockSize === n
                      ? "bg-accent-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
              >
                {n} chunks ({n * 30 / 60} min)
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            How many 30-second chunks before generating a bullet summary
          </p>
        </div>

        {/* Language */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Language
          </label>
          <select
            value={local.language}
            onChange={(e) =>
              setLocal({
                ...local,
                language: e.target.value as "auto" | "en" | "es",
              })
            }
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
              text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
          >
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        {/* Worker URL (dev) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Worker URL
          </label>
          <input
            type="text"
            value={local.workerUrl}
            onChange={(e) => setLocal({ ...local, workerUrl: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
              text-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/50"
          />
          <p className="text-xs text-slate-500 mt-1">
            API endpoint for transcription and summarization
          </p>
        </div>

        {/* Save */}
        <button onClick={handleSave} className="btn-primary w-full">
          Save Settings
        </button>
      </div>
    </div>
  );
}
