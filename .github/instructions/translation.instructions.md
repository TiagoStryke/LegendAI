---
applyTo: 'app/api/**/*.ts'
---

# Translation Instructions — LegendAI

> Rules for implementing and maintaining subtitle translation logic.

---

## Core Principles

### 1. Timing is Sacred

**NEVER modify timestamps during translation.**

```typescript
// ❌ FORBIDDEN - Never change timing
function translate(sub: ParsedSubtitle): ParsedSubtitle {
	return {
		...sub,
		startTime: adjustTiming(sub.startTime), // NO!
		text: await translateText(sub.text),
	};
}

// ✅ CORRECT - Preserve exact timing
function translate(sub: ParsedSubtitle): ParsedSubtitle {
	return {
		...sub,
		startTime: sub.startTime, // Unchanged
		endTime: sub.endTime, // Unchanged
		text: await translateText(sub.text),
	};
}
```

**Rationale:** Subtitle files must sync perfectly with video. Any timing change breaks sync.

---

### 2. Preserve Formatting

**Maintain dialogue structure (hyphen-prefixed lines).**

```
Original:
-Hello!
-Hi, how are you?

✅ Good translation:
-Olá!
-Oi, tudo bem?

❌ Bad translation (loses structure):
Olá! Oi, tudo bem?
```

**Implementation:**

```typescript
function formatDialogueLines(text: string): string {
	// Detect concatenated dialogue (text with " -" in middle)
	const concatenatedDialoguePattern = /\s+-[^\s-]/g;
	const matches = text.match(concatenatedDialoguePattern);

	if (matches && matches.length > 0) {
		// Split dialogue back into separate lines
		return text
			.split(/(\s+-[^-])/)
			.reduce((result, part, index, array) => {
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

### 3. Context Awareness

**Always extract and use context from filename.**

```typescript
function extractFileContext(filename: string): string {
	// Series: Dexter.S01E05.srt → "Série 'Dexter', temporada 1, episódio 5"
	// Movie: Inception.2010.1080p.srt → "Filme 'Inception' (2010)"

	const seriesPattern = /(.+?)\.s(\d+)e(\d+)/i;
	const moviePattern = /(.+?)\.(\d{4})/i;

	const seriesMatch = filename.match(seriesPattern);
	if (seriesMatch) {
		const [, name, season, episode] = seriesMatch;
		return `Esta é uma legenda da série "${cleanName(name)}", temporada ${season}, episódio ${episode}.`;
	}

	const movieMatch = filename.match(moviePattern);
	if (movieMatch) {
		const [, name, year] = movieMatch;
		return `Esta é uma legenda do filme "${cleanName(name)}" (${year}).`;
	}

	return '';
}
```

**Rationale:**

- Improves translation accuracy (character names, show-specific terms)
- Maintains consistency across episodes
- Better handling of proper nouns

---

## Chunking Strategy

### Chunk Size

**Use 15 subtitles per chunk by default.**

```typescript
const CHUNK_SIZE = 15;

function chunkSubtitles(
	subtitles: ParsedSubtitle[],
	chunkSize: number = CHUNK_SIZE,
): ParsedSubtitle[][] {
	const chunks: ParsedSubtitle[][] = [];
	for (let i = 0; i < subtitles.length; i += chunkSize) {
		chunks.push(subtitles.slice(i, i + chunkSize));
	}
	return chunks;
}
```

**Rationale:**

- Gemini 2.0 Flash truncates after ~400 tokens
- 15 subtitles ≈ 300-400 tokens (safe margin)
- Small enough to prevent truncation
- Large enough to minimize API calls

**When to adjust:**

- If truncation occurs → reduce to 10
- If subtitles are very short (e.g., "[music playing]") → increase to 20
- Never exceed 20 subtitles per chunk

---

### Chunk Validation

**Always validate chunk output before merging.**

```typescript
interface ChunkValidationResult {
	valid: boolean;
	errors: string[];
	originalChunk: ParsedSubtitle[];
	translatedChunk: ParsedSubtitle[];
}

function validateChunk(
	original: ParsedSubtitle[],
	translated: ParsedSubtitle[],
): ChunkValidationResult {
	const errors: string[] = [];

	// Length check
	if (original.length !== translated.length) {
		errors.push(
			`Length mismatch: expected ${original.length}, got ${translated.length}`,
		);
	}

	// Timing check (for each entry)
	for (let i = 0; i < Math.min(original.length, translated.length); i++) {
		if (original[i].startTime !== translated[i].startTime) {
			errors.push(`Start time mismatch at index ${i}`);
		}
		if (original[i].endTime !== translated[i].endTime) {
			errors.push(`End time mismatch at index ${i}`);
		}
		if (original[i].index !== translated[i].index) {
			errors.push(`Index mismatch at position ${i}`);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		originalChunk: original,
		translatedChunk: translated,
	};
}
```

**On validation failure:**

1. Log the error with full context
2. Retry the chunk (up to 3 times)
3. If still failing, return original text for that chunk (graceful degradation)

---

## AI Prompt Engineering

### Prompt Structure

**Every translation request MUST include:**

1. **Context** (from filename)
2. **Task** (translate X entries)
3. **Format requirements** (preserve timing, dialogue structure)
4. **Output format** (SRT format)

```typescript
const prompt = `
${context}

Traduza as seguintes legendas de ${sourceLanguage} para ${targetLanguage}.

REGRAS CRÍTICAS:
1. Preserve EXATAMENTE os timestamps originais (##:##:##,### --> ##:##:##,###)
2. Preserve EXATAMENTE os números de índice
3. Mantenha a estrutura de diálogo (linhas com hífen no início)
4. Traduza APENAS o texto, nunca os timestamps
5. Retorne no formato SRT completo

Legendas a traduzir:

${chunkText}

Retorne APENAS as legendas traduzidas no formato SRT, sem texto adicional.
`;
```

---

### Dialogue Preservation

**Instruct AI explicitly about dialogue formatting.**

```typescript
const dialogueRules = `
Se houver linhas de diálogo (começando com hífen "-"), mantenha cada fala em uma linha separada:

Exemplo CORRETO:
-Olá!
-Oi, tudo bem?

Exemplo INCORRETO (não faça isso):
-Olá! -Oi, tudo bem?
`;
```

---

### Quality Assurance

**Post-process AI output to fix common issues.**

```typescript
function postProcessTranslation(
	translated: ParsedSubtitle[],
): ParsedSubtitle[] {
	return translated.map((sub) => ({
		...sub,
		text: fixCommonIssues(sub.text),
	}));
}

function fixCommonIssues(text: string): string {
	let fixed = text;

	// Fix concatenated dialogue
	fixed = formatDialogueLines(fixed);

	// Remove extra spaces
	fixed = fixed.replace(/\s+/g, ' ').trim();

	// Fix Portuguese punctuation (space before ?)
	fixed = fixed.replace(/\s+\?/g, '?');

	// Ensure proper capitalization after dialogue hyphen
	fixed = fixed.replace(
		/-([a-z])/g,
		(match, letter) => `-${letter.toUpperCase()}`,
	);

	return fixed;
}
```

---

## API Integration

### Rate Limiting

**Enforce strict rate limits to avoid 429 errors.**

```typescript
const MAX_RPM = 10; // Requests per minute per API key
const MIN_DELAY_MS = 500; // Minimum delay between requests

interface RateLimiter {
	wait(apiKey: string): Promise<void>;
	recordRequest(apiKey: string): void;
}

const rateLimiter: RateLimiter = {
	async wait(apiKey: string): Promise<void> {
		const history = keyRequestHistory.get(apiKey) || {
			timestamps: [],
			lastRequest: 0,
		};

		const now = Date.now();

		// Remove old requests (> 60s ago)
		history.timestamps = history.timestamps.filter((t) => now - t < 60000);

		// Check if at limit
		if (history.timestamps.length >= MAX_RPM) {
			const oldestRequest = history.timestamps[0];
			const waitTime = 60000 - (now - oldestRequest);
			if (waitTime > 0) {
				await sleep(waitTime);
			}
		}

		// Enforce minimum delay
		const timeSinceLastRequest = now - history.lastRequest;
		if (timeSinceLastRequest < MIN_DELAY_MS) {
			await sleep(MIN_DELAY_MS - timeSinceLastRequest);
		}
	},

	recordRequest(apiKey: string): void {
		const now = Date.now();
		const history = keyRequestHistory.get(apiKey) || {
			timestamps: [],
			lastRequest: 0,
		};

		history.timestamps.push(now);
		history.lastRequest = now;
		keyRequestHistory.set(apiKey, history);
	},
};
```

---

### Quota Management

**Track quota failures per API key, implement cooldown.**

```typescript
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const quotaFailedKeys = new Map<string, number>();

function markQuotaFailed(apiKey: string): void {
	quotaFailedKeys.set(apiKey, Date.now());
}

function isKeyAvailable(apiKey: string): boolean {
	const failedAt = quotaFailedKeys.get(apiKey);
	if (!failedAt) return true;

	const now = Date.now();
	const cooldownRemaining = QUOTA_COOLDOWN_MS - (now - failedAt);

	if (cooldownRemaining <= 0) {
		// Cooldown expired, clear failure
		quotaFailedKeys.delete(apiKey);
		return true;
	}

	return false;
}

function pickAvailableKey(apiKeys: string[]): string | null {
	for (const key of apiKeys) {
		if (isKeyAvailable(key)) {
			return key;
		}
	}
	return null; // All keys on cooldown
}
```

**Error handling:**

```typescript
try {
	const result = await translateChunk(chunk, apiKey);
	return result;
} catch (error) {
	if (isQuotaError(error)) {
		markQuotaFailed(apiKey);
		const nextKey = pickAvailableKey(apiKeys.filter((k) => k !== apiKey));

		if (!nextKey) {
			throw new Error('All API keys exhausted quota. Try again in 5 minutes.');
		}

		// Retry with next key
		return await translateChunk(chunk, nextKey);
	}

	throw error;
}

function isQuotaError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.includes('quota') ||
			error.message.includes('RESOURCE_EXHAUSTED'))
	);
}
```

---

## Streaming Progress

### Server-Sent Events (SSE)

**Always use streaming for long translations.**

```typescript
export async function POST(req: Request) {
	const { srtContent, targetLanguage, apiKeys } = await req.json();

	// Set up SSE stream
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			function send(data: TranslationProgress) {
				const message = `data: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			}

			try {
				const subtitles = parseSRT(srtContent);
				const chunks = chunkSubtitles(subtitles);

				let translatedSubs: ParsedSubtitle[] = [];

				for (let i = 0; i < chunks.length; i++) {
					// Send progress
					send({
						type: 'progress',
						translated: translatedSubs.length,
						total: subtitles.length,
						percentage: Math.round(
							(translatedSubs.length / subtitles.length) * 100,
						),
						currentChunk: i + 1,
						totalChunks: chunks.length,
					});

					// Translate chunk
					const translatedChunk = await translateChunk(chunks[i], apiKeys);
					translatedSubs.push(...translatedChunk);
				}

				// Send complete
				send({
					type: 'complete',
					translated: translatedSubs.length,
					total: subtitles.length,
					percentage: 100,
					data: buildSRT(translatedSubs),
				});

				controller.close();
			} catch (error) {
				send({
					type: 'error',
					message: error instanceof Error ? error.message : 'Unknown error',
					translated: 0,
					total: 0,
					percentage: 0,
				});
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
}
```

---

### Keep-Alive (Vercel Timeout Prevention)

**Send keep-alive pings every 3 minutes.**

```typescript
const KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
let lastKeepAlive = Date.now();

function maybeKeepAlive(send: (data: TranslationProgress) => void): void {
	const now = Date.now();
	if (now - lastKeepAlive > KEEP_ALIVE_INTERVAL_MS) {
		send({
			type: 'keep_alive',
			keepAliveUrl: process.env.KEEP_ALIVE_URL || '',
			translated: 0,
			total: 0,
			percentage: 0,
		});
		lastKeepAlive = now;
	}
}
```

---

## Testing

### Unit Tests

**Test all pure functions thoroughly.**

```typescript
// lib/srt.test.ts
describe('formatDialogueLines', () => {
	it('should split concatenated dialogue', () => {
		const input = '-Hello! -How are you?';
		const output = formatDialogueLines(input);
		expect(output).toBe('-Hello!\n-How are you?');
	});

	it('should preserve single dialogue line', () => {
		const input = '-Hello!';
		const output = formatDialogueLines(input);
		expect(output).toBe('-Hello!');
	});

	it('should not split compound words', () => {
		const input = 'arco-íris';
		const output = formatDialogueLines(input);
		expect(output).toBe('arco-íris');
	});
});
```

---

### Integration Tests

**Test full translation pipeline with real files.**

```typescript
// scripts/test/test-translation.js
import { readFile, writeFile } from 'fs/promises';
import { parseSRT, buildSRT } from '@/lib/srt';

async function testTranslation() {
	// Load test file
	const original = await readFile('scripts/test/test-short.srt', 'utf-8');
	const originalSubs = parseSRT(original);

	// Translate
	const response = await fetch('http://localhost:3000/api', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			srtContent: original,
			targetLanguage: 'pt-BR',
			apiKeys: [process.env.GOOGLE_API_KEY],
			filename: 'test-short.srt',
		}),
	});

	// Collect SSE events
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let translatedContent = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value);
		const lines = chunk.split('\n').filter((l) => l.startsWith('data:'));

		for (const line of lines) {
			const data = JSON.parse(line.replace('data: ', ''));
			if (data.type === 'complete') {
				translatedContent = data.data;
			}
		}
	}

	// Validate
	const translatedSubs = parseSRT(translatedContent);

	console.assert(
		originalSubs.length === translatedSubs.length,
		'Length mismatch',
	);

	for (let i = 0; i < originalSubs.length; i++) {
		console.assert(
			originalSubs[i].startTime === translatedSubs[i].startTime,
			`Timing mismatch at index ${i}`,
		);
	}

	// Save result
	await writeFile('scripts/test/test-short.translated.srt', translatedContent);
	console.log('✅ Translation test passed');
}
```

---

## Common Pitfalls

### ❌ Don't Trust AI Output Blindly

AI can:

- Merge dialogue lines incorrectly
- Change timestamps (even when instructed not to)
- Skip entries
- Add extra entries

**Always validate output before returning to user.**

---

### ❌ Don't Forget Error Context

```typescript
// ❌ Bad
throw new Error('Translation failed');

// ✅ Good
throw new Error(
	`Translation failed for chunk ${chunkIndex}/${totalChunks}: ${error.message}`,
);
```

---

### ❌ Don't Block on Network Calls

```typescript
// ❌ Bad - sequential (slow)
for (const chunk of chunks) {
	const translated = await translateChunk(chunk);
	result.push(translated);
}

// ✅ Good (future) - parallel with rate limiting
const translated = await Promise.all(
	chunks.map((chunk, i) =>
		rateLimiter.schedule(() => translateChunk(chunk), i * 1000),
	),
);
```

---

## Summary

1. **Never modify timestamps** — Sacred rule
2. **Preserve dialogue structure** — Hyphens, line breaks
3. **Use context** — Filename → better translations
4. **Chunk wisely** — 15 subtitles per chunk
5. **Validate everything** — AI output is never perfect
6. **Rate limit strictly** — 10 RPM, 500ms min delay
7. **Manage quota** — Track failures, cooldown, rotate keys
8. **Stream progress** — SSE for long translations
9. **Test thoroughly** — Unit + integration tests
10. **Handle errors gracefully** — Never lose user's data
