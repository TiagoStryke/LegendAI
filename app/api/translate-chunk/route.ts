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
 * - SRT format with timing preservation (REVOLUTIONARY)
 * - Auto-correction of timing errors
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
	filename?: string; // For context extraction
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
 * Extract file context (series/episode info) from filename
 */
function extractFileContext(filename: string): string {
	if (!filename) return '';

	const cleanName = filename.replace(/\.(srt|vtt|ass|ssa)$/i, '').toLowerCase();
	let context = '';

	// Detect series/episode
	const seriesPatterns = [
		/(.+?)\.s(\d+)e(\d+)/i,
		/(.+?)\.season\.?(\d+)\.episode\.?(\d+)/i,
		/(.+?)\.(\d+)x(\d+)/i,
		/(.+?)\s+s(\d+)e(\d+)/i,
		/(.+?)-s(\d+)e(\d+)/i,
	];

	let seriesMatch = null;
	for (const pattern of seriesPatterns) {
		seriesMatch = cleanName.match(pattern);
		if (seriesMatch) break;
	}

	if (seriesMatch) {
		const seriesName = seriesMatch[1]
			.replace(/[\.\-_]/g, ' ')
			.trim()
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
		const season = parseInt(seriesMatch[2]);
		const episode = parseInt(seriesMatch[3]);
		context = `Esta é uma legenda da série "${seriesName}", temporada ${season}, episódio ${episode}.`;
	} else {
		// Detect movie
		const moviePatterns = [
			/(.+?)\.(\d{4})/i,
			/(.+?)\s+(\d{4})/i,
			/(.+?)-(\d{4})/i,
		];

		let movieMatch = null;
		for (const pattern of moviePatterns) {
			movieMatch = cleanName.match(pattern);
			if (movieMatch) break;
		}

		if (movieMatch) {
			const movieName = movieMatch[1]
				.replace(/[\.\-_]/g, ' ')
				.trim()
				.split(' ')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ');
			const year = movieMatch[2];
			context = `Esta é uma legenda do filme "${movieName}" (${year}).`;
		}
	}

	return context;
}

/**
 * Build SRT format block: number + timing + text
 */
function buildSRTBlock(
	chunk: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}>,
): string {
	return chunk
		.map(
			(seg) => `${seg.index}\n${seg.startTime} --> ${seg.endTime}\n${seg.text}`,
		)
		.join('\n\n');
}

/**
 * Parse SRT response from API
 */
function parseSRTResponse(
	responseText: string,
): Array<{ index: number; startTime: string; endTime: string; text: string }> {
	// Remove preamble if AI added it
	let cleanedText = responseText.trim();
	const preamblePatterns = [
		/^Aqui está.*?\n\n/i,
		/^Aqui estão.*?\n\n/i,
		/^Segue.*?\n\n/i,
	];

	for (const pattern of preamblePatterns) {
		cleanedText = cleanedText.replace(pattern, '');
	}

	const blocks = cleanedText.split(/\n\s*\n/);
	const segments: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}> = [];

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		if (lines.length < 3) continue;

		const index = parseInt(lines[0]);
		if (isNaN(index)) continue;

		const timeLine = lines[1];
		const timeMatch = timeLine.match(/(\S+)\s+-->\s+(\S+)/);
		if (!timeMatch) continue;

		const text = lines.slice(2).join('\n').trim();

		segments.push({
			index,
			startTime: timeMatch[1],
			endTime: timeMatch[2],
			text,
		});
	}

	return segments;
}

/**
 * Validate and auto-correct timing errors
 */
function validateAndFixSRTResponse(
	inputSegments: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}>,
	outputSegments: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}>,
): {
	isValid: boolean;
	timingsCorrected: number;
	correctedSegments: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}>;
} {
	const inputIndices = new Set(inputSegments.map((s) => s.index));
	const outputIndices = new Set(outputSegments.map((s) => s.index));

	// Check if segment count matches
	if (inputIndices.size !== outputIndices.size) {
		return {
			isValid: false,
			timingsCorrected: 0,
			correctedSegments: outputSegments,
		};
	}

	let timingsCorrected = 0;
	const correctedSegments: Array<{
		index: number;
		startTime: string;
		endTime: string;
		text: string;
	}> = [];

	for (const outputSeg of outputSegments) {
		const inputSeg = inputSegments.find((s) => s.index === outputSeg.index);

		if (inputSeg) {
			const timingMatch =
				inputSeg.startTime === outputSeg.startTime &&
				inputSeg.endTime === outputSeg.endTime;

			if (!timingMatch) {
				// 🔧 TIMING ERROR - Auto-correct
				timingsCorrected++;
				correctedSegments.push({
					index: inputSeg.index,
					startTime: inputSeg.startTime, // ✅ ORIGINAL TIMING
					endTime: inputSeg.endTime, // ✅ ORIGINAL TIMING
					text: outputSeg.text, // ✅ TRANSLATED TEXT
				});
			} else {
				// ✅ Timing correct
				correctedSegments.push(outputSeg);
			}
		} else {
			// Segment not in input (shouldn't happen)
			correctedSegments.push(outputSeg);
		}
	}

	// Sort by index
	correctedSegments.sort((a, b) => a.index - b.index);

	return {
		isValid: true,
		timingsCorrected,
		correctedSegments,
	};
}

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
		const { chunk, targetLanguage, apiKey: rawApiKeys, filename } = body;

		// Admin shortcut: 'admin' → use server-side env key (never exposed to client)
		const apiKeys =
			rawApiKeys === 'admin' ? process.env.GOOGLE_API_KEY || '' : rawApiKeys;

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

		// Extract file context
		const fileContext = filename ? extractFileContext(filename) : '';

		// Build SRT format input
		const srtInput = buildSRTBlock(chunk);

		// Ultra-strengthened prompt
		let systemPrompt =
			'Você é um tradutor profissional especializado em legendas de filmes e séries para português brasileiro.\n\n' +
			'🎯 FORMATO SRT - ESTRUTURA OBRIGATÓRIA:\n' +
			'Cada legenda no formato SRT tem 3 componentes FIXOS:\n' +
			'1. NÚMERO da legenda (ex: 154)\n' +
			'2. TIMING com início e fim (ex: 00:09:02,203 --> 00:09:03,708)\n' +
			'3. TEXTO da fala do personagem\n\n' +
			'⚠️ REGRAS CRÍTICAS - NUNCA VIOLE:\n' +
			'• Cada NÚMERO representa UMA fala específica de UM momento do vídeo\n' +
			'• O que o personagem fala no timing 00:09:02 DEVE permanecer na legenda #154 com esse EXATO timing\n' +
			'• NUNCA junte duas legendas em uma (ex: legendas 154 + 155 virando apenas 154)\n' +
			'• NUNCA divida uma legenda em várias (ex: legenda 154 virando 154 + 155)\n' +
			'• NUNCA altere números de legenda\n' +
			'• SEMPRE mantenha o EXATO número de legendas (se receber 100, retorne 100)\n\n' +
			'🚨 TIMING - REGRA ABSOLUTA:\n' +
			'• COPIE os timings EXATAMENTE como estão, caractere por caractere\n' +
			'• NUNCA mude horas, minutos, segundos ou milissegundos\n' +
			'• NUNCA arredonde (00:02:34,373 NÃO pode virar 00:03:34,373)\n' +
			'• Timings sincronizam fala com vídeo - alterar quebra a legenda completamente\n' +
			'• Se tiver dúvida: COPIE E COLE o timing original\n\n' +
			'✅ O QUE VOCÊ DEVE FAZER:\n' +
			'• Traduza APENAS o texto (componente #3) para português brasileiro\n' +
			'• COPIE números e timings EXATAMENTE (componentes #1 e #2)\n' +
			'• Preserve tags HTML como <i></i> para itálico\n' +
			'• Preserve quebras de linha (\\n) em diálogos com hífens\n' +
			'• Mantenha o estilo e tom original\n' +
			'• Não traduza nomes próprios\n' +
			'• Separe cada legenda com linha em branco dupla (\\n\\n)\n\n' +
			'📋 EXEMPLO CORRETO (veja como timings são COPIADOS EXATAMENTE):\n\n' +
			'INPUT:\n' +
			'154\n' +
			'00:09:02,203 --> 00:09:03,708\n' +
			"Hey, tell me what's going on--\n\n" +
			'155\n' +
			'00:09:03,741 --> 00:09:06,108\n' +
			'Turn around! On your knees!\n\n' +
			'OUTPUT CORRETO (números e timings IDÊNTICOS):\n' +
			'154\n' +
			'00:09:02,203 --> 00:09:03,708\n' +
			'Ei, me diga o que está acontecendo--\n\n' +
			'155\n' +
			'00:09:03,741 --> 00:09:06,108\n' +
			'Vire-se! De joelhos!\n\n' +
			'❌ ERRADO (timing alterado):\n' +
			'154\n' +
			'00:09:02,203 --> 00:10:03,708  ⬅️ ERRADO! Mudou para 00:10 em vez de 00:09\n' +
			'Ei, me diga o que está acontecendo--';

		if (fileContext) {
			systemPrompt += `\n\n🎬 CONTEXTO:\n${fileContext}\nUse este contexto para melhorar a qualidade e naturalidade da tradução.`;
		}

		const prompt = `${systemPrompt}\n\nAgora traduza estas ${chunk.length} legendas:\n\n${srtInput}`;

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
						maxOutputTokens: 32000, // Increased for 100-subtitle chunks (each ~150 tokens = ~15k total)
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

		// Parse SRT response
		const outputSegments = parseSRTResponse(translatedText);

		if (outputSegments.length === 0) {
			return NextResponse.json(
				{ success: false, error: 'Failed to parse SRT response' },
				{ status: 500 },
			);
		}

		// Validate and auto-correct timings
		const validation = validateAndFixSRTResponse(chunk, outputSegments);

		if (!validation.isValid) {
			console.warn(
				`⚠️ Segment count mismatch: expected ${chunk.length}, got ${outputSegments.length}`,
			);
			return NextResponse.json(
				{
					success: false,
					error: `Segment count mismatch: expected ${chunk.length}, got ${outputSegments.length}`,
				},
				{ status: 500 },
			);
		}

		if (validation.timingsCorrected > 0) {
			console.log(
				`🔧 Auto-corrected ${validation.timingsCorrected} timing errors in chunk`,
			);
		}

		console.log(
			`✅ Successfully translated chunk using key #${keyIndex + 1} (timings fixed: ${validation.timingsCorrected})`,
		);

		return NextResponse.json({
			success: true,
			translatedChunk: validation.correctedSegments,
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
