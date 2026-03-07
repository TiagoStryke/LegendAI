# LegendAI — GitHub Copilot Instructions

> Auto-loaded by GitHub Copilot on every session.
> For full documentation, see `.copilot/Skill.MD` and `CLAUDE.md`.

---

## Project Overview

**LegendAI** is an AI-powered subtitle translation system that translates SRT files using Google Gemini AI.

**Target:** Brazilian Portuguese (pt-BR) subtitle translation  
**Current State:** Web app deployed on Vercel  
**Future:** Desktop app with multiple AI providers and offline support

---

## Tech Stack

- **Frontend:** Next.js 14 + React 18 + TypeScript 5 + TailwindCSS
- **Backend:** Next.js API Routes (serverless)
- **AI:** Google Gemini 2.0 Flash (`gemini-2.0-flash-exp`)
- **Streaming:** Server-Sent Events (SSE) for real-time progress
- **Deployment:** Vercel

---

## Key Principles

### 1. Timing is Sacred

**NEVER modify subtitle timestamps during translation.**  
Validate timing after every chunk and before final output.

### 2. Preserve Dialogue Formatting

Multi-line dialogue with hyphens:

```
-Hello!
-Hi, how are you?
```

Must stay formatted. Post-process AI output to fix concatenation.

### 3. Context-Aware Translation

Extract metadata from filename (show name, season/episode, resolution) and include in translation prompt for better quality.

### 4. Quota Management

- Track API key quota failures
- 5-minute cooldown before retrying failed key
- Rotate through multiple keys

### 5. Rate Limiting

- 10 RPM (requests per minute) per API key
- 500ms minimum delay between requests
- Track last 60 seconds of requests

### 6. Streaming Progress

- SSE events: `progress`, `complete`, `error`, `quota_error`, `retry`, `keep_alive`
- Keep-alive every 3 minutes to prevent Vercel timeout

---

## Critical Rules

### TypeScript

- **Strict mode:** Always enabled
- **No `any`:** Use `unknown` + type narrowing
- **Explicit types:** All function params and return values
- **Null safety:** Handle `null`/`undefined` explicitly

### Error Handling

- **Never swallow errors:** Always log or propagate
- **Context logging:** Include relevant context (API key ID, chunk index, timing details)
- **User-friendly messages:** Convert technical errors to actionable messages

### Naming Conventions

- **Constants:** `SCREAMING_SNAKE_CASE`
- **Functions:** `camelCase` (verb-first: `parseSRT`, `validateTimings`)
- **Components:** `PascalCase` (noun: `TranslationProgress`, `ThemeToggle`)
- **Files:** PascalCase for components, camelCase for utilities

### Translation

- **Chunk size:** 15 subtitles per chunk (adjustable if truncation occurs)
- **Context extraction:** Parse filename for show/movie metadata
- **Validation:** Sample-based (first, last, 25%, 50%, 75%)
- **Retry:** Exponential backoff on transient errors

---

## MCP Tool Order

When working with this codebase, follow this order:

1. **sequential-thinking** — Plan complex features before coding
2. **memory** — Read `/memories/` for past learnings, save new insights
3. **jcodemunch** — Index repo, search symbols, get file outlines
4. **github** — Find real-world implementations of unfamiliar patterns
5. **context7** — Fetch current API docs before using libraries
6. **Code** — Implement following all standards above

---

## MCP Tools — mandatory usage order before coding

```
1. sequential-thinking  → plan the approach before writing anything non-trivial
2. memory               → read at session start, write after every major decision
3. jcodemunch           → index repo, fetch symbols — never read whole files
4. github               → find real implementations using the same libraries
5. context7             → fetch current API docs before calling any library
6. write code
7. memory               → save decisions made
```

### jcodemunch — how to use

jcodemunch indexes the codebase using AST (tree-sitter) and lets you retrieve only the exact symbols you need — saving up to 99% of tokens compared to reading full files.

```
1. index_repo / index_folder  → index the workspace (do once per session)
2. search_symbols             → find functions, classes, types by name or pattern
3. get_symbol                 → retrieve a single symbol's full source
4. get_symbols                → retrieve multiple symbols at once
5. get_file_outline           → see all symbols in a file without reading it
6. get_repo_outline           → overview of the entire codebase structure
7. search_text                → regex search across indexed files
```

### sequential-thinking — how to use

Before implementing any non-trivial feature or fix:

```
1. Load the sequential-thinking tool
2. Describe the problem and constraints
3. Let it generate a step-by-step plan
4. Follow the plan, updating memory as you go
```

### memory — what to save

**User memory** (`/memories/`):

- Recurring bugs and their solutions
- Project-specific patterns (e.g., "always use streaming for long translations")
- API quirks (e.g., "Gemini truncates after 400 tokens per chunk")
- Preferred coding style for this project

**Session memory** (`/memories/session/`):

- Current task plan and progress
- Decisions made during this session
- Things to remember for next steps

---

## Context Priority

When working on a task, **always consult in this order**:

1. **`.copilot/Skill.MD`** — Single source of truth for entire project
2. **`docs/architecture.md`** — System design decisions
3. **`docs/domain_model.md`** — Core entities and business logic
4. **`docs/project_structure.md`** — Where everything lives
5. **Memory files** — Past learnings and patterns
6. **Code** — Only after understanding the above

## File Structure Quick Reference

```
app/
  api/
    route.ts                    # Main translation API endpoint
    translate-chunk/
      route.ts                  # Chunk translation helper (if modular)
components/
  Form.tsx                      # Main UI for file upload
  TranslationProgress.tsx       # Progress bar with SSE
  ThemeToggle.tsx               # Light/dark mode
lib/
  srt.ts                        # SRT parsing, validation, building
  cache.ts                      # Future: Translation cache
  client.ts                     # Client utilities
docs/
  architecture.md               # System design
  domain_model.md               # Entity definitions
  project_structure.md          # Where everything lives
  ROADMAP.md                    # Feature roadmap
.github/instructions/
  coding-standards.instructions.md     # TypeScript/React standards
  translation.instructions.md          # Translation-specific rules
  ai-providers.instructions.md         # AI provider integration
  streaming.instructions.md            # SSE implementation
.copilot/
  Skill.MD                      # Complete project bible
```

---

## Common Tasks

### Add New AI Provider

1. Create provider class implementing `AIProvider` interface (see `ai-providers.instructions.md`)
2. Add to provider registry
3. Update UI to allow provider selection
4. Test with real API key

### Fix Translation Quality

1. Review prompt in translation instructions
2. Test with sample files
3. Update context extraction logic if needed
4. Adjust chunk size if truncation occurs

### Improve Performance

1. Profile with browser DevTools
2. Optimize critical path (usually SRT parsing or API calls)
3. Consider caching (future feature)

---

## Testing

- **Unit tests:** `lib/*.test.ts` (pure functions)
- **Integration tests:** `scripts/test/test-translation.js` (full pipeline)
- **Manual tests:** Use files in `scripts/test/*.srt`

**Run tests:**

```bash
npm test                          # Unit tests (if configured)
node scripts/test/test-translation.js   # Integration test
```

---

## Deployment

**Automatic:** Push to `main` branch → Vercel auto-deploys

**Manual:**

```bash
vercel deploy --prod
```

---

## Troubleshooting

| Issue                 | Cause                  | Solution                                   |
| --------------------- | ---------------------- | ------------------------------------------ |
| Translation truncated | 400-token limit        | Reduce chunk size to 10                    |
| Rate limit (429)      | >10 RPM                | Check `waitForRateLimit()`                 |
| Quota exhausted       | Low free tier          | Add more keys, wait 5 min                  |
| Dialogue concatenated | AI ignored format      | Already handled by `formatDialogueLines()` |
| Timing mismatch       | AI modified timestamps | Validation rejects and retries             |

---

## Documentation Hierarchy

1. **Quick reference:** `CLAUDE.md` (load this first)
2. **Project bible:** `.copilot/Skill.MD` (comprehensive guide)
3. **Architecture:** `docs/architecture.md` (system design)
4. **Domain model:** `docs/domain_model.md` (entities and business rules)
5. **Instruction files:** `.github/instructions/*.instructions.md` (domain-specific rules)

---

**Always read `.copilot/Skill.MD` before writing code.**  
**Always follow `.github/instructions/*.instructions.md` for specific domains.**  
**Always update memory with new learnings.**
