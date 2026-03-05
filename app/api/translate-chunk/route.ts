import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight API route for chunk-by-chunk translation
 * No SSE, just simple POST request/response
 * More reliable for long-running batch translations
 *
 * FEATURES:
 * - Multiple API keys with automatic rotation
 * - Per-key rate limiting (10 RPM conservative)
 * - Failed key cooldown (5 minutes)
 * - Exponential backoff on errors
 */

interface ChunkTranslationRequest {
	chunk: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}>;
	targetLanguage: string;
	apiKey: string; // Can be comma-separated multiple keys
}

interface ChunkTranslationResponse {
	success: boolean;
	translatedChunk?: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}>;
	error?: string;
	retryAfter?: number;
}

// Rate limiting per API key
interface KeyUsage {
	requests: number[]; // Timestamps of requests
	lastReset: number;
	failedAt?: number; // When did this key fail (for cooldown)
	consecutiveFailures: number;
}

const keyUsageMap = new Map<string, KeyUsage>();

const RATE_LIMIT_RPM = 8; // Even more conservative: 8 RPM per key
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MIN_DELAY_MS = 1000; // Minimum 1 second between requests
const KEY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown after failure
const MAX_CONSECUTIVE_FAILURES = 3; // After 3 failures, longer cooldown

/**
 * Check if a key is available (not in cooldown)
 */
function isKeyAvailable(apiKey: string): boolean {
	const usage = keyUsageMap.get(apiKey);
	if (!usage || !usage.failedAt) return true;

	const now = Date.now();
	const cooldownDuration =
		usage.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
			? KEY_COOLDOWN_MS * 2 // Double cooldown for repeatedly failing keys
			: KEY_COOLDOWN_MS;

	if (now - usage.failedAt < cooldownDuration) {
		return false; // Still in cooldown
	}

	// Cooldown expired, reset
	usage.failedAt = undefined;
	usage.consecutiveFailures = 0;
	return true;
}

/**
 * Mark a key as failed
 */
function markKeyFailed(apiKey: string): void {
	const usage = keyUsageMap.get(apiKey) || {
		requests: [],
		lastReset: Date.now(),
		consecutiveFailures: 0,
	};

	usage.failedAt = Date.now();
	usage.consecutiveFailures = (usage.consecutiveFailures || 0) + 1;
	keyUsageMap.set(apiKey, usage);

	console.log(
		`🚫 Key marked as failed (${usage.consecutiveFailures} consecutive failures)`,
	);
}

/**
 * Mark a key as successful (reset failure count)
 */
function markKeySuccess(apiKey: string): void {
	const usage = keyUsageMap.get(apiKey);
	if (usage) {
		usage.consecutiveFailures = 0;
		usage.failedAt = undefined;
	}
}

/**
 * Select best available API key from comma-separated list
 */
function selectBestKey(apiKeys: string): { key: string; index: number } | null {
	const keys = apiKeys
		.split(',')
		.map((k) => k.trim())
		.filter(Boolean);

	if (keys.length === 0) {
		return null;
	}

	// Filter available keys (not in cooldown)
	const availableKeys = keys.filter((key) => isKeyAvailable(key));

	if (availableKeys.length === 0) {
		console.log('⚠️ All keys are in cooldown!');
		return null;
	}

	// Select key with least recent usage
	let bestKey = availableKeys[0];
	let oldestLastRequest = Date.now();

	for (const key of availableKeys) {
		const usage = keyUsageMap.get(key);
		if (!usage || usage.requests.length === 0) {
			// Unused key, prefer this
			return { key, index: keys.indexOf(key) };
		}

		const lastRequest = Math.max(...usage.requests);
		if (lastRequest < oldestLastRequest) {
			oldestLastRequest = lastRequest;
			bestKey = key;
		}
	}

	return { key: bestKey, index: keys.indexOf(bestKey) };
}

/**
 * Check rate limit for a specific key
 */
function checkRateLimit(apiKey: string): {
	allowed: boolean;
	retryAfter?: number;
} {
	const now = Date.now();
	const usage = keyUsageMap.get(apiKey);

	if (!usage || now - usage.lastReset > RATE_LIMIT_WINDOW_MS) {
		// Reset window
		keyUsageMap.set(apiKey, {
			requests: [now],
			lastReset: now,
			consecutiveFailures: usage?.consecutiveFailures || 0,
			failedAt: usage?.failedAt,
		});
		return { allowed: true };
	}

	// Filter requests within current window
	const recentRequests = usage.requests.filter(
		(time) => now - time < RATE_LIMIT_WINDOW_MS,
	);

	if (recentRequests.length >= RATE_LIMIT_RPM) {
		const oldestRequest = Math.min(...recentRequests);
		const retryAfter = Math.ceil(
			(oldestRequest + RATE_LIMIT_WINDOW_MS - now) / 1000,
		);
		return { allowed: false, retryAfter };
	}

	// Check minimum delay
	if (recentRequests.length > 0) {
		const lastRequest = Math.max(...recentRequests);
		if (now - lastRequest < MIN_DELAY_MS) {
			return { allowed: false, retryAfter: 2 };
		}
	}

	// Add new request
	usage.requests = [...recentRequests, now];
	keyUsageMap.set(apiKey, usage);
	return { allowed: true };
}

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as ChunkTranslationRequest;
		const { chunk, targetLanguage, apiKey: apiKeys } = body;

		// Validate request
		if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
			return NextResponse.json(
				{ success: false, error: 'Invalid chunk data' },
				{ status: 400 },
			);
		}

		if (!targetLanguage || !apiKeys) {
			return NextResponse.json(
				{ success: false, error: 'Missing targetLanguage or apiKey' },
				{ status: 400 },
			);
		}

		// Select best available API key
		const keySelection = selectBestKey(apiKeys);

		if (!keySelection) {
			// All keys in cooldown
			return NextResponse.json(
				{
					success: false,
					error: 'All API keys are temporarily unavailable (cooldown)',
					retryAfter: 60,
				},
				{ status: 429 },
			);
		}

		const selectedKey = keySelection.key;
		const keyIndex = keySelection.index;

		console.log(
			`🔑 Using API key #${keyIndex + 1} (of ${apiKeys.split(',').length})`,
		);

		// Rate limiting for selected key
		const rateLimitCheck = checkRateLimit(selectedKey);
		if (!rateLimitCheck.allowed) {
			console.log(
				`⏰ Key #${keyIndex + 1} rate limited, retry in ${rateLimitCheck.retryAfter}s`,
			);
			return NextResponse.json(
				{
					success: false,
					error: 'Rate limit exceeded for this key',
					retryAfter: rateLimitCheck.retryAfter,
				},
				{ status: 429 },
			);
		}

		// Build prompt for chunk translation
		const chunkText = chunk.map((sub) => sub.text).join('\n');

		const prompt = `Translate the following subtitle texts to ${targetLanguage}.
CRITICAL RULES:
1. Translate ONLY the text content
2. Do NOT modify, add, or remove any line breaks
3. Return translations in the SAME ORDER, one per line
4. If the original has N lines, your output must have EXACTLY N lines
5. Keep the same meaning and tone

Original subtitles (${chunk.length} lines):
${chunkText}

Translated subtitles (${chunk.length} lines):`;

		// Call Gemini API
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${selectedKey}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [{ text: prompt }],
						},
					],
					generationConfig: {
						temperature: 0.3,
						maxOutputTokens: 8192,
					},
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`❌ Gemini API error (key #${keyIndex + 1}):`,
				response.status,
				errorText,
			);

			// Handle quota/rate limit errors
			if (response.status === 429) {
				markKeyFailed(selectedKey);

				// Try to provide helpful error message
				let retryAfter = 60;
				try {
					const errorData = JSON.parse(errorText);
					if (errorData.error?.message?.includes('quota')) {
						console.log(
							`💤 Key #${keyIndex + 1} quota exhausted (5 min cooldown)`,
						);
						retryAfter = 300; // 5 minutes for quota errors
					}
				} catch {}

				return NextResponse.json(
					{
						success: false,
						error: `API key #${keyIndex + 1} quota exceeded`,
						retryAfter,
					},
					{ status: 429 },
				);
			}

			// Other errors also mark key as failed temporarily
			if (response.status >= 500 || response.status === 503) {
				markKeyFailed(selectedKey);
			}

			return NextResponse.json(
				{
					success: false,
					error: `Gemini API error: ${response.status}`,
				},
				{ status: response.status },
			);
		}

		// Success! Mark key as working
		markKeySuccess(selectedKey);

		const data = await response.json();
		const translatedText =
			data.candidates?.[0]?.content?.parts?.[0]?.text || '';

		if (!translatedText) {
			return NextResponse.json(
				{ success: false, error: 'Empty translation response' },
				{ status: 500 },
			);
		}

		// Parse translated lines
		const translatedLines = translatedText
			.trim()
			.split('\n')
			.map((line: string) => line.trim())
			.filter((line: string) => line.length > 0);

		// Validate line count matches
		if (translatedLines.length !== chunk.length) {
			console.warn(
				`⚠️ Line count mismatch: expected ${chunk.length}, got ${translatedLines.length}`,
			);
			// Try to handle common issues
			if (translatedLines.length > chunk.length) {
				// Take first N lines
				translatedLines.splice(chunk.length);
			} else {
				// Not enough lines - this is an error
				return NextResponse.json(
					{
						success: false,
						error: `Translation line count mismatch: expected ${chunk.length}, got ${translatedLines.length}`,
					},
					{ status: 500 },
				);
			}
		}

		// Build translated chunk with preserved timings
		const translatedChunk = chunk.map((sub, i) => ({
			index: sub.index,
			startTime: sub.startTime,
			endTime: sub.endTime,
			text: translatedLines[i] || '',
		}));

		console.log(`✅ Successfully translated chunk using key #${keyIndex + 1}`);

		return NextResponse.json({
			success: true,
			translatedChunk,
		} as ChunkTranslationResponse);
	} catch (error) {
		console.error('❌ Translation error:', error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 },
		);
	}
}
