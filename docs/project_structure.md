# Project Structure — LegendAI

## Full Directory Tree

```
LegendAI/
│
├── .github/
│   ├── copilot-instructions.md         ← Copilot auto-loaded on every prompt
│   ├── instructions/                   ← Domain instruction files (applyTo patterns)
│   │   ├── coding-standards.instructions.md
│   │   ├── translation.instructions.md
│   │   ├── ai-providers.instructions.md
│   │   └── streaming.instructions.md
│   └── scripts/
│       └── README.md                   ← Testing utilities docs
│
├── .copilot/
│   └── Skill.MD                        ← Project bible (single source of truth)
│
├── docs/
│   ├── architecture.md                 ← System design and decisions
│   ├── domain_model.md                 ← Core entities and types
│   ├── project_structure.md            ← This file
│   ├── ROADMAP.md                      ← Feature roadmap (existing)
│   ├── REFACTORING-PLAN.md             ← Code quality improvement plan
│   ├── DEPENDENCIES-UPDATE-PLAN.md     ← Dependency upgrade strategy
│   ├── HOTFIX-QUOTA-ERROR-2026.md      ← Quota handling fix details
│   ├── ANALISE-TIMEOUT-VERCEL.md       ← Vercel timeout analysis
│   ├── CHANGELOG.md                    ← Version history
│   └── EXECUTIVE-SUMMARY.md            ← Quick overview of all docs
│
├── app/                                ← Next.js App Router
│   ├── layout.tsx                      ← Root layout with metadata
│   ├── page.tsx                        ← Home page (main UI)
│   ├── globals.css                     ← Global styles
│   ├── custom.css                      ← Custom component styles
│   │
│   └── api/                            ← API Routes
│       ├── route.ts                    ← Main translation endpoint (POST /api)
│       └── translate-chunk/            ← (Future) Single chunk endpoint
│           └── route.ts
│
├── components/                         ← React Components
│   ├── Form.tsx                        ← Main upload and translation form
│   ├── TranslationProgress.tsx         ← Progress bar with SSE
│   ├── ThemeToggle.tsx                 ← Light/Dark theme switcher
│   ├── Timestamp.tsx                   ← Timestamp formatting utility
│   └── DebugConsole.tsx                ← Developer debug panel
│
├── lib/                                ← Core Logic & Utilities
│   ├── srt.ts                          ← SRT parser, builder, chunker, validator
│   ├── client.ts                       ← Client-side utilities
│   └── cache.ts                        ← (Future) Translation cache
│
├── fonts/                              ← Custom fonts
│   └── index.ts                        ← Font exports (Playfair, Libre Baskerville)
│
├── public/                             ← Static assets
│   └── preview.png                     ← Screenshot for README
│
├── scripts/                            ← Testing & Development Scripts
│   ├── test/
│   │   ├── README.md                   ← Testing guide
│   │   ├── test-translation.js         ← End-to-end translation test
│   │   ├── test-srt-format.js          ← SRT format validation test
│   │   ├── test-short.srt              ← Test file (small)
│   │   ├── test-short-2.srt            ← Test file (small, variant)
│   │   ├── test-input.srt              ← Test file (medium)
│   │   └── *.srt                       ← Real subtitle test files
│   │
│   ├── investigate-problem-chunk.js    ← Debug specific chunk issues
│   └── test-adaptive-chunks.js         ← Test chunking logic
│
├── CLAUDE.md                           ← Quick reference for Claude Code
├── ADVANCED-INTEGRATIONS.md            ← Advanced AI integration docs
├── AI-APIS-STRATEGY.md                 ← AI provider strategy & comparison
├── DESKTOP-PROJECT-PLAN.md             ← Desktop app roadmap
├── DESKTOP-SKILLS-GUIDE.md             ← Desktop development guide
├── README.md                           ← Public-facing documentation
├── types.ts                            ← Global TypeScript types
├── next.config.js                      ← Next.js configuration
├── tailwind.config.ts                  ← Tailwind CSS config
├── tsconfig.json                       ← TypeScript config
├── postcss.config.js                   ← PostCSS config
├── vercel.json                         ← Vercel deployment config
├── package.json                        ← Dependencies and scripts
├── .env.local                          ← Local environment variables (not committed)
├── .env.vercel                         ← Vercel environment variables (template)
└── extract_subs.bat                    ← Windows batch script for subtitle extraction
```

---

## Key Directories Explained

### `/app` — Next.js App Router

Next.js 14 uses file-based routing. Each folder/file in `/app` becomes a route.

**Structure:**

- `layout.tsx` — Wraps all pages (HTML structure, metadata)
- `page.tsx` — Root route (`/`)
- `api/` — Backend API routes (serverless functions)

**Conventions:**

- Server Components by default
- Use `"use client"` directive for client-side interactivity
- API routes return Response objects (Web API standard)

---

### `/components` — React Components

All reusable UI components live here.

**Current Components:**

#### `Form.tsx`

Main upload and translation orchestration component.

**Responsibilities:**

- File upload (drag-and-drop + file picker)
- API key management (add, remove, validate multiple keys)
- Language selection
- Trigger translation API call
- Manage SSE connection for progress
- Download translated file
- Error handling

**State:**

- File: uploaded SRT file
- Keys: array of API keys
- Language: target language
- Progress: translation progress (0-100)
- Status: idle | translating | complete | error

---

#### `TranslationProgress.tsx`

Progress bar that updates via Server-Sent Events.

**Responsibilities:**

- Connect to SSE endpoint
- Update progress bar in real-time
- Show current chunk / total chunks
- Handle connection errors
- Display keep-alive status

**Props:**

- `onProgress`: Callback with progress data
- `onComplete`: Callback when translation done
- `onError`: Callback on error

---

#### `ThemeToggle.tsx`

Light/dark mode switcher.

**Implementation:**

- Uses `next-themes` for theme management
- Persists preference to localStorage
- System theme detection

---

#### `DebugConsole.tsx`

Developer-only panel for debugging.

**Shows:**

- API request/response logs
- SSE events
- Chunk processing details
- Rate limiting status
- Quota errors

**Toggle:** Keyboard shortcut or UI button

---

### `/lib` — Core Business Logic

Pure functions and utilities. No React, no side effects (mostly).

#### `srt.ts`

**Exports:**

- `parseSRT(content: string): ParsedSubtitle[]`
- `buildSRT(subtitles: ParsedSubtitle[]): string`
- `chunkSubtitles(subtitles: ParsedSubtitle[], chunkSize: number): ParsedSubtitle[][]`
- `validateTimings(original: ParsedSubtitle, translated: ParsedSubtitle): boolean`
- `sampleValidation(original: ParsedSubtitle[], translated: ParsedSubtitle[]): ValidationResult`
- `groupSegmentsByTokenLength(segments: Segment[], maxTokens: number): Segment[][]`

**Why separate from components:**

- Testable without React
- Reusable in desktop app (future)
- Clear separation of concerns

---

#### `client.ts`

**Exports:**

- `parseSegment(segment: string): Segment` — Parse SSE message
- Client-side utilities

---

### `/app/api` — Backend API Routes

Serverless functions deployed to Vercel Edge.

#### `POST /api`

**Purpose:** Main translation endpoint.

**Request Body:**

```json
{
  "srtContent": "raw SRT text",
  "targetLanguage": "pt-BR",
  "sourceLanguage": "en" | "auto",
  "apiKeys": ["key1", "key2", ...],
  "filename": "Dexter.S01E05.srt" // for context extraction
}
```

**Response:** Server-Sent Events stream

**Events:**

```typescript
{
  type: 'progress',
  translated: 45,    // number of entries translated
  total: 100,        // total entries
  percentage: 45,    // 0-100
  currentChunk: 3,   // current chunk index
  totalChunks: 7     // total number of chunks
}

{
  type: 'complete',
  translated: 100,
  total: 100,
  percentage: 100,
  data: "translated SRT content"
}

{
  type: 'error',
  message: "Error message"
}

{
  type: 'quota_error',
  message: "Quota exhausted",
  retryAfter: 300 // seconds
}

{
  type: 'keep_alive',
  keepAliveUrl: "https://..." // ping to keep connection alive
}
```

**Implementation Details:**

- Streams translation progress via SSE
- Manages API key rotation
- Enforces rate limiting per key
- Handles quota errors with cooldown
- Validates output before sending

---

### `/scripts` — Testing & Development

#### `scripts/test/`

**`test-translation.js`**
End-to-end test that:

1. Reads test SRT file
2. Calls translation API
3. Validates output timing
4. Saves translated file
5. Reports success/failure

**Usage:**

```bash
node scripts/test/test-translation.js
```

**`test-srt-format.js`**
Validates SRT format integrity:

- Correct index numbering
- Valid timestamp format
- No missing entries
- Proper blank line separation

**Test Files:**

- `test-short.srt` — 10 entries (quick test)
- `test-short-2.srt` — 20 entries (variant)
- `test-input.srt` — 100 entries (medium)
- `Dexter.*.srt` — Real-world files (large)

---

## File Naming Conventions

### TypeScript Files

- **Components:** PascalCase (e.g., `Form.tsx`, `ThemeToggle.tsx`)
- **Utilities:** camelCase (e.g., `srt.ts`, `client.ts`)
- **Types:** camelCase (e.g., `types.ts`)

### Documentation

- **Architecture docs:** lowercase with hyphen (e.g., `architecture.md`)
- **Strategy docs:** UPPERCASE (e.g., `AI-APIS-STRATEGY.md`)
- **Plans:** UPPERCASE + PLAN suffix (e.g., `DESKTOP-PROJECT-PLAN.md`)

### Tests

- **Pattern:** `test-*.js` or `*.test.ts`
- **Fixtures:** `test-*.srt`

---

## Import Paths

### Absolute Imports (via `@/`)

```typescript
import { parseSRT } from '@/lib/srt';
import Form from '@/components/Form';
import type { Chunk } from '@/types';
```

**Configuration:** `tsconfig.json`

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"paths": {
			"@/*": ["./*"]
		}
	}
}
```

---

## Environment Variables

### `.env.local` (local development)

```env
# Not needed — API keys sent from client
# Future: Add for server-managed API keys
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

### `.env.vercel` (production template)

```env
# Template for Vercel environment variables
# Copy to Vercel dashboard when needed
```

**Why not commit `.env.local`:**

- Contains secrets (API keys)
- Each developer has their own keys
- `.gitignore` excludes it

---

## Build Output

### `.next/` — Next.js Build Output

Generated by `npm run build`. Not committed to git.

**Contains:**

- Compiled pages
- API routes
- Static assets
- Build manifest

**Clear with:** `rm -rf .next`

---

### `node_modules/` — Dependencies

Installed by `npm install`. Not committed to git.

**Restore with:** `npm install`

---

## Configuration Files

### `next.config.js`

Next.js configuration.

**Current settings:**

- React strict mode enabled
- Custom webpack config (if any)
- Environment variable handling

---

### `tailwind.config.ts`

Tailwind CSS configuration.

**Customizations:**

- Custom color palette
- Font family settings
- Dark mode strategy (`class`)

---

### `tsconfig.json`

TypeScript compiler configuration.

**Key settings:**

- `strict: true` — Maximum type safety
- `target: "ES2022"` — Modern JavaScript
- Path aliases (`@/*`)
- `jsx: "preserve"` — Let Next.js handle JSX

---

### `vercel.json`

Vercel deployment configuration.

**Settings:**

- Build command override (if any)
- Output directory
- Serverless function config (timeout, memory)

---

## Adding New Features

### New Component

1. Create `components/NewComponent.tsx`
2. Define props interface
3. Implement component
4. Export from component
5. Import in page: `import NewComponent from '@/components/NewComponent'`

### New API Route

1. Create `app/api/new-route/route.ts`
2. Export `GET`, `POST`, etc. handlers
3. Return `Response` object
4. Test with `curl` or Postman

### New Utility

1. Create `lib/new-util.ts`
2. Define pure functions
3. Add tests
4. Export functions
5. Import: `import { fn } from '@/lib/new-util'`

---

## Related Docs

- [Architecture](./architecture.md) — System design
- [Domain Model](./domain_model.md) — Core entities
- [ROADMAP](./ROADMAP.md) — Feature roadmap
