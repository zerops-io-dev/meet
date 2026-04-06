import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptChunk {
  index: number;
  text: string;
  language: string;
  timestamp: string; // HH:MM:SS when chunk was received
  startSec: number; // approximate start second in the meeting
}

export interface BulletBlock {
  id: string;
  bullets: string[];
  coversFrom: string; // e.g. "0:00"
  coversTo: string; // e.g. "6:00"
  chunkRange: [number, number];
}

export interface FinalSummaryData {
  executive: string;
  decisions: string[];
  actionItems: string[];
}

export interface MeetingAIState {
  chunks: TranscriptChunk[];
  bulletBlocks: BulletBlock[];
  finalSummary: FinalSummaryData | null;
  processing: boolean;
  error: string | null;
}

export interface MeetingSettings {
  blockSize: number; // chunks per bullet block (6 or 12)
  language: "auto" | "en" | "es";
  workerUrl: string;
}

const DEFAULT_SETTINGS: MeetingSettings = {
  blockSize: 6,
  language: "auto",
  workerUrl: import.meta.env.DEV ? "/api" : "https://zerops-meet-api.lucas-i-carrizo.workers.dev",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function nowTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

let _uid = 0;
function uid(): string {
  return `bb-${++_uid}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Mock helpers for development
// ---------------------------------------------------------------------------

async function mockTranscribe(
  _blob: Blob,
  _lang: string,
): Promise<{ text: string; language: string }> {
  await new Promise((r) => setTimeout(r, 800));
  const samples = [
    "We need to finalize the Q4 roadmap by end of week. The team has been making good progress on the infrastructure migration.",
    "I think we should prioritize the authentication refactor. It's blocking three other teams right now.",
    "The customer feedback from last sprint was very positive. They especially liked the new dashboard features.",
    "Let's schedule a follow-up meeting with the design team. We need their input on the mobile layout.",
    "Action item: Sarah will prepare the cost analysis by Thursday. Mark will handle the vendor negotiations.",
    "The deployment pipeline is now fully automated. We reduced deploy time from 45 minutes to under 8 minutes.",
  ];
  return {
    text: samples[Math.floor(Math.random() * samples.length)]!,
    language: "en",
  };
}

async function mockSummarize(
  _text: string,
  _lang: string,
): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 600));
  return [
    "Team discussed Q4 roadmap priorities and timeline",
    "Authentication refactor identified as critical blocker",
    "Positive customer feedback on dashboard features noted",
    "Follow-up with design team scheduled for mobile layout review",
  ];
}

async function mockFinalize(
  _blocks: BulletBlock[],
  _lang: string,
): Promise<FinalSummaryData> {
  await new Promise((r) => setTimeout(r, 1000));
  return {
    executive:
      "The team reviewed Q4 priorities, focusing on infrastructure migration and authentication refactoring. Customer feedback was positive, particularly regarding new dashboard features. Key blockers were identified and assigned to team members with clear deadlines.",
    decisions: [
      "Prioritize authentication refactor over new feature development",
      "Adopt automated deployment pipeline for all services",
      "Schedule weekly design sync for mobile layout",
    ],
    actionItems: [
      "Sarah: Prepare cost analysis by Thursday",
      "Mark: Handle vendor negotiations this week",
      "Team: Finalize Q4 roadmap by Friday EOD",
    ],
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMeetingAI(settings?: Partial<MeetingSettings>) {
  const config: MeetingSettings = { ...DEFAULT_SETTINGS, ...settings };

  const [state, setState] = useState<MeetingAIState>({
    chunks: [],
    bulletBlocks: [],
    finalSummary: null,
    processing: false,
    error: null,
  });

  const chunksRef = useRef<TranscriptChunk[]>([]);
  const pendingChunksRef = useRef<TranscriptChunk[]>([]);
  const bulletBlocksRef = useRef<BulletBlock[]>([]);
  const chunkIntervalSec = 30;

  // ---- Transcribe a single audio chunk ----
  const transcribeChunk = useCallback(
    async (blob: Blob, chunkIndex: number) => {
      setState((s) => ({ ...s, processing: true, error: null }));

      try {
        let result: { text: string; language: string };

        if (import.meta.env.DEV && !config.workerUrl.startsWith("http")) {
          result = await mockTranscribe(blob, config.language);
        } else {
          const form = new FormData();
          form.append("file", blob, `chunk-${chunkIndex}.webm`);
          if (config.language !== "auto") {
            form.append("language", config.language);
          }

          const res = await fetch(`${config.workerUrl}/transcribe`, {
            method: "POST",
            body: form,
          });

          if (!res.ok) {
            throw new Error(`Transcription failed: ${res.status}`);
          }
          result = (await res.json()) as { text: string; language: string };
        }

        const chunk: TranscriptChunk = {
          index: chunkIndex,
          text: result.text,
          language: result.language,
          timestamp: nowTimestamp(),
          startSec: chunkIndex * chunkIntervalSec,
        };

        chunksRef.current = [...chunksRef.current, chunk];
        pendingChunksRef.current = [...pendingChunksRef.current, chunk];

        setState((s) => ({
          ...s,
          chunks: chunksRef.current,
          processing: false,
        }));

        // Check if we should generate a bullet block
        if (pendingChunksRef.current.length >= config.blockSize) {
          await generateBulletBlock(pendingChunksRef.current);
          pendingChunksRef.current = [];
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcription error";
        setState((s) => ({ ...s, processing: false, error: msg }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.workerUrl, config.language, config.blockSize],
  );

  // ---- Generate bullet block from accumulated chunks ----
  const generateBulletBlock = useCallback(
    async (chunks: TranscriptChunk[]) => {
      if (chunks.length === 0) return;

      const joinedText = chunks.map((c) => c.text).join("\n\n");
      const firstChunk = chunks[0]!;
      const lastChunk = chunks[chunks.length - 1]!;

      try {
        let bullets: string[];

        if (import.meta.env.DEV && !config.workerUrl.startsWith("http")) {
          bullets = await mockSummarize(joinedText, config.language);
        } else {
          const res = await fetch(`${config.workerUrl}/summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: joinedText,
              language: config.language === "auto" ? firstChunk.language : config.language,
            }),
          });

          if (!res.ok) throw new Error(`Summarize failed: ${res.status}`);
          const data = (await res.json()) as { bullets: string[] };
          bullets = data.bullets;
        }

        const block: BulletBlock = {
          id: uid(),
          bullets,
          coversFrom: formatTime(firstChunk.startSec),
          coversTo: formatTime(lastChunk.startSec + chunkIntervalSec),
          chunkRange: [firstChunk.index, lastChunk.index],
        };

        bulletBlocksRef.current = [...bulletBlocksRef.current, block];
        setState((s) => ({ ...s, bulletBlocks: bulletBlocksRef.current }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Summary error";
        setState((s) => ({ ...s, error: msg }));
      }
    },
    [config.workerUrl, config.language],
  );

  // ---- Generate final summary ----
  const generateFinalSummary = useCallback(async () => {
    // First, summarize any remaining pending chunks
    if (pendingChunksRef.current.length > 0) {
      await generateBulletBlock(pendingChunksRef.current);
      pendingChunksRef.current = [];
    }

    const blocks = bulletBlocksRef.current;
    if (blocks.length === 0 && chunksRef.current.length === 0) return;

    setState((s) => ({ ...s, processing: true, error: null }));

    try {
      let summary: FinalSummaryData;

      if (import.meta.env.DEV && !config.workerUrl.startsWith("http")) {
        summary = await mockFinalize(blocks, config.language);
      } else {
        const res = await fetch(`${config.workerUrl}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bulletBlocks: blocks.map((b) => ({
              range: `${b.coversFrom} - ${b.coversTo}`,
              bullets: b.bullets,
            })),
            fullTranscript: chunksRef.current.map((c) => c.text).join("\n\n"),
            language: config.language === "auto"
              ? (chunksRef.current[0]?.language ?? "en")
              : config.language,
          }),
        });

        if (!res.ok) throw new Error(`Finalize failed: ${res.status}`);
        summary = (await res.json()) as FinalSummaryData;
      }

      setState((s) => ({ ...s, finalSummary: summary, processing: false }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Finalize error";
      setState((s) => ({ ...s, processing: false, error: msg }));
    }
  }, [config.workerUrl, config.language, generateBulletBlock]);

  // ---- Reset state for a new meeting ----
  const reset = useCallback(() => {
    chunksRef.current = [];
    pendingChunksRef.current = [];
    bulletBlocksRef.current = [];
    _uid = 0;
    setState({
      chunks: [],
      bulletBlocks: [],
      finalSummary: null,
      processing: false,
      error: null,
    });
  }, []);

  return {
    state,
    transcribeChunk,
    generateFinalSummary,
    reset,
  };
}
