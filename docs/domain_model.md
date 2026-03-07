# Domain Model — LegendAI

> This document describes every domain entity in the system:
> its purpose, attributes, business rules, relationships, and TypeScript type.
>
> Source of truth for types lives in `types.ts` and component prop interfaces.

---

## Entity Overview

```
┌──────────────────┐
│  Subtitle File   │
└────────┬─────────┘
         │ contains
         ▼
┌──────────────────┐
│ ParsedSubtitle   │ (array of entries)
└────────┬─────────┘
         │ grouped into
         ▼
┌──────────────────┐
│   SRT Chunk      │ (15 entries per chunk)
└────────┬─────────┘
         │ translated by
         ▼
┌──────────────────┐     uses      ┌──────────────────┐
│  Translation     │◄───────────────│    AI Provider   │
│   Request        │                └──────────────────┘
└────────┬─────────┘
         │ produces
         ▼
┌──────────────────┐
│  Translation     │
│   Response       │
└────────┬─────────┘
         │ streamed as
         ▼
┌──────────────────┐
│    Progress      │
│    Event         │
└──────────────────┘
```

---

## Core Entities

### ParsedSubtitle

> Represents a single subtitle entry with timing information.

#### Concept

A subtitle file (SRT, VTT, etc.) is composed of discrete entries.  
Each entry has:

- An index (sequential number)
- Start time
- End time
- Text content (can be multi-line)

#### Type

```typescript
// lib/srt.ts

interface ParsedSubtitle {
	index: number;
	startTime: string; // Format: "HH:MM:SS,mmm" (e.g., "00:01:23,456")
	endTime: string; // Format: "HH:MM:SS,mmm"
	text: string; // Subtitle text (can contain \n for multi-line)
}
```

#### Example

```typescript
{
  index: 42,
  startTime: "00:01:23,456",
  endTime: "00:01:26,789",
  text: "Hello, how are you?"
}
```

#### Business Rules

1. **Index must be sequential:** When building SRT, indices are reassigned to ensure 1, 2, 3, ...
2. **Timestamps must be valid:** Format must match `HH:MM:SS,mmm` exactly
3. **Start < End:** Start time must be before end time
4. **Text can be empty:** Silent entries are valid (e.g., `\n` or `""`)
5. **Multi-line text:** Dialogue lines are separated by `\n`

#### Validation

```typescript
function isValidSubtitle(sub: ParsedSubtitle): boolean {
	return (
		sub.index > 0 &&
		/^\d{2}:\d{2}:\d{2},\d{3}$/.test(sub.startTime) &&
		/^\d{2}:\d{2}:\d{2},\d{3}$/.test(sub.endTime) &&
		sub.text.length > 0
	);
}
```

---

### Segment

> Simplified subtitle representation for client-side processing.

#### Concept

Used in client code for display and UI logic.  
Combines timestamp components into a single string.

#### Type

```typescript
// types.ts

type Segment = {
	id: number;
	timestamp: string; // Format: "HH:MM:SS,mmm --> HH:MM:SS,mmm"
	text: string;
};
```

#### Example

```typescript
{
  id: 42,
  timestamp: "00:01:23,456 --> 00:01:26,789",
  text: "Hello, how are you?"
}
```

#### Conversion

```typescript
function toSegment(sub: ParsedSubtitle): Segment {
	return {
		id: sub.index,
		timestamp: `${sub.startTime} --> ${sub.endTime}`,
		text: sub.text,
	};
}
```

---

### Chunk

> Group of subtitles processed together in a single translation request.

#### Concept

Large subtitle files are split into chunks of ~15 entries.  
Each chunk is translated independently for:

- Better error recovery (re-translate failed chunk only)
- Progress tracking
- Respecting API token limits
- Future: Parallel processing

#### Type

```typescript
// types.ts (from original code)

interface Chunk {
	index: string; // Chunk identifier (e.g., "1-15")
	start: string; // First entry start time
	end: string; // Last entry end time
	text: string; // Concatenated text of all entries
}

// lib/srt.ts (more common usage)
type SubtitleChunk = ParsedSubtitle[];
```

#### Example

```typescript
// Array of 15 ParsedSubtitle objects
const chunk: SubtitleChunk = [
	{
		index: 1,
		startTime: '00:00:01,000',
		endTime: '00:00:03,000',
		text: 'Hello',
	},
	{
		index: 2,
		startTime: '00:00:03,500',
		endTime: '00:00:06,000',
		text: 'How are you?',
	},
	// ... 13 more entries
];
```

#### Business Rules

1. **Fixed size:** Default 15 entries per chunk (configurable)
2. **Preserve order:** Chunks maintain sequential order
3. **No overlap:** Each subtitle belongs to exactly one chunk
4. **Complete entries:** Never split a subtitle across chunks

#### Chunking Strategy

```typescript
function chunkSubtitles(
	subtitles: ParsedSubtitle[],
	chunkSize: number = 15,
): ParsedSubtitle[][] {
	const chunks: ParsedSubtitle[][] = [];
	for (let i = 0; i < subtitles.length; i += chunkSize) {
		chunks.push(subtitles.slice(i, i + chunkSize));
	}
	return chunks;
}
```

**Why 15 entries?**

- Empirically determined to stay under Gemini's 400-token output limit
- Balances between too many requests (slow) and too large chunks (truncation)

---

### TranslationRequest

> API request to translate subtitle content.

#### Concept

Client sends SRT file + configuration to translation API.  
Backend processes and streams back translated content.

#### Type

```typescript
// API Request Body
interface TranslationRequest {
	srtContent: string; // Raw SRT file content
	targetLanguage: string; // Target language code (e.g., "pt-BR")
	sourceLanguage?: string; // Source language or "auto"
	apiKeys: string[]; // Array of Gemini API keys
	filename?: string; // Original filename (for context extraction)
}
```

#### Example

```typescript
const request: TranslationRequest = {
	srtContent: '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n...',
	targetLanguage: 'pt-BR',
	sourceLanguage: 'en',
	apiKeys: ['AIza...', 'AIzb...'],
	filename: 'Inception.2010.1080p.BluRay.srt',
};
```

#### Business Rules

1. **At least one API key required:** Empty keys array = error
2. **Valid language codes:** Must be supported by translation provider
3. **SRT content must be valid:** Parsing must succeed
4. **Filename optional:** Used for context if provided

---

### TranslationProgress

> Real-time progress update streamed to client.

#### Concept

During translation, server streams progress events via SSE.  
Client updates UI in real-time with progress bar.

#### Type

```typescript
// app/api/route.ts

interface TranslationProgress {
	type:
		| 'progress'
		| 'quota_error'
		| 'retry'
		| 'complete'
		| 'error'
		| 'keep_alive';
	translated: number; // Number of entries translated so far
	total: number; // Total number of entries
	percentage: number; // Progress 0-100
	currentChunk?: number; // Current chunk index (1-indexed)
	totalChunks?: number; // Total number of chunks
	message?: string; // Status message or error description
	retryAfter?: number; // Seconds to wait before retry (quota errors)
	keepAliveUrl?: string; // URL to ping for keep-alive
	data?: string; // Final translated SRT content (only on complete)
}
```

#### Event Types

##### `progress`

Regular progress update during translation.

```typescript
{
  type: 'progress',
  translated: 45,
  total: 100,
  percentage: 45,
  currentChunk: 3,
  totalChunks: 7
}
```

##### `complete`

Translation finished successfully.

```typescript
{
  type: 'complete',
  translated: 100,
  total: 100,
  percentage: 100,
  data: "1\n00:00:01,000 --> 00:00:03,000\nOlá\n\n..." // Translated SRT
}
```

##### `error`

Unrecoverable error occurred.

```typescript
{
  type: 'error',
  message: "Failed to parse SRT: Invalid timestamp format at line 42"
}
```

##### `quota_error`

API quota exhausted for all keys.

```typescript
{
  type: 'quota_error',
  message: "All API keys have exhausted quota. Please try again in 5 minutes.",
  retryAfter: 300
}
```

##### `retry`

Retrying after a transient failure.

```typescript
{
  type: 'retry',
  message: "Rate limit hit. Retrying in 2 seconds...",
  currentChunk: 3,
  totalChunks: 7
}
```

##### `keep_alive`

Ping to keep connection alive (Vercel/Render timeout prevention).

```typescript
{
  type: 'keep_alive',
  keepAliveUrl: "https://srt-pt-ai.onrender.com/"
}
```

---

### AIProvider (Planned)

> Abstraction for different AI translation services.

#### Concept

Currently tightly coupled to Google Gemini.  
Future: Support multiple providers with unified interface.

#### Type

```typescript
// lib/ai-providers.ts (future)

interface AIProvider {
	name: string;
	translate(
		chunk: ParsedSubtitle[],
		context: TranslationContext,
		targetLang: string,
	): Promise<ParsedSubtitle[]>;

	checkQuota(): Promise<boolean>;

	getRateLimit(): RateLimitConfig;
}

interface TranslationContext {
	seriesName?: string;
	season?: number;
	episode?: number;
	movieName?: string;
	year?: number;
	sourceQuality?: string;
}

interface RateLimitConfig {
	requestsPerMinute: number;
	minDelayMs: number;
}
```

#### Implementations (Planned)

```typescript
class GeminiProvider implements AIProvider {
	name = 'Google Gemini';
	// ...
}

class OpenAIProvider implements AIProvider {
	name = 'OpenAI GPT-4';
	// ...
}

class ClaudeProvider implements AIProvider {
	name = 'Anthropic Claude';
	// ...
}

class OllamaProvider implements AIProvider {
	name = 'Ollama (Local)';
	// ...
}
```

---

### ValidationResult

> Result of subtitle validation (sample or full).

#### Concept

After translation, validate that:

- Timing matches original
- No entries missing
- Indices correct

#### Type

```typescript
// lib/srt.ts

interface ValidationResult {
	valid: boolean;
	errors: string[];
}
```

#### Example

```typescript
// Success
{
  valid: true,
  errors: []
}

// Failure
{
  valid: false,
  errors: [
    "Length mismatch: original has 100, translated has 98",
    "Timing mismatch at index 42: original [00:01:23,456 --> 00:01:26,789], translated [00:01:23,456 --> 00:01:27,000]"
  ]
}
```

#### Validation Strategies

##### Sample Validation (Default)

Check 5 key points:

- First entry (index 0)
- Last entry (index n-1)
- 25% point
- 50% point
- 75% point

**Rationale:** O(1) complexity, catches most errors

##### Full Validation (Optional)

Check every entry. O(n) complexity.

**Usage:** After translation, before returning to user.

---

## Business Rules

### Subtitle Timing Preservation

**Rule:** Translation MUST preserve exact timing from original.

**Rationale:**

- Sync with video is critical
- User expects translated file to drop-in replace original
- Any timing change breaks sync

**Enforcement:**

- Validate before returning to client
- Reject response if validation fails
- Re-translate chunk if timing mismatch detected

---

### Dialogue Formatting

**Rule:** Multi-line dialogue must preserve hyphen-prefix structure.

**Example:**

Original:

```
-Hello!
-Hi, how are you?
```

Must become:

```
-Olá!
-Oi, tudo bem?
```

NOT:

```
Olá! Oi, tudo bem?
```

**Enforcement:**

- Prompt instructs AI to preserve formatting
- Post-processing fixes concatenated dialogue (`formatDialogueLines()`)

---

### Translation Context

**Rule:** Always extract and provide context from filename if available.

**Context Types:**

- Series name + season + episode
- Movie name + year
- Quality (1080p, BluRay, etc.)

**Example:**

```
Filename: Inception.2010.1080p.BluRay.x264.srt

Context:
"Esta é uma legenda do filme 'Inception' (2010). Fonte: alta definição (1080p), Blu-ray."
```

**Rationale:**

- Improves translation quality (character names, terminology)
- Maintains consistency across episode series

---

### API Key Management

**Rule:** Rotate through keys, skip quota-failed keys for 5 minutes.

**Data Structure:**

```typescript
const quotaFailedKeys = new Map<string, number>(); // key -> timestamp
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function pickAvailableKey(keys: string[]): string | null {
	const now = Date.now();
	for (const key of keys) {
		const failedAt = quotaFailedKeys.get(key);
		if (!failedAt || now - failedAt > QUOTA_COOLDOWN_MS) {
			return key;
		}
	}
	return null; // All keys on cooldown
}
```

**Rationale:**

- Maximize throughput with multiple free-tier keys
- Graceful degradation instead of hard failure

---

### Rate Limiting

**Rule:** Enforce 10 RPM per API key with 500ms minimum delay.

**Data Structure:**

```typescript
interface RequestHistory {
	timestamps: number[]; // Last 60 seconds of requests
	lastRequest: number; // Timestamp of last request
}

const keyRequestHistory = new Map<string, RequestHistory>();
```

**Algorithm:**

```typescript
async function waitForRateLimit(apiKey: string): Promise<void> {
	const now = Date.now();
	const history = keyRequestHistory.get(apiKey) || {
		timestamps: [],
		lastRequest: 0,
	};

	// Remove requests older than 60 seconds
	history.timestamps = history.timestamps.filter((t) => now - t < 60000);

	// Check if we're at the limit
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

**Rationale:**

- Prevents 429 (TooManyRequests) errors
- Maximizes throughput without triggering rate limits

---

## Type Hierarchy

```
ParsedSubtitle
  ↓
Segment (display)
  ↓
Chunk (array of ParsedSubtitle)
  ↓
TranslationRequest (with context)
  ↓
AIProvider.translate()
  ↓
ParsedSubtitle[] (translated)
  ↓
ValidationResult
  ↓
TranslationProgress (complete)
```

---

## Future: Desktop Database Schema

When desktop version is implemented, add local database:

```sql
-- Translation cache
CREATE TABLE translations (
  id TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL,
  target_language TEXT NOT NULL,
  translated_content TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_translations_hash ON translations(source_hash, target_language);

-- Translation jobs
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'processing' | 'complete' | 'error'
  progress INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- AI provider credentials
CREATE TABLE credentials (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 1
);
```

---

## Related Docs

- [Architecture](./architecture.md) — System design
- [Project Structure](./project_structure.md) — Where everything lives
- [AI-APIS-STRATEGY.md](../AI-APIS-STRATEGY.md) — AI provider details
