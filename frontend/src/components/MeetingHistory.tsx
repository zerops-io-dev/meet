import { useEffect, useState } from "react";
import {
  History,
  Trash2,
  ChevronRight,
  Calendar,
  Clock,
  X,
} from "lucide-react";
import type { FinalSummaryData } from "../hooks/useMeetingAI";

// ---------------------------------------------------------------------------
// Types & Storage
// ---------------------------------------------------------------------------

export interface MeetingRecord {
  id: string;
  title: string;
  date: string; // ISO string
  durationSec: number;
  summary: FinalSummaryData;
  chunkCount: number;
}

const STORAGE_KEY = "zerops-meet-history";

function loadHistory(): MeetingRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MeetingRecord[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(records: MeetingRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function addMeetingToHistory(record: MeetingRecord) {
  const history = loadHistory();
  history.unshift(record);
  // Keep last 50
  saveHistory(history.slice(0, 50));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MeetingHistory({ open, onClose }: Props) {
  const [records, setRecords] = useState<MeetingRecord[]>([]);
  const [selected, setSelected] = useState<MeetingRecord | null>(null);

  useEffect(() => {
    if (open) setRecords(loadHistory());
  }, [open]);

  const handleDelete = (id: string) => {
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    saveHistory(updated);
    if (selected?.id === id) setSelected(null);
  };

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    return `${m} min`;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-slate-900 border-l border-slate-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent-500" />
            <h2 className="font-medium text-slate-200">Meeting History</h2>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {records.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No meetings recorded yet.
            </div>
          ) : selected ? (
            /* Detail view */
            <div className="p-4 space-y-4">
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1"
              >
                ← Back to list
              </button>
              <h3 className="font-medium text-slate-200">{selected.title}</h3>
              <div className="text-xs text-slate-500 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(selected.date).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(selected.durationSec)}
                </span>
              </div>

              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Summary
                  </h4>
                  <p className="leading-relaxed">{selected.summary.executive}</p>
                </div>
                {selected.summary.decisions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Decisions
                    </h4>
                    <ul className="space-y-1">
                      {selected.summary.decisions.map((d, i) => (
                        <li key={i}>→ {d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.summary.actionItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Action Items
                    </h4>
                    <ul className="space-y-1">
                      {selected.summary.actionItems.map((a, i) => (
                        <li key={i}>☐ {a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* List view */
            <div className="divide-y divide-slate-800/50">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors"
                >
                  <button
                    onClick={() => setSelected(record)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm text-slate-300 truncate">
                      {record.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(record.date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(record.durationSec)}
                      </span>
                    </div>
                  </button>

                  <ChevronRight
                    className="w-4 h-4 text-slate-600 flex-shrink-0 cursor-pointer"
                    onClick={() => setSelected(record)}
                  />

                  <button
                    onClick={() => handleDelete(record.id)}
                    className="flex-shrink-0 p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                    aria-label="Delete meeting"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
