---
applyTo: 'app/api/**/*.ts'
---

# AI Provider Instructions — LegendAI

> Guidelines for integrating and managing AI translation providers.

---

## Provider Abstraction

### Interface Design

**All AI providers must implement a common interface.**

```typescript
// lib/ai-providers.ts

interface AIProvider {
	/** Provider name for display */
	name: string;

	/** Provider identifier (kebab-case) */
	id: string;

	/**
	 * Translate a chunk of subtitles
	 * @param chunk - Subtitles to translate
	 * @param context - Translation context (series name, movie, etc.)
	 * @param targetLang - Target language code
	 * @param sourceLang - Source language code or 'auto'
	 * @param apiKey - API key for this provider
	 * @returns Translated subtitles with preserved timing
	 */
	translate(
		chunk: ParsedSubtitle[],
		context: TranslationContext,
		targetLang: string,
		sourceLang: string,
		apiKey: string,
	): Promise<ParsedSubtitle[]>;

	/**
	 * Check if API key has available quota
	 * @param apiKey - API key to check
	 * @returns true if quota available, false otherwise
	 */
	checkQuota(apiKey: string): Promise<boolean>;

	/**
	 * Get rate limit configuration for this provider
	 * @returns Rate limit config
	 */
	getRateLimit(): RateLimitConfig;

	/**
	 * Estimate cost for translating N subtitles
	 * @param subtitleCount - Number of subtitle entries
	 * @returns Estimated cost in USD (0 for free tier)
	 */
	estimateCost(subtitleCount: number): number;

	/**
	 * Validate API key format (quick client-side check)
	 * @param apiKey - Key to validate
	 * @returns true if format is valid
	 */
	validateKeyFormat(apiKey: string): boolean;
}

interface TranslationContext {
	filename?: string;
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
	batchSize?: number; // How many chunks can be sent in one request
}
```

---

## Current Provider: Google Gemini

### Configuration

```typescript
class GeminiProvider implements AIProvider {
	name = 'Google Gemini';
	id = 'gemini';

	private readonly model = 'gemini-2.0-flash-exp';
	private readonly maxTokensPerChunk = 400;

	getRateLimit(): RateLimitConfig {
		return {
			requestsPerMinute: 10,
			minDelayMs: 500,
			batchSize: 1, // No batching support
		};
	}

	validateKeyFormat(apiKey: string): boolean {
		return apiKey.startsWith('AIza') && apiKey.length === 39;
	}

	estimateCost(subtitleCount: number): number {
		return 0; // Free tier
	}

	async checkQuota(apiKey: string): Promise<boolean> {
		// Quick test request to check quota
		try {
			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1/models/${this.model}:generateContent?key=${apiKey}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						contents: [
							{
								parts: [{ text: 'test' }],
							},
						],
					}),
				},
			);

			return response.ok;
		} catch {
			return false;
		}
	}

	async translate(
		chunk: ParsedSubtitle[],
		context: TranslationContext,
		targetLang: string,
		sourceLang: string,
		apiKey: string,
	): Promise<ParsedSubtitle[]> {
		const prompt = this.buildPrompt(chunk, context, targetLang, sourceLang);

		const response = await generateText({
			model: google(this.model, { apiKey }),
			prompt,
			maxTokens: this.maxTokensPerChunk,
		});

		return this.parseResponse(response.text, chunk);
	}

	private buildPrompt(
		chunk: ParsedSubtitle[],
		context: TranslationContext,
		targetLang: string,
		sourceLang: string,
	): string {
		const contextText = this.formatContext(context);
		const chunkText = buildSRT(chunk);

		return `
${contextText}

Traduza as seguintes legendas de ${sourceLang} para ${targetLang}.

REGRAS CRÍTICAS:
1. Preserve EXATAMENTE os timestamps (##:##:##,### --> ##:##:##,###)
2. Preserve EXATAMENTE os números de índice
3. Mantenha a estrutura de diálogo (linhas com hífen)
4. Traduza APENAS o texto, nunca os timestamps
5. Retorne no formato SRT completo

Legendas:

${chunkText}

Retorne APENAS as legendas traduzidas, sem texto adicional.
`.trim();
	}

	private formatContext(context: TranslationContext): string {
		if (context.seriesName) {
			return `Esta é uma legenda da série "${context.seriesName}", temporada ${context.season}, episódio ${context.episode}.`;
		}
		if (context.movieName) {
			return `Esta é uma legenda do filme "${context.movieName}" (${context.year}).`;
		}
		return '';
	}

	private parseResponse(
		response: string,
		originalChunk: ParsedSubtitle[],
	): ParsedSubtitle[] {
		try {
			const translated = parseSRT(response);

			// Validate
			if (translated.length !== originalChunk.length) {
				throw new Error('Length mismatch after translation');
			}

			// Ensure timing matches
			for (let i = 0; i < translated.length; i++) {
				if (
					translated[i].startTime !== originalChunk[i].startTime ||
					translated[i].endTime !== originalChunk[i].endTime
				) {
					console.warn(`Timing mismatch at index ${i}, correcting...`);
					translated[i].startTime = originalChunk[i].startTime;
					translated[i].endTime = originalChunk[i].endTime;
				}
			}

			return translated;
		} catch (error) {
			console.error('Failed to parse Gemini response:', error);
			console.error('Raw response:', response);
			throw error;
		}
	}
}

export const geminiProvider = new GeminiProvider();
```

---

## Future Provider: OpenAI GPT

### Configuration

```typescript
class OpenAIProvider implements AIProvider {
	name = 'OpenAI GPT-4';
	id = 'openai';

	private readonly model = 'gpt-4-turbo';

	getRateLimit(): RateLimitConfig {
		return {
			requestsPerMinute: 500, // Much higher limit
			minDelayMs: 100,
			batchSize: 1,
		};
	}

	validateKeyFormat(apiKey: string): boolean {
		return apiKey.startsWith('sk-') && apiKey.length > 40;
	}

	estimateCost(subtitleCount: number): number {
		// Rough estimate: $0.01 per 1000 tokens
		// Assume ~1 token per word, ~10 words per subtitle
		const tokens = subtitleCount * 10 * 2; // Input + output
		return (tokens / 1000) * 0.01;
	}

	async translate(
		chunk: ParsedSubtitle[],
		context: TranslationContext,
		targetLang: string,
		sourceLang: string,
		apiKey: string,
	): Promise<ParsedSubtitle[]> {
		// Similar to Gemini but using OpenAI SDK
		// ...
	}
}
```

---

## Future Provider: Anthropic Claude

### Configuration

```typescript
class ClaudeProvider implements AIProvider {
	name = 'Anthropic Claude';
	id = 'claude';

	private readonly model = 'claude-3-5-sonnet-20241022';

	getRateLimit(): RateLimitConfig {
		return {
			requestsPerMinute: 50,
			minDelayMs: 200,
			batchSize: 1,
		};
	}

	validateKeyFormat(apiKey: string): boolean {
		return apiKey.startsWith('sk-ant-') && apiKey.length > 40;
	}

	estimateCost(subtitleCount: number): number {
		// Claude pricing: $3 per million input tokens, $15 per million output
		const tokens = subtitleCount * 10;
		return (tokens / 1_000_000) * 3 + (tokens / 1_000_000) * 15;
	}
}
```

---

## Provider Registry

**Centralized provider management.**

```typescript
// lib/ai-providers.ts

class ProviderRegistry {
	private providers = new Map<string, AIProvider>();

	register(provider: AIProvider): void {
		this.providers.set(provider.id, provider);
	}

	get(id: string): AIProvider | undefined {
		return this.providers.get(id);
	}

	list(): AIProvider[] {
		return Array.from(this.providers.values());
	}

	getDefault(): AIProvider {
		return this.providers.get('gemini')!;
	}
}

// Global registry
export const providerRegistry = new ProviderRegistry();

// Register providers
providerRegistry.register(geminiProvider);
// providerRegistry.register(openaiProvider); // When implemented
// providerRegistry.register(claudeProvider); // When implemented
```

---

## API Integration

### Provider Selection

```typescript
// app/api/route.ts

export async function POST(req: Request) {
	const body = await req.json();
	const {
		srtContent,
		targetLanguage,
		apiKeys,
		providerId = 'gemini', // Default to Gemini
	} = body;

	// Get provider
	const provider = providerRegistry.get(providerId);
	if (!provider) {
		return Response.json(
			{ error: `Unknown provider: ${providerId}` },
			{ status: 400 },
		);
	}

	// Validate API keys for this provider
	for (const key of apiKeys) {
		if (!provider.validateKeyFormat(key)) {
			return Response.json(
				{ error: `Invalid API key format for ${provider.name}` },
				{ status: 400 },
			);
		}
	}

	// Get rate limit config
	const rateLimit = provider.getRateLimit();

	// Proceed with translation using provider
	// ...
}
```

---

## Rate Limiting Per Provider

**Different providers have different rate limits.**

```typescript
class ProviderRateLimiter {
	private readonly history = new Map<string, RequestHistory>();

	async wait(provider: AIProvider, apiKey: string): Promise<void> {
		const config = provider.getRateLimit();
		const key = `${provider.id}:${apiKey}`;
		const history = this.history.get(key) || {
			timestamps: [],
			lastRequest: 0,
		};

		const now = Date.now();

		// Remove old requests
		history.timestamps = history.timestamps.filter((t) => now - t < 60000);

		// Check RPM limit
		if (history.timestamps.length >= config.requestsPerMinute) {
			const oldestRequest = history.timestamps[0];
			const waitTime = 60000 - (now - oldestRequest);
			if (waitTime > 0) {
				await sleep(waitTime);
			}
		}

		// Enforce minimum delay
		const timeSinceLastRequest = now - history.lastRequest;
		if (timeSinceLastRequest < config.minDelayMs) {
			await sleep(config.minDelayMs - timeSinceLastRequest);
		}
	}

	record(provider: AIProvider, apiKey: string): void {
		const key = `${provider.id}:${apiKey}`;
		const now = Date.now();
		const history = this.history.get(key) || {
			timestamps: [],
			lastRequest: 0,
		};

		history.timestamps.push(now);
		history.lastRequest = now;
		this.history.set(key, history);
	}
}
```

---

## Error Handling Per Provider

**Different providers have different error formats.**

```typescript
interface ProviderError {
	type: 'quota' | 'rate_limit' | 'invalid_key' | 'unknown';
	message: string;
	retryable: boolean;
	retryAfter?: number; // seconds
}

abstract class AIProvider {
	abstract parseError(error: unknown): ProviderError;
}

class GeminiProvider extends AIProvider {
	parseError(error: unknown): ProviderError {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();

			if (message.includes('quota') || message.includes('resource_exhausted')) {
				return {
					type: 'quota',
					message: 'API quota exhausted',
					retryable: true,
					retryAfter: 300, // 5 minutes
				};
			}

			if (message.includes('429') || message.includes('too many requests')) {
				return {
					type: 'rate_limit',
					message: 'Rate limit exceeded',
					retryable: true,
					retryAfter: 60, // 1 minute
				};
			}

			if (message.includes('invalid') && message.includes('key')) {
				return {
					type: 'invalid_key',
					message: 'Invalid API key',
					retryable: false,
				};
			}
		}

		return {
			type: 'unknown',
			message: 'Unknown error occurred',
			retryable: true,
			retryAfter: 10,
		};
	}
}
```

---

## Cost Estimation UI

**Show cost estimate before translation.**

```typescript
// components/CostEstimate.tsx

interface CostEstimateProps {
  provider: AIProvider;
  subtitleCount: number;
}

function CostEstimate({ provider, subtitleCount }: CostEstimateProps) {
  const cost = provider.estimateCost(subtitleCount);
  const rateLimit = provider.getRateLimit();

  const estimatedTime = Math.ceil(
    subtitleCount / 15 / rateLimit.requestsPerMinute
  );

  return (
    <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded">
      <h3 className="font-semibold mb-2">Estimativa</h3>
      <ul className="space-y-1 text-sm">
        <li>
          <strong>Provedor:</strong> {provider.name}
        </li>
        <li>
          <strong>Legendas:</strong> {subtitleCount} entradas
        </li>
        <li>
          <strong>Custo:</strong> {cost === 0 ? 'Gratuito' : `$${cost.toFixed(4)}`}
        </li>
        <li>
          <strong>Tempo estimado:</strong> ~{estimatedTime} minuto{estimatedTime > 1 ? 's' : ''}
        </li>
      </ul>
    </div>
  );
}
```

---

## Provider Comparison

| Provider           | Free Tier       | Rate Limit | Quality   | Speed         | Best For                 |
| ------------------ | --------------- | ---------- | --------- | ------------- | ------------------------ |
| **Gemini**         | ✅ Yes (15 RPM) | 10 RPM     | Good      | Fast (2-3s)   | Testing, personal use    |
| **OpenAI GPT-4**   | ❌ No           | 500 RPM    | Excellent | Medium (3-5s) | Production, high quality |
| **Claude 3.5**     | ❌ No           | 50 RPM     | Excellent | Medium (4-6s) | Difficult translations   |
| **Ollama (Local)** | ✅ Free         | Unlimited  | Varies    | Slow (10-30s) | Offline, privacy         |

---

## Testing

### Provider Tests

**Each provider must have integration tests.**

```typescript
// lib/ai-providers.test.ts

describe('GeminiProvider', () => {
	const provider = new GeminiProvider();
	const apiKey = process.env.GOOGLE_API_KEY!;

	it('should translate simple subtitle', async () => {
		const chunk: ParsedSubtitle[] = [
			{
				index: 1,
				startTime: '00:00:01,000',
				endTime: '00:00:03,000',
				text: 'Hello, world!',
			},
		];

		const translated = await provider.translate(
			chunk,
			{ filename: 'test.srt' },
			'pt-BR',
			'en',
			apiKey,
		);

		expect(translated).toHaveLength(1);
		expect(translated[0].startTime).toBe('00:00:01,000');
		expect(translated[0].endTime).toBe('00:00:03,000');
		expect(translated[0].text).toContain('Olá');
	});

	it('should validate key format', () => {
		expect(
			provider.validateKeyFormat('AIza1234567890123456789012345678901234567'),
		).toBe(true);
		expect(provider.validateKeyFormat('invalid')).toBe(false);
	});

	it('should estimate cost correctly', () => {
		expect(provider.estimateCost(100)).toBe(0); // Free tier
	});
});
```

---

## Best Practices

### 1. Default to Fastest Free Provider

Currently Gemini. When others are added, let user choose.

### 2. Provider-Specific Optimization

Some providers support:

- Batch requests (multiple chunks in one API call)
- Streaming responses
- Fine-tuning

Leverage these when available.

### 3. Fallback Chain

```typescript
const FALLBACK_CHAIN = ['gemini', 'openai', 'claude'];

async function translateWithFallback(
  chunk: ParsedSubtitle[],
  ...
): Promise<ParsedSubtitle[]> {
  for (const providerId of FALLBACK_CHAIN) {
    const provider = providerRegistry.get(providerId);
    if (!provider) continue;

    try {
      return await provider.translate(chunk, ...);
    } catch (error) {
      console.warn(`Provider ${providerId} failed, trying next...`);
      continue;
    }
  }

  throw new Error('All providers failed');
}
```

### 4. Cache Translations

Hash subtitle content, cache translations per provider.

```typescript
function getCacheKey(
	chunk: ParsedSubtitle[],
	provider: AIProvider,
	targetLang: string,
): string {
	const content = buildSRT(chunk);
	const hash = createHash('sha256').update(content).digest('hex');
	return `${provider.id}:${targetLang}:${hash}`;
}
```

---

## Summary

1. **Unified interface** — All providers implement `AIProvider`
2. **Provider registry** — Centralized management
3. **Rate limiting** — Per-provider configuration
4. **Error handling** — Provider-specific error parsing
5. **Cost estimation** — Show user expected cost
6. **Testing** — Integration tests for each provider
7. **Fallback chain** — Graceful degradation
8. **Caching** — Avoid redundant translations
