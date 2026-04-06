import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import type { BulletBlock as BulletBlockType } from "../hooks/useMeetingAI";

interface Props {
  block: BulletBlockType;
  index: number;
}

export default function BulletBlock({ block, index }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors"
      >
        <ListChecks className="w-4 h-4 text-accent-500 flex-shrink-0" />
        <span className="text-sm font-medium text-slate-300 flex-1 text-left">
          Block {index + 1}
        </span>
        <span className="text-xs text-slate-500 font-mono">
          {block.coversFrom} – {block.coversTo}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <ul className="space-y-2">
            {block.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-accent-500 mt-1 flex-shrink-0">•</span>
                <span className="leading-relaxed">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
