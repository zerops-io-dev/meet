# Zerops Meet

AI-powered meeting transcription and summarization. Records audio in the browser, transcribes via Whisper (GPU), and generates structured summaries with Claude.

## Architecture

```
Browser (records audio) → CF Worker (API proxy) → Whisper API (homelab GPU)
                                                → Claude API (summaries)

Frontend: CF Pages at meet.zerops.io
Worker:   CF Worker at api-meet.zerops.io
Whisper:  FastAPI on homelab GPU via CF Tunnel
```

## Project Structure

```
├── frontend/          React + Vite + TypeScript + Tailwind
├── worker/            Cloudflare Worker (Hono) — API proxy
└── whisper-service/   FastAPI Whisper service (homelab GPU)
```

## Development

```bash
# Install dependencies
npm install

# Run frontend (port 5173) + worker (port 8788) concurrently
npm run dev

# Or run individually
npm run dev:frontend
npm run dev:worker
```

The frontend includes mock responses for development — no worker needed to test the UI.

## Worker Secrets

```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
```

## Deployment

```bash
# Frontend → CF Pages
npm run build:frontend

# Worker → CF Workers
cd worker && npm run deploy
```

## Features

- **Real-time transcription** — 30-second audio chunks transcribed as you record
- **Bullet summaries** — Periodic bullet-point summaries during the meeting
- **Final summary** — Executive summary, key decisions, and action items
- **Meeting history** — Past meetings stored in localStorage
- **Multi-language** — English and Spanish support with auto-detection
- **Dark theme** — Optimized for meeting room environments
- **Responsive** — Works on desktop and tablet

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Worker**: Cloudflare Workers, Hono, TypeScript
- **Transcription**: faster-whisper (large-v3) on NVIDIA GPU
- **Summarization**: Claude (claude-haiku-4-5-20251001)
