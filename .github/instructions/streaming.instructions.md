---
applyTo: 'app/api/**/*.ts'
---

# Streaming Instructions — LegendAI

> Guidelines for implementing Server-Sent Events (SSE) and streaming responses.

---

## Why Streaming?

### Problem: Serverless Function Timeouts

**Vercel free tier:** 10-second timeout for serverless functions.  
**Typical translation:** 5-10 minutes for a full subtitle file.

**Solution:** Use Server-Sent Events (SSE) to stream progress.  
The connection stays open, sending periodic updates, preventing timeout.

---

## Server-Sent Events (SSE)

### What is SSE?

**One-way communication** from server to client over HTTP.

- Server sends events as plain text
- Client receives events in real-time
- Connection stays open (no polling needed)
- Automatic reconnection on disconnect

### SSE vs WebSocket

| Feature    | SSE              | WebSocket      |
| ---------- | ---------------- | -------------- |
| Direction  | Server → Client  | Bidirectional  |
| Protocol   | HTTP             | Custom (ws://) |
| Reconnect  | Automatic        | Manual         |
| Complexity | Low              | Medium         |
| Best for   | Progress updates | Real-time chat |

**For LegendAI:** SSE is perfect — we only need server → client updates.

---

## Implementation

### Server Side (API Route)

```typescript
// app/api/route.ts

export async function POST(req: Request) {
	const { srtContent, targetLanguage, apiKeys, filename } = await req.json();

	// Validate inputs
	if (!srtContent || !targetLanguage || !apiKeys || apiKeys.length === 0) {
		return Response.json({ error: 'Missing required fields' }, { status: 400 });
	}

	// Create SSE stream
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Helper to send SSE events
			function send(data: TranslationProgress) {
				const message = `data: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			}

			try {
				// Parse SRT
				const subtitles = parseSRT(srtContent);
				const chunks = chunkSubtitles(subtitles, 15);
				const context = extractFileContext(filename);

				let translatedSubs: ParsedSubtitle[] = [];
				let currentKeyIndex = 0;

				// Translate each chunk
				for (let i = 0; i < chunks.length; i++) {
					const chunk = chunks[i];

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

					// Pick API key
					const apiKey = pickAvailableKey(apiKeys, currentKeyIndex);
					if (!apiKey) {
						send({
							type: 'quota_error',
							message: 'All API keys exhausted quota. Please wait 5 minutes.',
							translated: translatedSubs.length,
							total: subtitles.length,
							percentage: Math.round(
								(translatedSubs.length / subtitles.length) * 100,
							),
							retryAfter: 300,
						});
						controller.close();
						return;
					}

					// Translate chunk
					try {
						const translatedChunk = await translateChunk(
							chunk,
							context,
							targetLanguage,
							apiKey,
						);

						translatedSubs.push(...translatedChunk);
					} catch (error) {
						// Handle errors (quota, rate limit, etc.)
						if (isQuotaError(error)) {
							markQuotaFailed(apiKey);
							currentKeyIndex++;
							i--; // Retry this chunk with next key
							continue;
						}

						// Unrecoverable error
						send({
							type: 'error',
							message: error instanceof Error ? error.message : 'Unknown error',
							translated: translatedSubs.length,
							total: subtitles.length,
							percentage: Math.round(
								(translatedSubs.length / subtitles.length) * 100,
							),
						});
						controller.close();
						return;
					}
				}

				// Validation
				const validation = sampleValidation(subtitles, translatedSubs);
				if (!validation.valid) {
					send({
						type: 'error',
						message: `Validation failed: ${validation.errors.join(', ')}`,
						translated: translatedSubs.length,
						total: subtitles.length,
						percentage: 100,
					});
					controller.close();
					return;
				}

				// Success
				const translatedContent = buildSRT(translatedSubs);
				send({
					type: 'complete',
					translated: translatedSubs.length,
					total: subtitles.length,
					percentage: 100,
					data: translatedContent,
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

	// Return SSE response
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

### Client Side (React Component)

```typescript
// components/Form.tsx (simplified)

function Form() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'translating' | 'complete' | 'error'>('idle');
  const [translatedContent, setTranslatedContent] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleUpload(file: File) {
    setStatus('translating');
    setProgress(0);
    setErrorMessage('');

    const srtContent = await file.text();

    // Start SSE connection
    const response = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        srtContent,
        targetLanguage: 'pt-BR',
        apiKeys: ['key1', 'key2'],
        filename: file.name
      })
    });

    if (!response.ok) {
      const error = await response.json();
      setErrorMessage(error.error || 'Translation failed');
      setStatus('error');
      return;
    }

    // Read SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Decode chunk
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5)) as TranslationProgress;

          switch (data.type) {
            case 'progress':
              setProgress(data.percentage);
              break;

            case 'complete':
              setProgress(100);
              setTranslatedContent(data.data!);
              setStatus('complete');
              break;

            case 'error':
              setErrorMessage(data.message!);
              setStatus('error');
              break;

            case 'quota_error':
              setErrorMessage(
                `Quota exhausted. Retry in ${data.retryAfter} seconds.`
              );
              setStatus('error');
              break;
          }
        }
      }
    }
  }

  return (
    <div>
      {status === 'translating' && (
        <ProgressBar progress={progress} />
      )}

      {status === 'complete' && (
        <DownloadButton content={translatedContent} filename="translated.srt" />
      )}

      {status === 'error' && (
        <ErrorMessage message={errorMessage} />
      )}
    </div>
  );
}
```

---

## Event Types

### `progress`

Sent periodically during translation.

```typescript
{
  type: 'progress',
  translated: 45,      // Number of subtitles translated
  total: 100,          // Total number of subtitles
  percentage: 45,      // Progress as percentage (0-100)
  currentChunk: 3,     // Current chunk being processed
  totalChunks: 7       // Total number of chunks
}
```

---

### `complete`

Sent when translation finishes successfully.

```typescript
{
  type: 'complete',
  translated: 100,
  total: 100,
  percentage: 100,
  data: "1\n00:00:01,000 --> 00:00:03,000\nOlá\n\n..." // Full translated SRT
}
```

---

### `error`

Sent when an unrecoverable error occurs.

```typescript
{
  type: 'error',
  message: 'Failed to parse SRT: Invalid timestamp at line 42',
  translated: 45,      // How many were completed before error
  total: 100,
  percentage: 45
}
```

---

### `quota_error`

Sent when all API keys have exhausted quota.

```typescript
{
  type: 'quota_error',
  message: 'All API keys exhausted. Please wait 5 minutes.',
  translated: 50,
  total: 100,
  percentage: 50,
  retryAfter: 300      // Seconds to wait before retrying
}
```

---

### `retry`

Sent when retrying after a transient failure.

```typescript
{
  type: 'retry',
  message: 'Rate limit hit, retrying in 2 seconds...',
  currentChunk: 3,
  totalChunks: 7,
  translated: 40,
  total: 100,
  percentage: 40
}
```

---

### `keep_alive`

Sent periodically to prevent connection timeout.

```typescript
{
  type: 'keep_alive',
  keepAliveUrl: 'https://srt-pt-ai.onrender.com/',
  translated: 0,
  total: 0,
  percentage: 0
}
```

**Frequency:** Every 3 minutes.

**Purpose:** Keep connection alive on platforms with aggressive timeouts (Render, etc.).

**Implementation:**

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

// Call before each chunk translation
maybeKeepAlive(send);
```

---

## Error Handling

### Connection Errors

**Problem:** Network interruption, server restart, etc.

**Solution:** Use `EventSource` with automatic reconnection.

```typescript
// Alternative client implementation using EventSource

function useSSE(url: string, body: any) {
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState('idle');

	useEffect(() => {
		// Note: EventSource doesn't support POST, need server-side workaround
		// or use fetch with ReadableStream (current approach)

		const eventSource = new EventSource(url);

		eventSource.onmessage = (event) => {
			const data = JSON.parse(event.data);
			handleProgressEvent(data);
		};

		eventSource.onerror = (error) => {
			console.error('SSE error:', error);
			eventSource.close();
			setStatus('error');
		};

		return () => eventSource.close();
	}, [url]);

	return { progress, status };
}
```

**Current approach (fetch + ReadableStream):** No automatic reconnection, but supports POST with body.

---

### Timeout Handling

**Client-side timeout:** If no events received for 30 seconds, assume connection dead.

```typescript
let lastEventTime = Date.now();
const TIMEOUT_MS = 30 * 1000; // 30 seconds

const timeoutChecker = setInterval(() => {
	const now = Date.now();
	if (now - lastEventTime > TIMEOUT_MS) {
		console.error('Connection timeout — no events received');
		reader.cancel();
		clearInterval(timeoutChecker);
		setStatus('error');
		setErrorMessage('Connection timeout');
	}
}, 5000); // Check every 5 seconds

// Reset timer on each event
for (const line of lines) {
	if (line.startsWith('data:')) {
		lastEventTime = Date.now();
		// ...
	}
}
```

---

## Performance Optimization

### Buffering

**Problem:** Rapid events can overwhelm UI updates.

**Solution:** Buffer events and update UI at max 60 FPS.

```typescript
let eventBuffer: TranslationProgress[] = [];
let rafId: number | null = null;

function enqueueEvent(data: TranslationProgress) {
	eventBuffer.push(data);

	if (!rafId) {
		rafId = requestAnimationFrame(flushEvents);
	}
}

function flushEvents() {
	rafId = null;

	if (eventBuffer.length === 0) return;

	// Process all buffered events
	for (const data of eventBuffer) {
		handleProgressEvent(data);
	}

	eventBuffer = [];
}
```

---

### Debouncing Progress Updates

**Problem:** UI re-renders on every progress event.

**Solution:** Only update UI if percentage changed or event is non-progress.

```typescript
let lastPercentage = 0;

function handleProgressEvent(data: TranslationProgress) {
	if (data.type === 'progress') {
		// Only update if percentage changed
		if (data.percentage !== lastPercentage) {
			setProgress(data.percentage);
			lastPercentage = data.percentage;
		}
	} else {
		// Non-progress events always trigger update
		handleEvent(data);
	}
}
```

---

## Testing

### Manual Testing

**Test script for SSE endpoint:**

```javascript
// scripts/test/test-sse.js

async function testSSE() {
	const srtContent = `1
00:00:01,000 --> 00:00:03,000
Hello

2
00:00:03,500 --> 00:00:06,000
How are you?
`;

	const response = await fetch('http://localhost:3000/api', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			srtContent,
			targetLanguage: 'pt-BR',
			apiKeys: [process.env.GOOGLE_API_KEY],
			filename: 'test.srt',
		}),
	});

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	console.log('Listening for SSE events...\n');

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value);
		const lines = chunk.split('\n').filter((l) => l.startsWith('data:'));

		for (const line of lines) {
			const data = JSON.parse(line.slice(5));
			console.log(`[${data.type}]`, data);
		}
	}

	console.log('\nSSE stream ended.');
}

testSSE().catch(console.error);
```

**Run:**

```bash
node scripts/test/test-sse.js
```

---

### Automated Testing

```typescript
// app/api/route.test.ts

describe('POST /api', () => {
	it('should stream translation progress', async () => {
		const response = await fetch('/api', {
			method: 'POST',
			body: JSON.stringify({
				srtContent: SAMPLE_SRT,
				targetLanguage: 'pt-BR',
				apiKeys: [TEST_API_KEY],
				filename: 'test.srt',
			}),
		});

		expect(response.ok).toBe(true);
		expect(response.headers.get('content-type')).toBe('text/event-stream');

		const events: TranslationProgress[] = [];
		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split('\n').filter((l) => l.startsWith('data:'));

			for (const line of lines) {
				events.push(JSON.parse(line.slice(5)));
			}
		}

		// Verify event sequence
		expect(events[0].type).toBe('progress');
		expect(events[events.length - 1].type).toBe('complete');

		// Verify progress increases
		for (let i = 1; i < events.length - 1; i++) {
			if (events[i].type === 'progress') {
				expect(events[i].percentage).toBeGreaterThanOrEqual(
					events[i - 1].percentage,
				);
			}
		}
	});
});
```

---

## Common Pitfalls

### ❌ Forgetting `Content-Type`

```typescript
// ❌ Bad - client won't recognize as SSE
return new Response(stream);

// ✅ Good
return new Response(stream, {
	headers: { 'Content-Type': 'text/event-stream' },
});
```

---

### ❌ Not Closing Controller

```typescript
// ❌ Bad - connection stays open forever
send({ type: 'complete', ... });
// Forgot to close!

// ✅ Good
send({ type: 'complete', ... });
controller.close();
```

---

### ❌ Sending Invalid JSON

```typescript
// ❌ Bad - will crash client parser
const message = `data: invalid json\n\n`;
controller.enqueue(encoder.encode(message));

// ✅ Good - always JSON.stringify
const message = `data: ${JSON.stringify(data)}\n\n`;
controller.enqueue(encoder.encode(message));
```

---

### ❌ Not Handling Backpressure

```typescript
// ❌ Bad - can overwhelm client with events
for (let i = 0; i < 10000; i++) {
  controller.enqueue(encoder.encode(`data: ${i}\n\n`));
}

// ✅ Good - respect client's ability to consume
for (let i = 0; i < chunks.length; i++) {
  await wait(); // Let client process
  send({ type: 'progress', ... });
}
```

---

## Best Practices

1. **Always set `Content-Type: text/event-stream`**
2. **Always `controller.close()` when done**
3. **Send `keep_alive` every 3 minutes**
4. **Buffer rapid events on client (RAF)**
5. **Implement client-side timeout (30s)**
6. **Test with slow connections** (Chrome DevTools throttling)
7. **Log all events for debugging** (removable with env var)
8. **Graceful error handling** (send error event, then close)
9. **Validate JSON before sending**
10. **Use `\n\n` to separate events** (SSE spec)

---

## Future Improvements

### WebSocket Support (Desktop)

For desktop app, consider WebSocket for bidirectional communication:

- Pause/resume translation
- Cancel translation
- Real-time progress for multiple files

```typescript
// Future: WebSocket implementation
const ws = new WebSocket('ws://localhost:3000/translate');

ws.onopen = () => {
	ws.send(JSON.stringify({ action: 'start', ...config }));
};

ws.onmessage = (event) => {
	const data = JSON.parse(event.data);
	handleProgressEvent(data);
};

// User clicks pause
function pauseTranslation() {
	ws.send(JSON.stringify({ action: 'pause' }));
}
```

---

## Summary

1. **Use SSE for progress updates** — Keeps connection alive
2. **Implement `keep_alive` events** — Prevent platform timeouts
3. **Handle all event types** — progress, complete, error, quota_error, retry
4. **Buffer rapid events** — Use `requestAnimationFrame` on client
5. **Implement timeout detection** — 30s with no events = dead connection
6. **Test thoroughly** — Manual + automated tests
7. **Close stream properly** — Always call `controller.close()`
8. **Validate all JSON** — Prevent client-side crashes
9. **Log for debugging** — Removable with env var
10. **Consider WebSocket for desktop** — Bidirectional control
