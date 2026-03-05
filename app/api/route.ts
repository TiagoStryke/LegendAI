import { parseSegment } from '@/lib/client';
import { groupSegmentsByTokenLength } from '@/lib/srt';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

// Configurando a API para funcionar tanto em modo dinâmico quanto estático
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TOKENS_IN_SEGMENT = 400; // Reduzido para evitar truncamento da API Gemini

interface TranslationProgress {
	type:
		| 'progress'
		| 'quota_error'
		| 'retry'
		| 'complete'
		| 'error'
		| 'keep_alive';
	translated: number;
	total: number;
	percentage: number;
	currentChunk?: number;
	totalChunks?: number;
	message?: string;
	retryAfter?: number;
	keepAliveUrl?: string; // URL para abrir em nova aba
}

/**
 * Formata corretamente as linhas de diálogo preservando a estrutura original
 * Distingue entre falas de diálogo e palavras compostas
 */
const formatDialogueLines = (text: string): string => {
	// Regex para detectar falas de diálogo vs palavras compostas
	const dialoguePattern = /^-[^-\s][^-]*(?:\s+-[^-\s][^-]*)*$/;
	const compoundWordPattern =
		/^[a-záàâãäéèêëíìîïóòôõöúùûüç]+-[a-záàâãäéèêëíìîïóòôõöúùûüç]+$/i;

	// Se o texto contém múltiplas ocorrências de "espaco-hifen-texto" em uma linha
	// É provavelmente diálogo concatenado incorretamente
	const concatenatedDialoguePattern = /\s+-[^\s-]/g;
	const matches = text.match(concatenatedDialoguePattern);

	if (matches && matches.length > 0) {
		// Detectou diálogo concatenado - precisa separar
		// Exemplo: "-Olá! -Oi, tudo bem? -Estou ótimo."
		// Deve virar: "-Olá!\n-Oi, tudo bem?\n-Estou ótimo."

		// Divide o texto preservando falas de diálogo
		return text
			.split(/(\s+-[^-])/) // Divide mantendo o delimitador
			.reduce((result, part, index, array) => {
				if (part.match(/^\s+-[^-]/)) {
					// É uma nova fala - adiciona quebra de linha antes
					return result + '\n' + part.trim();
				} else if (index === 0) {
					// Primeira parte
					return part;
				} else {
					// Continua a fala anterior
					return result + part;
				}
			}, '')
			.trim();
	}

	// Verifica se é uma palavra composta simples
	const trimmedText = text.trim();
	if (compoundWordPattern.test(trimmedText)) {
		// É uma palavra composta (ex: "arco-íris") - não modifica
		return text;
	}

	return text;
};

/**
 * Extrai informações contextuais do nome do arquivo para melhorar a tradução
 */
const extractFileContext = (filename: string): string => {
	if (!filename) return '';

	// Remove extensão e limpa o nome
	const cleanName = filename.replace(/\.(srt|vtt|ass|ssa)$/i, '').toLowerCase();

	let context = '';

	// Detectar série/episódio - múltiplos padrões
	const seriesPatterns = [
		/(.+?)\.s(\d+)e(\d+)/i, // serie.s01e01
		/(.+?)\.season\.?(\d+)\.episode\.?(\d+)/i, // serie.season.1.episode.1
		/(.+?)\.(\d+)x(\d+)/i, // serie.1x01
		/(.+?)\s+s(\d+)e(\d+)/i, // serie s01e01 (com espaço)
		/(.+?)-s(\d+)e(\d+)/i, // serie-s01e01 (com hífen)
	];

	let seriesMatch = null;
	for (const pattern of seriesPatterns) {
		seriesMatch = cleanName.match(pattern);
		if (seriesMatch) break;
	}

	if (seriesMatch) {
		const seriesName = seriesMatch[1]
			.replace(/[\.\-_]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
		const season = parseInt(seriesMatch[2]);
		const episode = parseInt(seriesMatch[3]);
		context = `Esta é uma legenda da série "${seriesName}", temporada ${season}, episódio ${episode}.`;
	} else {
		// Detectar filme
		const moviePatterns = [
			/(.+?)\.(\d{4})/i, // filme.2023
			/(.+?)\s+(\d{4})/i, // filme 2023
			/(.+?)-(\d{4})/i, // filme-2023
		];

		let movieMatch = null;
		for (const pattern of moviePatterns) {
			movieMatch = cleanName.match(pattern);
			if (movieMatch) break;
		}

		if (movieMatch) {
			const movieName = movieMatch[1]
				.replace(/[\.\-_]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.split(' ')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ');
			const year = movieMatch[2];
			context = `Esta é uma legenda do filme "${movieName}" (${year}).`;
		} else {
			// Tentar extrair apenas o nome sem ano
			const nameMatch = cleanName.match(/^([^.]+(?:\.[^.]*){0,3})/);
			if (nameMatch) {
				const name = nameMatch[1]
					.replace(/[\.\-_]/g, ' ')
					.replace(/\s+/g, ' ')
					.trim()
					.split(' ')
					.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
					.join(' ');
				context = `Esta é uma legenda de "${name}".`;
			}
		}
	}

	// Detectar qualidade/fonte adicional
	const qualityInfo = [];
	if (cleanName.includes('1080p')) qualityInfo.push('alta definição (1080p)');
	else if (cleanName.includes('720p')) qualityInfo.push('HD (720p)');
	else if (cleanName.includes('4k') || cleanName.includes('2160p'))
		qualityInfo.push('4K/Ultra HD');

	if (cleanName.includes('bluray') || cleanName.includes('blu-ray'))
		qualityInfo.push('Blu-ray');
	else if (cleanName.includes('dvd')) qualityInfo.push('DVD');
	else if (cleanName.includes('webrip') || cleanName.includes('web-dl'))
		qualityInfo.push('streaming/web');
	else if (cleanName.includes('hdtv')) qualityInfo.push('TV');

	if (qualityInfo.length > 0) {
		context += ` Fonte: ${qualityInfo.join(', ')}.`;
	}

	return context;
};

// ===== KEEP-ALIVE PARA RENDER =====
// Evita que o servidor Render caia durante traduções longas
const KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
const KEEP_ALIVE_URL = 'https://srt-pt-ai.onrender.com/';

// ===== CACHE DE KEYS COM QUOTA ESGOTADA =====
// Armazena timestamp de quando cada key falhou por quota
const quotaFailedKeys = new Map<string, number>();
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos de cooldown

// ===== RATE LIMITER POR KEY =====
// Controla velocidade de requisições para evitar 429 TooManyRequests
interface RequestHistory {
	timestamps: number[]; // Últimas requisições
	lastRequest: number; // Timestamp da última requisição
}

const keyRequestHistory = new Map<string, RequestHistory>();
const MAX_RPM = 10; // Requests por minuto - conservador para evitar rate limit
const MIN_DELAY_MS = 500; // Delay mínimo entre requisições (0.5s)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // Janela de 1 minuto

/**
 * Aguarda o tempo necessário para respeitar o rate limit da key
 * Evita erros 429 TooManyRequests
 */
const waitForRateLimit = async (key: string): Promise<void> => {
	const now = Date.now();
	let history = keyRequestHistory.get(key);

	if (!history) {
		history = { timestamps: [], lastRequest: 0 };
		keyRequestHistory.set(key, history);
	}

	// Remove timestamps fora da janela de 1 minuto
	history.timestamps = history.timestamps.filter(
		(ts) => now - ts < RATE_LIMIT_WINDOW_MS,
	);

	// Verifica se precisa esperar
	if (history.timestamps.length >= MAX_RPM) {
		// Atingiu o limite - precisa esperar até a requisição mais antiga sair da janela
		const oldestRequest = history.timestamps[0];
		const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestRequest) + 100; // +100ms de margem

		if (waitTime > 0) {
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}

		// Atualiza now após o wait
		const newNow = Date.now();
		history.timestamps = history.timestamps.filter(
			(ts) => newNow - ts < RATE_LIMIT_WINDOW_MS,
		);
	}

	// Garante delay mínimo entre requisições consecutivas
	const timeSinceLastRequest = now - history.lastRequest;
	if (timeSinceLastRequest < MIN_DELAY_MS) {
		await new Promise((resolve) =>
			setTimeout(resolve, MIN_DELAY_MS - timeSinceLastRequest),
		);
	}

	// Registra a nova requisição
	const requestTime = Date.now();
	history.timestamps.push(requestTime);
	history.lastRequest = requestTime;
};

/**
 * Ordena as keys priorizando as que não falharam recentemente
 * Keys que falharam por quota vão para o final da lista
 */
const sortKeysByAvailability = (keys: string[]): string[] => {
	const now = Date.now();

	// Separa keys em disponíveis e possivelmente esgotadas
	const available: string[] = [];
	const recentlyFailed: Array<{ key: string; failedAt: number }> = [];

	for (const key of keys) {
		const failedAt = quotaFailedKeys.get(key);

		if (!failedAt) {
			// Nunca falhou ou foi limpa do cache
			available.push(key);
		} else if (now - failedAt > QUOTA_COOLDOWN_MS) {
			// Falhou mas já passou o cooldown
			quotaFailedKeys.delete(key); // Limpa do cache
			available.push(key);
		} else {
			// Falhou recentemente
			recentlyFailed.push({ key, failedAt });
		}
	}

	// Ordena as que falharam recentemente pela mais antiga (mais chance de ter recuperado)
	recentlyFailed.sort((a, b) => a.failedAt - b.failedAt);

	// Retorna: disponíveis primeiro, depois as que falharam (mais antiga primeiro)
	return [...available, ...recentlyFailed.map((x) => x.key)];
};

const isQuotaError = (error: any): boolean => {
	const errorMessage = error?.message?.toLowerCase() || '';
	const errorString = String(error).toLowerCase();

	// Check for direct quota indicators in the error
	const hasQuotaIndicators =
		error?.status === 429 ||
		error?.code === 429 ||
		error?.statusCode === 429 ||
		error?.lastError?.statusCode === 429 || // For wrapped RetryErrors
		errorMessage.includes('quota') ||
		errorMessage.includes('rate limit') ||
		errorMessage.includes('resource_exhausted') ||
		errorMessage.includes('too many requests') ||
		errorMessage.includes('quota exceeded') ||
		errorMessage.includes('requests per minute') ||
		errorMessage.includes('rpm') ||
		errorMessage.includes('rate_limit_exceeded') ||
		errorMessage.includes('429') ||
		errorString.includes('quota') ||
		errorString.includes('rate limit') ||
		errorString.includes('429') ||
		errorString.includes('resource_exhausted') ||
		errorString.includes('too many requests');

	return hasQuotaIndicators;
};

const retrieveTranslationWithQuotaHandling = async (
	text: string,
	language: string,
	apiKey: string,
	maxRetries: number = 3,
	originalSegments?: any[],
	onQuotaError?: (retryAfter: number) => Promise<void>,
	onQuotaRetry?: () => Promise<void>,
	fileContext?: string,
): Promise<{ result: string; retryAfter?: number }> => {
	// ===== SUPORTE A MÚLTIPLAS API KEYS =====
	let keys = apiKey
		.split(',')
		.map((k) => k.trim())
		.filter((k) => k.length >= 30);

	if (keys.length === 0) {
		throw new Error('Nenhuma API key válida fornecida.');
	}

	// ===== ORDENA KEYS PRIORIZANDO AS DISPONÍVEIS =====
	keys = sortKeysByAvailability(keys);

	let lastError: any = null;

	// Percorre cada key
	for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
		const currentKey = keys[keyIndex];

		const googleProvider = createGoogleGenerativeAI({
			apiKey: currentKey,
		});

		const geminiModel = googleProvider('gemini-2.5-flash');

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				// ===== RATE LIMITING: Aguarda antes de fazer requisição =====
				await waitForRateLimit(currentKey);

				let systemPrompt =
					"Você é um tradutor profissional especializado em legendas de filmes e séries, com foco especial em português brasileiro. IMPORTANTE: Preserve cuidadosamente toda a formatação original, incluindo tags HTML como <i> para itálico. Separe os segmentos de tradução com o símbolo '|'. Mantenha o estilo e tom da linguagem original. Nomes próprios não devem ser traduzidos. Preserve os nomes de programas como 'The Amazing Race'. CRÍTICO: Preserve EXATAMENTE a estrutura de quebras de linha do texto original. Quando encontrar diálogos com hífens em linhas separadas (como '-Texto1\\n-Texto2'), mantenha cada fala em sua própria linha com quebra de linha (\\n). NUNCA una múltiplas falas em uma única linha.";

				if (fileContext) {
					systemPrompt += `\n\nCONTEXTO: ${fileContext}`;
				}

				const fullPrompt = `${systemPrompt}\n\nTraduza estas legendas para português brasileiro: ${text}`;

				const { text: translatedText } = await generateText({
					model: geminiModel,
					messages: [
						{
							role: 'user',
							content: fullPrompt,
						},
					],
				});

				// ===== VERIFICA TRUNCAMENTO =====
				const inputSegments = text.split('|').length;
				const outputSegments = translatedText.split('|').length;

				if (outputSegments < inputSegments) {
					if (originalSegments && originalSegments.length > 1) {
						throw new Error('SPLIT_CHUNK_NEEDED');
					}
				}

				// Se chegou aqui, funcionou
				// Remove a key do cache de falhas (se estiver lá)
				quotaFailedKeys.delete(currentKey);

				if (keyIndex > 0 && onQuotaRetry) {
					await onQuotaRetry();
				}

				return { result: translatedText };
			} catch (error: any) {
				lastError = error;

				// ===== NÃO ROTACIONAR EM ERRO DE AUTENTICAÇÃO =====
				const errorMessage = error?.message?.toLowerCase() || '';

				if (
					errorMessage.includes('auth') ||
					errorMessage.includes('invalid key') ||
					errorMessage.includes('unauthorized') ||
					errorMessage.includes('forbidden')
				) {
					throw new Error(`Erro de autenticação na API key ${keyIndex + 1}.`);
				}

				// ===== SE PRECISAR DIVIDIR CHUNK =====
				if (error.message === 'SPLIT_CHUNK_NEEDED') {
					throw error;
				}

				// ===== SE FOR QUOTA =====
				if (isQuotaError(error)) {
					// Marca a key como esgotada no cache
					quotaFailedKeys.set(currentKey, Date.now());

					// ===== TRATAMENTO ESPECIAL PARA 429 (Rate Limit) =====
					const is429 =
						error?.status === 429 ||
						error?.code === 429 ||
						error?.statusCode === 429 ||
						errorMessage.includes('too many requests') ||
						errorMessage.includes('rate limit');

					if (is429) {
						// Limpa o histórico de requisições desta key para resetar o contador
						keyRequestHistory.delete(currentKey);

						// Aplica cooldown mais agressivo para rate limit
						const rateLimitCooldown = 15000; // 15 segundos
						if (attempt < maxRetries - 1) {
							await new Promise((r) => setTimeout(r, rateLimitCooldown));
							continue;
						}
					}

					// Se ainda tem outra key, tenta próxima imediatamente
					if (keyIndex < keys.length - 1) {
						if (onQuotaError) {
							await onQuotaError(0);
						}
						break; // sai do retry e vai pra próxima key
					}

					// Se é a última key, aplica delay e retry normal
					if (attempt < maxRetries - 1) {
						const delay = Math.pow(2, attempt) * 1000;
						await new Promise((r) => setTimeout(r, delay));
						continue;
					}

					throw new Error('QUOTA_ERROR');
				}

				// ===== RETRY NORMAL =====
				if (attempt < maxRetries - 1) {
					const delay = Math.pow(2, attempt) * 1000;
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}

				throw error;
			}
		}
	}

	throw (
		lastError || new Error('Todas as API keys falharam ou atingiram quota.')
	);
};

export async function POST(request: Request) {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			try {
				// Parse request data
				let content = '';
				let language = '';
				let apiKey = '';
				let validationOnly = false;
				let filename = '';

				try {
					const requestData = await request.json();
					content = requestData.content || '';
					language = requestData.language || 'Portuguese (Brazil)';
					apiKey = requestData.apiKey || '';
					validationOnly = requestData.validationOnly || false;
					filename = requestData.filename || '';
				} catch (parseError) {
					const errorData: TranslationProgress = {
						type: 'error',
						translated: 0,
						total: 0,
						percentage: 0,
						message: 'Invalid request format',
					};
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
					);
					controller.close();
					return;
				}

				// Verificar se a API key foi fornecida
				if (!apiKey) {
					const errorData: TranslationProgress = {
						type: 'error',
						translated: 0,
						total: 0,
						percentage: 0,
						message: 'API key is required',
					};
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
					);
					controller.close();
					return;
				}

				// Verificação básica para API keys claramente inválidas
				if (apiKey.trim().length < 30) {
					const errorData: TranslationProgress = {
						type: 'error',
						translated: 0,
						total: 0,
						percentage: 0,
						message: 'API key appears to be invalid (too short)',
					};
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
					);
					controller.close();
					return;
				}

				// If validation only, do a simple test
				if (validationOnly) {
					try {
						const googleProvider = createGoogleGenerativeAI({ apiKey });
						const geminiModel = googleProvider('gemini-2.0-flash-exp');

						await generateText({
							model: geminiModel,
							messages: [
								{ role: 'user', content: 'Test message for API validation.' },
							],
						});

						const successData = { valid: true, message: 'API key is valid' };
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(successData)}\n\n`),
						);
						controller.close();
						return;
					} catch (error: any) {
						const errorData = {
							valid: false,
							error: error.message,
							errorType: 'validation_error',
						};
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
						);
						controller.close();
						return;
					}
				}

				// Parse SRT content into segments
				const segments = content
					.split(/\r\n\r\n|\n\n/)
					.map(parseSegment)
					.filter(
						(segment) => segment.id && segment.timestamp && segment.text.trim(),
					); // Filter out invalid/empty segments
				const totalSegments = segments.length;

				if (totalSegments === 0) {
					const errorData: TranslationProgress = {
						type: 'error',
						translated: 0,
						total: 0,
						percentage: 0,
						message: 'No valid subtitle segments found',
					};
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
					);
					controller.close();
					return;
				}

				// Extrair contexto do nome do arquivo
				const fileContext = extractFileContext(filename);
				console.log(`Filename: ${filename}, Context: ${fileContext}`); // Debug log

				// Group segments into batches for efficient processing
				const groups = await groupSegmentsByTokenLength(
					segments,
					MAX_TOKENS_IN_SEGMENT,
				);
				const totalChunks = groups.length;

				// Send initial progress
				const contextInfo = fileContext ? ` Context: ${fileContext}` : '';
				const initialProgress: TranslationProgress = {
					type: 'progress',
					translated: 0,
					total: totalSegments,
					percentage: 0,
					currentChunk: 0,
					totalChunks,
					message: `Starting translation of ${totalSegments} subtitles in ${totalChunks} chunks.${contextInfo}`,
				};
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(initialProgress)}\n\n`),
				);

				let translatedSegments: string[] = [];
				let currentSegmentIndex = 0;

				// Function to process a group of segments with automatic chunk splitting
				const processSegmentGroup = async (
					segmentGroup: any[],
					chunkIndex?: number,
				): Promise<string[]> => {
					const chunkText = segmentGroup
						.map((segment) => segment.text)
						.join('|');

					// Callbacks to notify frontend about quota issues
					const onQuotaError = async (retryAfter: number) => {
						const quotaError: TranslationProgress = {
							type: 'quota_error',
							translated: translatedSegments.length,
							total: totalSegments,
							percentage: Math.round(
								(translatedSegments.length / totalSegments) * 100,
							),
							currentChunk: chunkIndex !== undefined ? chunkIndex + 1 : 0,
							totalChunks,
							message: `🚫 API quota limit reached! Translation paused. Waiting ${retryAfter}s for quota reset...`,
							retryAfter,
						};
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(quotaError)}\n\n`),
						);
					};

					const onQuotaRetry = async () => {
						const retryMessage: TranslationProgress = {
							type: 'retry',
							translated: translatedSegments.length,
							total: totalSegments,
							percentage: Math.round(
								(translatedSegments.length / totalSegments) * 100,
							),
							currentChunk: chunkIndex !== undefined ? chunkIndex + 1 : 0,
							totalChunks,
							message: `✅ Quota reset successful! Resuming translation...`,
						};
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(retryMessage)}\n\n`),
						);
					};

					try {
						const { result, retryAfter } =
							await retrieveTranslationWithQuotaHandling(
								chunkText,
								language,
								apiKey,
								3, // maxRetries
								segmentGroup, // Pass original segments for splitting detection
								onQuotaError, // Quota error callback
								onQuotaRetry, // Quota retry callback
								fileContext, // File context for better translation
							);

						if (retryAfter) {
							throw new Error('QUOTA_ERROR');
						}

						const translatedChunks = result.split('|');

						// CRITICAL FIX: Ensure we have complete translation for this chunk
						// This prevents the content offset bug by guaranteeing each chunk returns the correct number of translations
						if (translatedChunks.length < segmentGroup.length) {
							const missing = segmentGroup.length - translatedChunks.length;

							// Fill missing segments with original text
							for (
								let i = translatedChunks.length;
								i < segmentGroup.length;
								i++
							) {
								translatedChunks.push(segmentGroup[i].text);
							}
						} else if (translatedChunks.length > segmentGroup.length) {
							// Trim excess translations (shouldn't happen but being defensive)
							translatedChunks.splice(segmentGroup.length);
						}

						// Final validation: ensure exact match
						if (translatedChunks.length !== segmentGroup.length) {
							// Force correct length by padding or trimming
							while (translatedChunks.length < segmentGroup.length) {
								translatedChunks.push(
									segmentGroup[translatedChunks.length].text,
								);
							}
							translatedChunks.splice(segmentGroup.length);
						}

						return translatedChunks;
					} catch (error: any) {
						if (error.message === 'SPLIT_CHUNK_NEEDED') {
							// Notify about chunk splitting
							if (chunkIndex !== undefined) {
								const splitMessage: TranslationProgress = {
									type: 'progress',
									translated: translatedSegments.length,
									total: totalSegments,
									percentage: Math.round(
										(translatedSegments.length / totalSegments) * 100,
									),
									currentChunk: chunkIndex + 1,
									totalChunks,
									message: `🔄 Chunk ${chunkIndex + 1} too large, splitting into smaller parts (${segmentGroup.length} → ${Math.ceil(segmentGroup.length / 2)} + ${Math.floor(segmentGroup.length / 2)} subtitles)...`,
								};
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(splitMessage)}\n\n`),
								);
							}

							// If only 1 segment, we can't split further - try harder with individual segment
							if (segmentGroup.length === 1) {
								try {
									const { result } = await retrieveTranslationWithQuotaHandling(
										chunkText,
										language,
										apiKey,
										5, // More retries for single segments
										undefined, // No original segments for single segment
										onQuotaError, // Quota error callback
										onQuotaRetry, // Quota retry callback
										fileContext, // File context for better translation
									);
									const translatedChunks = result.split('|');

									// CRITICAL FIX: Ensure single segment always returns exactly one translation
									if (
										translatedChunks.length === 0 ||
										!translatedChunks[0].trim()
									) {
										return [segmentGroup[0].text]; // Return original if translation fails
									}
									// Return only the first translation for single segment
									return [translatedChunks[0]];
								} catch (singleError: any) {
									return [segmentGroup[0].text];
								}
							}

							// Split the group in half and process each part
							const midPoint = Math.ceil(segmentGroup.length / 2);
							const firstHalf = segmentGroup.slice(0, midPoint);
							const secondHalf = segmentGroup.slice(midPoint);

							const [firstResult, secondResult] = await Promise.all([
								processSegmentGroup(firstHalf),
								processSegmentGroup(secondHalf),
							]);

							const combinedResult = [...firstResult, ...secondResult];

							// CRITICAL FIX: Validate chunk splitting results
							if (combinedResult.length !== segmentGroup.length) {
								// Force correct length
								while (combinedResult.length < segmentGroup.length) {
									combinedResult.push(segmentGroup[combinedResult.length].text);
								}
								combinedResult.splice(segmentGroup.length);
							}

							return combinedResult;
						}

						if (error.message === 'QUOTA_ERROR') {
							throw error;
						}

						// For other errors, return original text to ensure 100% coverage
						return segmentGroup.map((seg) => seg.text);
					}
				};

				// ===== KEEP-ALIVE CONTROL =====
				let lastKeepAlive = Date.now();

				// Process each chunk
				for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
					const group = groups[chunkIndex];

					// ===== ENVIA KEEP-ALIVE SE NECESSÁRIO =====
					const now = Date.now();
					if (now - lastKeepAlive >= KEEP_ALIVE_INTERVAL_MS) {
						const keepAliveMsg: TranslationProgress = {
							type: 'keep_alive',
							translated: translatedSegments.length,
							total: totalSegments,
							percentage: Math.round(
								(translatedSegments.length / totalSegments) * 100,
							),
							currentChunk: chunkIndex + 1,
							totalChunks,
							message: '🔄 Keep-alive ping to prevent server timeout...',
							keepAliveUrl: KEEP_ALIVE_URL,
						};
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(keepAliveMsg)}\n\n`),
						);
						lastKeepAlive = now;
					}

					try {
						const translatedChunks = await processSegmentGroup(
							group,
							chunkIndex,
						);
						translatedSegments.push(...translatedChunks);

						// Update current segment index
						currentSegmentIndex += group.length;

						// Send progress update
						const progress: TranslationProgress = {
							type: 'progress',
							translated: currentSegmentIndex,
							total: totalSegments,
							percentage: Math.round(
								(currentSegmentIndex / totalSegments) * 100,
							),
							currentChunk: chunkIndex + 1,
							totalChunks,
							message: `Chunk ${chunkIndex + 1}/${totalChunks} completed (${currentSegmentIndex}/${totalSegments} subtitles)`,
						};
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(progress)}\n\n`),
						);

						// ===== DELAY ENTRE CHUNKS PARA EVITAR RATE LIMIT =====
						// Dá uma folga extra ao rate limiter entre chunks
						if (chunkIndex < totalChunks - 1) {
							await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms
						}
					} catch (error: any) {
						if (error.message === 'QUOTA_ERROR') {
							// Handle quota error specially
							const retryAfter = 65;

							// Quota hit, inform frontend
							const quotaError: TranslationProgress = {
								type: 'quota_error',
								translated: translatedSegments.length,
								total: totalSegments,
								percentage: Math.round(
									(translatedSegments.length / totalSegments) * 100,
								),
								currentChunk: chunkIndex + 1,
								totalChunks,
								message: `🚫 API quota limit reached! Translation paused at chunk ${chunkIndex + 1}/${totalChunks}. Waiting ${retryAfter}s for quota reset...`,
								retryAfter,
							};
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(quotaError)}\n\n`),
							);

							await new Promise((resolve) =>
								setTimeout(resolve, retryAfter * 1000),
							);

							// Send retry message
							const retryMessage: TranslationProgress = {
								type: 'retry',
								translated: translatedSegments.length,
								total: totalSegments,
								percentage: Math.round(
									(translatedSegments.length / totalSegments) * 100,
								),
								currentChunk: chunkIndex + 1,
								totalChunks,
								message: `✅ Quota reset successful! Resuming translation from chunk ${chunkIndex + 1}/${totalChunks}...`,
							};
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(retryMessage)}\n\n`),
							);

							const retryTranslatedChunks = await processSegmentGroup(
								group,
								chunkIndex,
							);
							translatedSegments.push(...retryTranslatedChunks);

							// Update current segment index
							currentSegmentIndex += group.length;
						} else if (isQuotaError(error)) {
							// NEW: Handle quota errors detected by isQuotaError function
							const retryAfter = 65;

							// Quota hit, inform frontend
							const quotaError: TranslationProgress = {
								type: 'quota_error',
								translated: translatedSegments.length,
								total: totalSegments,
								percentage: Math.round(
									(translatedSegments.length / totalSegments) * 100,
								),
								currentChunk: chunkIndex + 1,
								totalChunks,
								message: `🚫 API quota limit reached! Translation paused at chunk ${chunkIndex + 1}/${totalChunks}. Waiting ${retryAfter}s for quota reset...`,
								retryAfter,
							};
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(quotaError)}\n\n`),
							);

							await new Promise((resolve) =>
								setTimeout(resolve, retryAfter * 1000),
							);

							// Send retry message
							const retryMessage: TranslationProgress = {
								type: 'retry',
								translated: translatedSegments.length,
								total: totalSegments,
								percentage: Math.round(
									(translatedSegments.length / totalSegments) * 100,
								),
								currentChunk: chunkIndex + 1,
								totalChunks,
								message: `✅ Quota reset successful! Resuming translation from chunk ${chunkIndex + 1}/${totalChunks}...`,
							};
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(retryMessage)}\n\n`),
							);

							const retryTranslatedChunks = await processSegmentGroup(
								group,
								chunkIndex,
							);
							translatedSegments.push(...retryTranslatedChunks);

							// Update current segment index
							currentSegmentIndex += group.length;
						} else {
							// For any other error, also check if it might be quota-related
							const errorMsg = error?.message?.toLowerCase() || '';
							const isLikelyQuota =
								errorMsg.includes('429') ||
								errorMsg.includes('rate') ||
								errorMsg.includes('limit') ||
								errorMsg.includes('too many') ||
								errorMsg.includes('resource');

							if (isLikelyQuota && chunkIndex > 0) {
								const retryAfter = 65;
								const quotaError: TranslationProgress = {
									type: 'quota_error',
									translated: translatedSegments.length,
									total: totalSegments,
									percentage: Math.round(
										(translatedSegments.length / totalSegments) * 100,
									),
									currentChunk: chunkIndex + 1,
									totalChunks,
									message: `🚫 Possible quota limit detected! Translation paused at chunk ${chunkIndex + 1}/${totalChunks}. Waiting ${retryAfter}s...`,
									retryAfter,
								};
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(quotaError)}\n\n`),
								);

								// Wait and retry
								await new Promise((resolve) =>
									setTimeout(resolve, retryAfter * 1000),
								);

								const retryMessage: TranslationProgress = {
									type: 'retry',
									translated: translatedSegments.length,
									total: totalSegments,
									percentage: Math.round(
										(translatedSegments.length / totalSegments) * 100,
									),
									currentChunk: chunkIndex + 1,
									totalChunks,
									message: `✅ Resuming translation from chunk ${chunkIndex + 1}/${totalChunks}...`,
								};
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(retryMessage)}\n\n`),
								);

								const retryTranslatedChunks = await processSegmentGroup(
									group,
									chunkIndex,
								);
								translatedSegments.push(...retryTranslatedChunks);
								currentSegmentIndex += group.length;
							} else {
								// Regular error handling
								const errorData: TranslationProgress = {
									type: 'error',
									translated: currentSegmentIndex,
									total: totalSegments,
									percentage: Math.round(
										(currentSegmentIndex / totalSegments) * 100,
									),
									currentChunk: chunkIndex + 1,
									totalChunks,
									message: `Error in chunk ${chunkIndex + 1}: ${error.message}`,
								};
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
								);
								controller.close();
								return;
							}
						}
					}
				}

				// Build final SRT content
				let finalSRT = '';

				// CRITICAL FIX: Ensure translatedSegments array has the same length as segments array
				// This prevents the content offset bug where translations appear in wrong positions
				while (translatedSegments.length < segments.length) {
					const missingIndex = translatedSegments.length;
					translatedSegments.push(segments[missingIndex].text);
				}

				// Double-check array lengths match
				if (translatedSegments.length !== segments.length) {
					// Trim excess translations if somehow we have more
					translatedSegments = translatedSegments.slice(0, segments.length);
				}

				for (let i = 0; i < segments.length; i++) {
					const originalSegment = segments[i];
					const translatedText = translatedSegments[i] || originalSegment.text;

					// Formatar corretamente as linhas de diálogo
					const formattedText = formatDialogueLines(translatedText);

					// Add segment with proper spacing, but don't add extra line breaks at the end
					if (i === segments.length - 1) {
						// Last segment - don't add extra line breaks
						finalSRT += `${i + 1}\n${originalSegment.timestamp}\n${formattedText.trim()}\n`;
					} else {
						// Regular segment - add double line break for separation
						finalSRT += `${i + 1}\n${originalSegment.timestamp}\n${formattedText.trim()}\n\n`;
					}
				}

				// Send completion
				const completion: TranslationProgress = {
					type: 'complete',
					translated: totalSegments,
					total: totalSegments,
					percentage: 100,
					totalChunks,
					message: 'Translation completed successfully!',
				};
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(completion)}\n\n`),
				);

				// Send final result
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ type: 'result', content: finalSRT })}\n\n`,
					),
				);
			} catch (error: any) {
				const errorData: TranslationProgress = {
					type: 'error',
					translated: 0,
					total: 0,
					percentage: 0,
					message: `Unexpected error: ${error.message}`,
				};
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
				);
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	});
}
