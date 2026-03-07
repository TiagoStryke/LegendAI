# LegendAI — Claude Code Instructions

> This file is auto-loaded by Claude Code on every session.
> Full project bible: `.copilot/Skill.MD`

---

## Project

AI-powered subtitle translation system for movies and TV series.
**Language:** Portuguese (pt-BR) target | **Platform:** Web (Next.js) + Future Desktop (Electron)

**Stack:** Next.js 14 + React 18 + TypeScript 5 | Google Gemini AI | Vercel AI SDK | TailwindCSS

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

---

## Key Project Facts

### Current State (Web Version)

- ✅ SRT parsing and validation
- ✅ Chunked translation with Google Gemini
- ✅ Progress tracking with SSE
- ✅ Quota-aware API key rotation
- ✅ Rate limiting and retry logic
- ✅ Dialogue preservation and formatting
- ✅ Context extraction from filenames

### Future (Desktop Version)

- 🚧 Electron app (see DESKTOP-PROJECT-PLAN.md)
- 🚧 SQLite database for translation history
- 🚧 Multiple AI provider support
- 🚧 Batch processing
- 🚧 Style/formatting preservation for ASS/SSA

---

## Critical Constraints

1. **Gemini API Limits**
   - 400 tokens per chunk maximum (hardcoded limit)
   - 10 RPM (requests per minute) per API key
   - Quota cooldown: 60 seconds (2 minutes for repeated failures)
   - Always respect rate limits to avoid 429 errors

2. **Vercel Constraints**
   - 10 second timeout for serverless functions on free tier
   - Streaming responses keep connection alive
   - Use keep-alive pings for long translations

3. **Translation Quality**
   - Always preserve timestamps exactly
   - Never merge or split subtitle entries
   - Maintain dialogue formatting (hyphen-prefixed lines)
   - Extract context from filename for better translations

---

## Before Writing Code

1. **Index the repo**: Use `jcodemunch` to index before searching
2. **Check memory**: Read `/memories/` for past learnings
3. **Plan with sequential-thinking**: For anything beyond trivial edits
4. **Get current docs**: Use `context7` to fetch latest API docs
5. **Find examples**: Use `github` MCP to see real implementations

---

## After Making Changes

1. **Update memory**: Save any new patterns or learnings
2. **Update docs**: If architecture or design changed
3. **Test**: Run `npm run dev` and verify changes
4. **Commit message**: Follow conventional commits format

---

## Common Tasks Quick Reference

**Add new AI provider:**

1. Define interface in `lib/ai-providers.ts`
2. Implement adapter for provider
3. Add to provider registry
4. Update UI to show option
5. Document in AI-APIS-STRATEGY.md

**Fix translation quality issue:**

1. Check `lib/srt.ts` for parsing logic
2. Update prompt in `app/api/route.ts`
3. Test with problematic subtitle file
4. Add test case in `scripts/test/`

**Improve performance:**

1. Profile with Vercel Analytics
2. Check chunk size (`MAX_TOKENS_IN_SEGMENT`)
3. Verify rate limiting isn't too aggressive
4. Consider parallel chunk processing (future)

---

## Never Do This

- ❌ Read entire files when you need one function
- ❌ Implement without planning for complex features
- ❌ Skip updating docs after architectural changes
- ❌ Ignore rate limits or quota constraints
- ❌ Modify timestamps in subtitle processing
- ❌ Deploy without testing locally first

---

## File Change = Doc Update Triggers

If you change:

- **Architecture** → Update `docs/architecture.md`
- **API routes** → Update `docs/api.md` (create if needed)
- **Types** → Update `docs/domain_model.md`
- **Project structure** → Update `docs/project_structure.md`
- **AI providers** → Update `AI-APIS-STRATEGY.md`

---

## Best Practices

1. **Streaming First**: All long operations use streaming responses
2. **Defensive Parsing**: Validate all subtitle input thoroughly
3. **Graceful Degradation**: Fallback to simpler translation if AI fails
4. **User Feedback**: Always show progress and clear error messages
5. **Context Aware**: Use filename context to improve translations

---

## Current Focus

See `docs/ROADMAP.md` for current phase and priorities.
See `DESKTOP-PROJECT-PLAN.md` for desktop app roadmap.
