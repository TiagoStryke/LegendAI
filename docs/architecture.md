# Architecture — LegendAI

## Overview

LegendAI is an **AI-powered subtitle translation system** that translates SRT (and future formats) subtitle files using advanced language models.

The system has two incarnations:

1. **Web version** (current) — Serverless Next.js app on Vercel
2. **Desktop version** (planned) — Electron app for offline processing

---

## System Diagram — Web Version (Current)

```
┌─────────────────────────────────────────────────────────────┐
│                         User's Browser                       │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          React App (Next.js Client)                   │  │
│  │                                                        │  │
│  │  ┌──────────────┐     ┌──────────────────────────┐   │  │
│  │  │ File Upload  │     │  Translation Progress    │   │  │
│  │  │  Component   │     │    (SSE Stream)          │   │  │
│  │  └──────┬───────┘     └──────────▲───────────────┘   │  │
│  │         │                         │                    │  │
│  └─────────┼─────────────────────────┼────────────────────┘  │
│            │                         │                       │
└────────────┼─────────────────────────┼───────────────────────┘
             │                         │
             │ POST /api               │ Server-Sent Events
             ▼                         │
┌─────────────────────────────────────────────────────────────┐
│                      Vercel Platform                         │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          API Route (Next.js Server)                   │  │
│  │                                                        │  │
│  │  ┌──────────────┐     ┌──────────────────────────┐   │  │
│  │  │  SRT Parser  │     │   Translation Engine     │   │  │
│  │  │              │────▶│                          │   │  │
│  │  │  - Parse     │     │  - Chunk subtitles       │   │  │
│  │  │  - Validate  │     │  - Extract context       │   │  │
│  │  │  - Build     │     │  - Rotate API keys       │   │  │
│  │  └──────────────┘     │  - Rate limit            │   │  │
│  │                       │  - Stream translation    │   │  │
│  │                       │  - Validate output       │   │  │
│  │                       └────────┬─────────────────┘   │  │
│  └────────────────────────────────┼──────────────────────┘  │
└────────────────────────────────────┼──────────────────────────┘
                                     │
                                     ▼
                          ┌────────────────────┐
                          │   Google Gemini    │
                          │      AI API        │
                          │                    │
                          │  - gemini-2.0-     │
                          │    flash-exp       │
                          │  - Multiple keys   │
                          │  - Rate limited    │
                          └────────────────────┘
```

---

## System Diagram — Desktop Version (Planned)

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Machine                           │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Electron App (Desktop)                   │  │
│  │                                                        │  │
│  │  ┌─────────────────┐    ┌──────────────────────────┐ │  │
│  │  │  Renderer       │    │  Main Process (Node.js)  │ │  │
│  │  │  (React)        │    │                          │ │  │
│  │  │  - UI           │◄──▶│  - SQLite DB             │ │  │
│  │  │  - File picker  │    │  - Translation queue     │ │  │
│  │  │  - Progress     │    │  - AI provider manager   │ │  │
│  │  │  - History      │    │  - Background workers    │ │  │
│  │  └─────────────────┘    └──────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                   SQLite DB file                             │
│              ~/Library/Application Support/                  │
│                    LegendAI/app.db                           │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────┐
│        Multiple AI Providers          │
│                                       │
│  - Google Gemini                      │
│  - OpenAI GPT                         │
│  - Anthropic Claude                   │
│  - Local models (Ollama)              │
└───────────────────────────────────────┘
```

---

## Core Components

### 1. SRT Parser (`lib/srt.ts`)

**Purpose:** Parse, validate, and manipulate SRT subtitle files.

**Key Functions:**

- `parseSRT()` — Convert raw SRT text to structured objects
- `buildSRT()` — Reconstruct SRT from parsed objects
- `chunkSubtitles()` — Split subtitles into translation chunks
- `validateTimings()` — Ensure original and translated timing match
- `sampleValidation()` — Quick validation of 5 sample points

**Design Decisions:**

- Immutable operations — never mutate input
- Defensive parsing — handle malformed files gracefully
- Sample-based validation — O(1) instead of O(n) for large files

---

### 2. Translation Engine (`app/api/route.ts`)

**Purpose:** Orchestrate AI translation with quota management, rate limiting, and streaming.

**Key Features:**

- **Chunking:** Splits subtitles into ~400 token chunks
- **Context extraction:** Parses filename (S01E05, movie name, year) for better translation
- **API key rotation:** Cycles through keys when quota is exhausted
- **Rate limiting:** Enforces 10 RPM per key, 500ms min delay
- **Retry logic:** Automatic retry on failures with exponential backoff
- **Streaming:** Server-Sent Events for real-time progress
- **Keep-alive:** Prevents Vercel/Render timeouts on long translations

**Flow:**

1. Receive SRT file + target language + API keys
2. Parse SRT → validate
3. Extract context from filename
4. Chunk subtitles (15 per chunk by default)
5. For each chunk:
   - Wait for rate limit clearance
   - Pick next available API key (skip quota-failed keys)
   - Call Gemini with context + chunk
   - Stream progress to client
   - Validate translated chunk
6. Merge all translations
7. Validate final output
8. Return translated SRT

---

### 3. Client Form (`components/Form.tsx`)

**Purpose:** User interface for file upload and translation orchestration.

**Features:**

- File upload (drag-and-drop + file picker)
- Language selection
- API key management (multiple keys)
- Real-time progress via SSE
- Download translated file
- Error handling with user-friendly messages

---

### 4. AI Provider Abstraction (Planned)

**Purpose:** Support multiple AI providers with unified interface.

**Design:**

```typescript
interface AIProvider {
	name: string;
	translate(
		chunk: string,
		context: string,
		targetLang: string,
	): Promise<string>;
	checkQuota(): Promise<boolean>;
	getRateLimit(): { requestsPerMinute: number; minDelayMs: number };
}
```

**Providers:**

- Gemini (current)
- OpenAI GPT-4 (planned)
- Claude 3.5 (planned)
- Local Ollama models (planned for desktop)

---

## Data Flow

### Web Version

```
User uploads SRT
    ↓
parseSRT()
    ↓
Extract filename context
    ↓
chunkSubtitles()
    ↓
For each chunk:
    ↓
    Check rate limit
    ↓
    Pick available API key
    ↓
    Call Gemini AI
    ↓
    Stream progress to client
    ↓
    Validate chunk
    ↓
Merge chunks
    ↓
sampleValidation()
    ↓
buildSRT()
    ↓
Download translated file
```

### Desktop Version (Planned)

```
User adds SRT to queue
    ↓
Store in SQLite
    ↓
Background worker picks job
    ↓
Check translation cache (hash-based)
    ↓
If cached: return instantly
    ↓
Else: run translation pipeline
    ↓
Store result in cache
    ↓
Update job status
    ↓
Notify renderer
```

---

## Key Design Decisions

### 1. Chunking Strategy

**Problem:** Gemini truncates responses after ~400 tokens.

**Solution:** Pre-chunk subtitles into groups of 15 entries (~300-400 tokens).

**Rationale:**

- Prevents truncation
- Allows progress tracking
- Enables parallel processing (future)
- Better error recovery (re-translate failed chunk only)

---

### 2. Quota-Aware Key Rotation

**Problem:** Free Gemini API has low quota that exhausts quickly.

**Solution:**

- Maintain list of API keys
- Track quota failures per key
- 5-minute cooldown before retrying failed key
- Rotate to next available key on quota error

**Rationale:**

- Maximizes throughput with multiple free keys
- Graceful degradation (not hard failure)
- User can continue working with minimal interruption

---

### 3. Rate Limiting Per Key

**Problem:** Gemini returns 429 (TooManyRequests) at ~10 RPM.

**Solution:**

- Track last 60 seconds of requests per key
- Enforce 10 RPM limit per key
- 500ms minimum delay between requests
- Wait if rate limit would be exceeded

**Rationale:**

- Prevents 429 errors
- Maximizes throughput without throttling
- Predictable performance

---

### 4. Context-Aware Translation

**Problem:** Generic translations lose show/movie-specific terminology.

**Solution:** Extract metadata from filename:

- Series name, season, episode (e.g., `Dexter.S01E05`)
- Movie name and year (e.g., `Inception.2010`)
- Quality/source (BluRay, 1080p, etc.)

**Rationale:**

- Improves translation quality
- Maintains consistency of character names
- Better handling of domain-specific terms

---

### 5. Streaming Progress

**Problem:** Vercel 10-second timeout for serverless functions.

**Solution:** Use Server-Sent Events (SSE) to stream progress.

**Rationale:**

- Keeps connection alive (no timeout)
- Real-time feedback to user
- Better UX (progress bar vs. spinner)

---

## Technology Choices

### Next.js 14

**Why:**

- Server-side rendering for SEO
- API routes for backend logic
- Easy Vercel deployment
- React 18 + TypeScript support

**Alternatives considered:**

- ❌ Vite + Express — More setup, less integrated
- ❌ Pure React SPA — No SSR, needs separate backend

---

### Google Gemini AI

**Why:**

- Free tier with generous quota
- Fast responses (2-5s per chunk)
- Good translation quality
- Simple API (Vercel AI SDK)

**Alternatives considered:**

- ❌ OpenAI GPT-4 — Expensive, no free tier
- ✅ Will add as optional premium provider

---

### Vercel Deployment

**Why:**

- Zero-config Next.js deployment
- Edge functions for low latency
- Generous free tier
- Auto-scaling

**Limitations:**

- 10s timeout (mitigated with streaming)
- Cold starts (~1-2s)
- No persistent storage (OK for stateless translation)

---

### Future: Electron Desktop

**Why:**

- Offline translation (no internet required with local models)
- Persistent storage (SQLite)
- Batch processing
- No Vercel timeout constraints
- Better for power users

---

## Security Considerations

### Current (Web)

- ✅ API keys never stored server-side
- ✅ Keys sent in request body (not query params)
- ✅ No backend database (stateless)
- ✅ HTTPS only (Vercel enforces)
- ⚠️ Keys visible in browser memory (acceptable for personal use)

### Future (Desktop)

- ✅ Keys encrypted at rest (OS keychain)
- ✅ Local processing (no data leaves machine with local models)
- ✅ Opt-in cloud providers (user choice)

---

## Performance

### Current Metrics

- **Parsing:** ~10ms for 1000-entry SRT
- **Chunking:** ~5ms for 1000-entry SRT
- **Translation:** ~3-5s per chunk (15 entries)
- **Total time:** ~5-10 minutes for 1000-entry file (with 1 API key)

### Optimization Opportunities

1. **Parallel chunks:** Process multiple chunks concurrently (need more API keys)
2. **Caching:** Hash-based cache for repeated translations (desktop)
3. **Smarter chunking:** Adjust chunk size based on text density
4. **Local models:** Faster, no rate limits (desktop)

---

## Deployment

### Current: Vercel

```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment
vercel deploy --prod
```

### Environment Variables

```env
# Not needed — API keys sent from client
# Future: Add for server-managed keys (premium tier)
```

---

## Monitoring

### Current

- Vercel Analytics (built-in)
- Client-side error logging (console)

### Future (Desktop)

- Sentry for crash reporting
- Local analytics (opt-in)
- Performance profiling

---

## Related Docs

- [Project Structure](./project_structure.md) — Where everything lives
- [Domain Model](./domain_model.md) — Core entities and types
- [AI-APIS-STRATEGY.md](../AI-APIS-STRATEGY.md) — AI provider details
- [DESKTOP-PROJECT-PLAN.md](../DESKTOP-PROJECT-PLAN.md) — Desktop roadmap
- [ROADMAP.md](./ROADMAP.md) — Feature roadmap
