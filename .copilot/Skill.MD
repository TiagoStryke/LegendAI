# LegendAI — Project Bible (Skill.MD)

> **Single source of truth for the entire LegendAI project.**
> Read this before writing any code.
> See `CLAUDE.md` for quick reference.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Core Concepts](#core-concepts)
5. [Development Workflow](#development-workflow)
6. [Coding Standards](#coding-standards)
7. [Testing Strategy](#testing-strategy)
8. [Deployment](#deployment)
9. [Roadmap](#roadmap)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

### What is LegendAI?

**AI-powered subtitle translation system** that translates SRT (and future formats) subtitle files using advanced language models.

**Target audience:** Content consumers who want to watch foreign movies/series in their native language.

**Value proposition:**
- Fast translation (5-10 minutes for typical subtitle file)
- High quality (context-aware, preserves dialogue structure)
- Free tier available (Google Gemini)
- Offline capable (future desktop version with local models)

---

### Current State

**Web Version (v0.2.0)** — Production

- ✅ SRT parsing and validation
- ✅ Chunked translation with Google Gemini
- ✅ Real-time progress tracking (SSE)
- ✅ API key rotation with quota management
- ✅ Rate limiting (10 RPM per key)
- ✅ Automatic retry with exponential backoff
- ✅ Dialogue line preservation
- ✅ Context extraction from filename
- ✅ Dark mode support
- ✅ Deployed on Vercel

**Limitations:**
- Only Google Gemini supported
- Web-only (no offline mode)
- No translation history/cache
- No batch processing
- Only SRT format (no VTT, ASS, SSA)

---

### Future: Desktop Version

**Planned Features:**
- Electron app for macOS/Windows/Linux
- SQLite database for translation history
- Multiple AI providers (OpenAI, Claude, Ollama)
- Local model support (Ollama for offline translation)
- Batch processing (translate multiple files at once)
- Advanced format support (VTT, ASS, SSA with style preservation)
- Translation memory (reuse previous translations)
- Custom glossaries (for character names, show-specific terms)

See `DESKTOP-PROJECT-PLAN.md` for detailed roadmap.

---

## Architecture

### High-Level Overview

```
┌────────────────────────────────────────────────────────────┐
│                      User Browser                          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  React App (Next.js Client)                          │ │
│  │  - File upload                                       │ │
│  │  - Progress bar (SSE)                                │ │
│  │  - Download result                                   │ │
│  └───────────┬──────────────────────────────────────────┘ │
└─────────────┼──────────────────────────────────────────────┘
              │ POST /api (with SRT + API keys)
              ▼
┌────────────────────────────────────────────────────────────┐
│                   Vercel (Edge Function)                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Translation Engine (app/api/route.ts)                │ │
│  │                                                        │ │
│  │  1. Parse SRT                                         │ │
│  │  2. Extract context from filename                     │ │
│  │  3. Chunk subtitles (15 per chunk)                    │ │
│  │  4. For each chunk:                                   │ │
│  │     - Check rate limit                                │ │
│  │     - Pick available API key                          │ │
│  │     - Call Gemini AI                                  │ │
│  │     - Stream progress to client (SSE)                 │ │
│  │     - Validate output timing                          │ │
│  │  5. Merge chunks                                      │ │
│  │  6. Final validation                                  │ │
│  │  7. Return translated SRT                             │ │
│  └────────────┬──────────────────────────────────────────┘ │
└───────────────┼────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────┐
   │   Google Gemini AI       │
   │   gemini-2.0-flash-exp   │
   │   (Multiple API keys)    │
   └──────────────────────────┘
```

---

### Core Components

#### 1. SRT Parser (`lib/srt.ts`)

**Purpose:** Parse, validate, and build SRT files.

**Key Functions:**
- `parseSRT(content: string): ParsedSubtitle[]` — Parse raw SRT
- `buildSRT(subtitles: ParsedSubtitle[]): string` — Rebuild SRT
- `chunkSubtitles(subs: ParsedSubtitle[], size: number): ParsedSubtitle[][]` — Split into chunks
- `validateTimings(orig: ParsedSubtitle, trans: ParsedSubtitle): boolean` — Check timing match
- `sampleValidation(orig: ParsedSubtitle[], trans: ParsedSubtitle[]): ValidationResult` — Quick validation

**Design Principles:**
- Pure functions (no side effects, no mutation)
- Defensive parsing (handle malformed input gracefully)
- Sample-based validation (O(1) instead of O(n))

---

#### 2. Translation Engine (`app/api/route.ts`)

**Purpose:** Orchestrate translation with AI provider.

**Key Responsibilities:**
- Receive SRT + config from client
- Parse and validate SRT
- Extract context from filename
- Chunk subtitles (15 per chunk)
- Manage API key rotation
- Enforce rate limiting
- Handle quota errors
- Stream progress via SSE
- Validate output
- Return translated SRT

**Key Functions:**
- `POST(req: Request): Response` — Main API handler
- `extractFileContext(filename: string): string` — Parse filename for context
- `translateChunk(chunk: ParsedSubtitle[], apiKey: string): Promise<ParsedSubtitle[]>` — Translate one chunk
- `pickAvailableKey(keys: string[]): string | null` — Select next available key
- `waitForRateLimit(apiKey: string): Promise<void>` — Rate limit enforcement

---

#### 3. UI Components (`components/`)

##### `Form.tsx`
Main interface for file upload and translation control.

**State:**
- `file: File | null` — Uploaded SRT file
- `apiKeys: string[]` — User-provided API keys
- `targetLanguage: string` — Target language code
- `progress: number` — Translation progress (0-100)
- `status: 'idle' | 'translating' | 'complete' | 'error'`
- `translatedContent: string` — Final translated SRT
- `errorMessage: string` — Error details if failed

**Key Functions:**
- `handleFileUpload(file: File)` — Process uploaded file
- `handleTranslate()` — Start translation
- `connectSSE()` — Connect to SSE stream for progress
- `downloadTranslated()` — Download result

##### `TranslationProgress.tsx`
Real-time progress bar that updates via SSE.

**Props:**
- `onProgress: (data: TranslationProgress) => void`
- `onComplete: (translatedSRT: string) => void`
- `onError: (error: string) => void`

##### `ThemeToggle.tsx`
Light/dark mode switcher.

---

### Data Flow

```
1. User uploads SRT file
   ↓
2. parseSRT() → ParsedSubtitle[]
   ↓
3. extractFileContext(filename) → context string
   ↓
4. chunkSubtitles(subtitles, 15) → ParsedSubtitle[][]
   ↓
5. For each chunk:
   ↓
   a. waitForRateLimit(apiKey)
   ↓
   b. pickAvailableKey(apiKeys) → apiKey
   ↓
   c. translateChunk(chunk, apiKey) → ParsedSubtitle[]
   ↓
   d. Stream progress event (SSE)
   ↓
   e. Validate chunk timing
   ↓
6. Merge all translated chunks
   ↓
7. sampleValidation(original, translated)
   ↓
8. buildSRT(translatedSubtitles) → string
   ↓
9. Stream complete event with data
   ↓
10. User downloads translated file
```

---

## Tech Stack

### Frontend

- **Next.js 14** — React framework with App Router
- **React 18** — UI library
- **TypeScript 5** — Type safety
- **TailwindCSS** — Styling
- **Vercel AI SDK** — AI provider integration

**Why Next.js?**
- Server-side rendering for SEO
- API routes (backend + frontend in one repo)
- Easy Vercel deployment
- Automatic code splitting
- Built-in TypeScript support

---

### Backend

- **Next.js API Routes** — Serverless functions
- **Google Gemini AI** — Translation provider
- **Server-Sent Events (SSE)** — Real-time progress

**Why Serverless?**
- Zero-config deployment
- Auto-scaling
- Pay-per-use (free tier generous)
- No server maintenance

**Limitations:**
- 10-second timeout (mitigated with SSE streaming)
- No persistent storage (OK for stateless translation)
- Cold starts (~1-2s)

---

### Deployment

- **Vercel** — Hosting and CI/CD
- **GitHub** — Version control and CI

**Deployment workflow:**
1. Push to `main` branch
2. Vercel auto-deploys
3. Live in ~1 minute

---

## Core Concepts

### 1. Chunking Strategy

**Problem:** Gemini truncates responses after ~400 tokens.

**Solution:** Pre-chunk subtitles into groups of 15 entries.

**Why 15?**
- Empirically determined to stay under 400-token limit
- Balances API calls (fewer is better) vs. truncation risk (smaller is safer)

**Adjustable:** If truncation occurs, reduce to 10. If subtitles are very short, increase to 20.

---

### 2. Rate Limiting

**Problem:** Gemini API has 10 RPM (requests per minute) limit.

**Solution:** Track requests per key, enforce 10 RPM + 500ms min delay.

**Implementation:**
```typescript
const keyRequestHistory = new Map<string, RequestHistory>();

interface RequestHistory {
  timestamps: number[];  // Last 60 seconds of requests
  lastRequest: number;   // Last request timestamp
}

async function waitForRateLimit(apiKey: string): Promise<void> {
  const history = keyRequestHistory.get(apiKey) || { timestamps: [], lastRequest: 0 };
  const now = Date.now();
  
  // Remove requests older than 60 seconds
  history.timestamps = history.timestamps.filter(t => now - t < 60000);
  
  // Check if at limit
  if (history.timestamps.length >= 10) {
    const oldestRequest = history.timestamps[0];
    const waitTime = 60000 - (now - oldestRequest);
    if (waitTime > 0) {
      await sleep(waitTime);
    }
  }
  
  // Enforce minimum delay
  const timeSinceLastRequest = now - history.lastRequest;
  if (timeSinceLastRequest < 500) {
    await sleep(500 - timeSinceLastRequest);
  }
  
  // Record this request
  history.timestamps.push(Date.now());
  history.lastRequest = Date.now();
  keyRequestHistory.set(apiKey, history);
}
```

---

### 3. Quota Management

**Problem:** Free Gemini API has low quota that exhausts quickly.

**Solution:** Track quota failures per key, cooldown 5 minutes before retrying.

**Implementation:**
```typescript
const quotaFailedKeys = new Map<string, number>(); // key -> failedAt timestamp
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000;

function markQuotaFailed(apiKey: string): void {
  quotaFailedKeys.set(apiKey, Date.now());
}

function isKeyAvailable(apiKey: string): boolean {
  const failedAt = quotaFailedKeys.get(apiKey);
  if (!failedAt) return true;
  
  const now = Date.now();
  if (now - failedAt > QUOTA_COOLDOWN_MS) {
    quotaFailedKeys.delete(apiKey); // Cooldown expired
    return true;
  }
  
  return false;
}

function pickAvailableKey(apiKeys: string[]): string | null {
  for (const key of apiKeys) {
    if (isKeyAvailable(key)) return key;
  }
  return null; // All keys on cooldown
}
```

**User experience:**
- User provides multiple API keys
- System rotates through keys
- If all exhausted, show "Retry in X minutes"
- After cooldown, automatically resume

---

### 4. Context-Aware Translation

**Problem:** Generic translations lose show/movie-specific terminology.

**Solution:** Extract metadata from filename and include in prompt.

**Examples:**

| Filename | Extracted Context |
|----------|-------------------|
| `Dexter.S01E05.srt` | "Esta é uma legenda da série 'Dexter', temporada 1, episódio 5." |
| `Inception.2010.1080p.BluRay.srt` | "Esta é uma legenda do filme 'Inception' (2010). Fonte: alta definição (1080p), Blu-ray." |
| `Breaking.Bad.S02E03.720p.WEB-DL.srt` | "Esta é uma legenda da série 'Breaking Bad', temporada 2, episódio 3. Fonte: HD (720p), streaming/web." |

**Rationale:**
- AI maintains consistency (character names, terminology)
- Better handling of proper nouns
- Context-specific translations

---

### 5. Dialogue Preservation

**Problem:** AI sometimes concatenates dialogue lines incorrectly.

**Example:**
```
Original:
-Hello!
-Hi, how are you?

Bad translation:
-Olá! -Oi, tudo bem?

Good translation:
-Olá!
-Oi, tudo bem?
```

**Solution:** Post-process AI output to fix concatenated dialogue.

```typescript
function formatDialogueLines(text: string): string {
  const concatenatedDialoguePattern = /\s+-[^\s-]/g;
  const matches = text.match(concatenatedDialoguePattern);
  
  if (matches && matches.length > 0) {
    return text
      .split(/(\s+-[^-])/)
      .reduce((result, part, index) => {
        if (part.match(/^\s+-[^-]/)) {
          return result + '\n' + part.trim();
        } else if (index === 0) {
          return part;
        } else {
          return result + part;
        }
      }, '')
      .trim();
  }
  
  return text;
}
```

---

### 6. Timing Preservation

**Sacred rule:** NEVER modify timestamps during translation.

**Validation strategy:**
1. **Chunk-level:** After translating each chunk, verify timing matches original
2. **Sample-level:** After merging all chunks, validate 5 sample points (first, last, 25%, 50%, 75%)
3. **On mismatch:** Reject translation, log error, retry chunk

**Implementation:**
```typescript
function validateTimings(original: ParsedSubtitle, translated: ParsedSubtitle): boolean {
  return (
    original.startTime === translated.startTime &&
    original.endTime === translated.endTime &&
    original.index === translated.index
  );
}

function sampleValidation(
  original: ParsedSubtitle[],
  translated: ParsedSubtitle[]
): ValidationResult {
  const errors: string[] = [];
  
  if (original.length !== translated.length) {
    errors.push(`Length mismatch: ${original.length} vs ${translated.length}`);
    return { valid: false, errors };
  }
  
  // Check 5 sample points
  const indices = [
    0,
    original.length - 1,
    Math.floor(original.length * 0.25),
    Math.floor(original.length * 0.50),
    Math.floor(original.length * 0.75)
  ];
  
  for (const i of indices) {
    if (!validateTimings(original[i], translated[i])) {
      errors.push(`Timing mismatch at index ${i}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

## Development Workflow

### Before Writing Code

1. **Read this file** (Skill.MD)
2. **Check memory** (`/memories/`) for past learnings
3. **Plan with sequential-thinking MCP** for complex features
4. **Index repo with jcodemunch** before searching
5. **Fetch current API docs with context7** before using libraries
6. **Find real examples with github MCP** for unfamiliar patterns

---

### Writing Code

1. **Follow typing standards** (see `.github/instructions/coding-standards.instructions.md`)
2. **Write tests first** for new utilities (TDD where appropriate)
3. **Validate inputs** at API boundaries
4. **Handle errors gracefully** (never swallow errors)
5. **Log context** with errors (not just error message)

---

### After Writing Code

1. **Run tests**: `npm test`
2. **Run type check**: `npm run typecheck` (if exists) or build
3. **Test locally**: `npm run dev` and verify changes
4. **Update docs** if architecture/design changed
5. **Update memory** with new learnings
6. **Commit with conventional format**: `feat: add X` or `fix: resolve Y`

---

## Coding Standards

**See `.github/instructions/coding-standards.instructions.md` for full details.**

### Quick Reference

- **TypeScript strict mode** — Always `strict: true`
- **No `any`** — Use `unknown` and type narrowing
- **Explicit types** — All function params and return values
- **Null safety** — Handle `null`/`undefined` explicitly
- **Async/await** — Over raw Promises
- **Error context** — Log full context, never silent failures
- **Constants** — SCREAMING_SNAKE_CASE
- **Functions** — camelCase, verb-first naming
- **Components** — PascalCase files
- **Immutability** — Never mutate function parameters

---

## Testing Strategy

### Unit Tests

**Pure functions must be tested.**

Location: `lib/*.test.ts` or co-located with source.

**Example:**

```typescript
// lib/srt.test.ts
import { describe, it, expect } from 'vitest';
import { parseSRT, buildSRT } from './srt';

describe('parseSRT', () => {
  it('should parse valid SRT', () => {
    const input = '1\n00:00:01,000 --> 00:00:03,000\nHello\n';
    const result = parseSRT(input);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello');
  });
  
  it('should handle malformed input', () => {
    expect(() => parseSRT('invalid')).toThrow();
  });
});
```

**Run:** `npm test` (if test script exists, otherwise set up Vitest)

---

### Integration Tests

**Test full translation pipeline with real API.**

Location: `scripts/test/test-translation.js`

**Example:**

```bash
node scripts/test/test-translation.js
```

**What it tests:**
- Upload SRT
- Translate via API
- Validate timing preservation
- Verify output format

---

### Manual Testing

**Test files:** `scripts/test/*.srt`

- `test-short.srt` — 10 entries (quick smoke test)
- `test-input.srt` — 100 entries (medium)
- `Dexter.*.srt` — Real-world files (large)

---

## Deployment

### Current: Vercel

**Automatic deployment on push to `main`.**

```bash
git push origin main
# Vercel auto-deploys to production
```

**Manual deployment:**

```bash
vercel deploy --prod
```

---

### Environment Variables

**None required for current version** (API keys sent from client).

**Future (server-managed keys):**

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

---

## Roadmap

See `docs/ROADMAP.md` for full roadmap.

### Phase 1: Web Version (Complete)

- ✅ SRT parsing
- ✅ Gemini integration
- ✅ Chunked translation
- ✅ Progress tracking
- ✅ API key rotation
- ✅ Rate limiting
- ✅ Vercel deployment

### Phase 2: Desktop Version (Planned)

- 🚧 Electron app
- 🚧 SQLite database
- 🚧 Translation history
- 🚧 Multiple AI providers
- 🚧 Local model support (Ollama)
- 🚧 Batch processing

### Phase 3: Advanced Features (Future)

- 🚧 VTT, ASS, SSA format support
- 🚧 Style preservation for advanced formats
- 🚧 Translation memory
- 🚧 Custom glossaries
- 🚧 OCR for hardcoded subtitles

---

## Troubleshooting

### Common Issues

#### Translation truncated

**Symptom:** Translated subtitle has fewer entries than original.

**Cause:** Gemini API truncated response (400-token limit).

**Solution:** Reduce chunk size from 15 to 10.

```typescript
const CHUNK_SIZE = 10; // Reduced from 15
```

---

#### Rate limit errors (429)

**Symptom:** API returns "Too many requests".

**Cause:** Exceeding 10 RPM for API key.

**Solution:** Ensure rate limiting is enforced (check `waitForRateLimit()`).

---

#### Quota exhausted quickly

**Symptom:** All API keys fail with quota error.

**Cause:** Free tier quota is low (~15 RPM total, ~100 requests/day).

**Solution:**
- Add more API keys (rotate through multiple)
- Wait 5 minutes for cooldown
- Consider premium API (future)

---

#### Dialogue lines concatenated

**Symptom:** `-Hello! -Hi!` instead of separate lines.

**Cause:** AI ignored formatting instruction.

**Solution:** Already implemented in `formatDialogueLines()` post-processing.

---

#### Timing mismatch

**Symptom:** Validation fails with "Timing mismatch at index X".

**Cause:** AI modified timestamps despite instruction.

**Solution:** Already handled — validation rejects chunk and retries.

---

## MCP Tools Reference

### jcodemunch

**Index repo before searching:**

```bash
1. mcp_jcodemunch_index_repo
2. mcp_jcodemunch_search_symbols → find functions/classes
3. mcp_jcodemunch_get_symbol → retrieve specific symbol
4. mcp_jcodemunch_get_file_outline → see all symbols in file
```

---

### sequential-thinking

**Plan before implementing:**

```bash
1. Load tool: tool_search_tool_regex("sequential")
2. Invoke with problem description
3. Follow generated plan
```

---

### github

**Find real implementations:**

```bash
1. Load tool: tool_search_tool_regex("github")
2. mcp_github_search_code → search across GitHub
3. mcp_github_get_file_contents → fetch example
```

---

### memory

**Save learnings:**

```bash
1. memory → view /memories/
2. memory → create /memories/patterns.md
3. memory → str_replace to update
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Quick reference for Claude Code |
| `.copilot/Skill.MD` | This file — complete project bible |
| `docs/architecture.md` | System design and decisions |
| `docs/domain_model.md` | Core entities and business rules |
| `docs/project_structure.md` | Where everything lives |
| `docs/ROADMAP.md` | Feature roadmap |
| `.github/instructions/coding-standards.instructions.md` | Code style rules |
| `.github/instructions/translation.instructions.md` | Translation-specific rules |
| `.github/instructions/ai-providers.instructions.md` | AI provider integration guide |
| `.github/instructions/streaming.instructions.md` | SSE implementation guide |

---

## Summary

**LegendAI is an AI-powered subtitle translation system.**

**Current state:** Web app on Vercel using Google Gemini AI.

**Future:** Desktop app with multiple AI providers and offline support.

**Key principles:**
1. **Timing is sacred** — Never modify timestamps
2. **Preserve formatting** — Dialogue structure, multi-line text
3. **Context-aware** — Use filename metadata for better translations
4. **Quota management** — Rotate API keys, handle exhaustion gracefully
5. **Streaming progress** — Real-time updates via SSE
6. **Validate everything** — AI output is never perfect

**Before coding:**
- Read this file
- Check memory
- Plan with sequential-thinking
- Index with jcodemunch
- Fetch docs with context7

**After coding:**
- Test thoroughly
- Update docs
- Save learnings to memory
- Commit with conventional format

---

**Read `CLAUDE.md` for quick reference.**  
**Read docs for deep dives on specific topics.**  
**Follow `.github/instructions/*.instructions.md` for domain-specific rules.**
