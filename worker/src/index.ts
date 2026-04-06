import { Hono } from "hono";
import { cors } from "hono/cors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Env {
  WHISPER_URL: string;
  WHISPER_API_KEY: string;
  CLAUDE_MODEL: string;
  ALLOWED_ORIGIN: string;
  ANTHROPIC_API_KEY: string;
}

interface WhisperResponse {
  text: string;
  segments: { start: number; end: number; text: string }[];
  language: string;
  language_probability: number;
  duration: number;
  processing_time: number;
}

interface SummarizeRequest {
  text: string;
  language: string;
}

interface FinalizeRequest {
  bulletBlocks: { range: string; bullets: string[] }[];
  fullTranscript: string;
  language: string;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function bulletPrompt(text: string, language: string): string {
  return `Extract 3 to 5 bullet points from this meeting segment. Be concise and capture the key points discussed. Language: ${language}.

${text}`;
}

function finalPrompt(
  blocks: { range: string; bullets: string[] }[],
  transcript: string,
  language: string,
): string {
  const blockText = blocks
    .map(
      (b) =>
        `[${b.range}]\n${b.bullets.map((bullet) => `• ${bullet}`).join("\n")}`,
    )
    .join("\n\n");

  return `You are given bullet-point blocks from different segments of a meeting, plus the full transcript for context.

Produce in ${language}:
1) A 3-5 sentence executive summary.
2) Key decisions made (list each one).
3) Action items with owner if mentioned (list each one).

Respond in this exact JSON format:
{
  "executive": "...",
  "decisions": ["...", "..."],
  "actionItems": ["...", "..."]
}

BULLET BLOCKS:
${blockText}

FULL TRANSCRIPT:
${transcript}`;
}

// ---------------------------------------------------------------------------
// Claude API helper
// ---------------------------------------------------------------------------

async function callClaude(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };

  const textBlock = data.content.find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text in Claude response");
  return textBlock.text;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGIN;
      // Allow configured origin + localhost for dev
      if (
        origin === allowed ||
        origin?.startsWith("http://localhost") ||
        origin?.startsWith("http://127.0.0.1")
      ) {
        return origin;
      }
      return allowed;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    whisperUrl: c.env.WHISPER_URL,
    model: c.env.CLAUDE_MODEL,
  });
});

// ---------------------------------------------------------------------------
// POST /transcribe — forward audio to Whisper
// ---------------------------------------------------------------------------
app.post("/transcribe", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  const language = formData.get("language");

  if (!file || typeof file === "string") {
    return c.json({ error: "Missing audio file" }, 400);
  }

  try {
    // Build form for Whisper
    const whisperForm = new FormData();
    whisperForm.append("file", file, (file as unknown as { name: string }).name || "audio.webm");
    if (language && typeof language === "string") {
      whisperForm.append("language", language);
    }

    const whisperRes = await fetch(
      `${c.env.WHISPER_URL}/transcribe`,
      {
        method: "POST",
        headers: { "x-api-key": c.env.WHISPER_API_KEY },
        body: whisperForm,
      },
    );

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      return c.json(
        {
          error: "Whisper transcription failed",
          detail: errText,
          status: whisperRes.status,
        },
        502,
      );
    }

    const result = (await whisperRes.json()) as WhisperResponse;

    return c.json({
      text: result.text,
      language: result.language,
      segments: result.segments,
      duration: result.duration,
      processingTime: result.processing_time,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Transcription proxy error", detail: msg }, 502);
  }
});

// ---------------------------------------------------------------------------
// POST /summarize — generate bullet points from text
// ---------------------------------------------------------------------------
app.post("/summarize", async (c) => {
  const body = (await c.req.json()) as SummarizeRequest;

  if (!body.text) {
    return c.json({ error: "Missing text field" }, 400);
  }

  try {
    const prompt = bulletPrompt(body.text, body.language || "en");
    const raw = await callClaude(prompt, c.env.ANTHROPIC_API_KEY, c.env.CLAUDE_MODEL);

    // Parse bullets from response — each line starting with - or • or *
    const bullets = raw
      .split("\n")
      .map((line) => line.replace(/^[\s]*[-•*]\s*/, "").trim())
      .filter((line) => line.length > 0);

    return c.json({ bullets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Summarization failed", detail: msg }, 502);
  }
});

// ---------------------------------------------------------------------------
// POST /finalize — generate final meeting summary
// ---------------------------------------------------------------------------
app.post("/finalize", async (c) => {
  const body = (await c.req.json()) as FinalizeRequest;

  if (!body.bulletBlocks && !body.fullTranscript) {
    return c.json({ error: "Missing bulletBlocks or fullTranscript" }, 400);
  }

  try {
    const prompt = finalPrompt(
      body.bulletBlocks || [],
      body.fullTranscript || "",
      body.language || "en",
    );
    const raw = await callClaude(prompt, c.env.ANTHROPIC_API_KEY, c.env.CLAUDE_MODEL);

    // Extract JSON from response (Claude may wrap it in markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return c.json(
        { error: "Could not parse summary JSON from Claude response" },
        502,
      );
    }

    const summary = JSON.parse(jsonMatch[0]) as {
      executive: string;
      decisions: string[];
      actionItems: string[];
    };

    return c.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Finalization failed", detail: msg }, 502);
  }
});

// 404 fallback
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error", detail: err.message }, 500);
});

export default app;
