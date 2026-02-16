/**
 * Script de teste para debuggar a API de tradução do LegendAI
 * Replica EXATAMENTE a lógica do site para identificar problemas
 *
 * Uso: node scripts/test/test-translation.js [arquivo.srt]
 */

const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { generateText } = require('ai');
const { encoding_for_model } = require('tiktoken');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

// API Key hardcoded (mesma do site)
const API_KEY = 'AIzaSyAWAF5LUAuUYji5fZJiQ_Jvv1ZtLmSIfW8';

// Constantes (mesmas do site)
const MAX_TOKENS_IN_SEGMENT = 400;
const MAX_RETRIES = 3;
const LANGUAGE = 'Portuguese (Brazil)';

// ============================================================================
// FUNÇÕES HELPER (copiadas EXATAMENTE do site)
// ============================================================================

/**
 * Parse um segmento SRT
 */
function parseSegment(text) {
	const lines = text.split(/\r\n|\n/);
	const id = lines[0];
	const timestamp = lines[1];
	const textLines = lines.slice(2);

	return {
		id: parseInt(id),
		timestamp,
		text: textLines.join(' '),
	};
}

/**
 * Conta tokens de um texto
 */
function numTokens(text) {
	const encoder = encoding_for_model('gpt-4o-mini');
	const tokens = encoder.encode(text);
	const count = tokens.length;
	encoder.free();
	return count;
}

/**
 * Agrupa segmentos por comprimento de token
 */
function groupSegmentsByTokenLength(segments, length) {
	const groups = [];
	let currentGroup = [];
	let currentGroupTokenCount = 0;

	for (const segment of segments) {
		const segmentTokenCount = numTokens(segment.text);

		if (currentGroupTokenCount + segmentTokenCount <= length) {
			currentGroup.push(segment);
			currentGroupTokenCount += segmentTokenCount + 1; // inclui tamanho do "|" delimitador
		} else {
			groups.push(currentGroup);
			currentGroup = [segment];
			currentGroupTokenCount = segmentTokenCount;
		}
	}

	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
}

/**
 * Formata corretamente as linhas de diálogo preservando a estrutura original
 */
function formatDialogueLines(text) {
	// Regex para detectar falas de diálogo vs palavras compostas
	const dialoguePattern = /^-[^-\s][^-]*(?:\s+-[^-\s][^-]*)*$/;
	const compoundWordPattern =
		/^[a-záàâãäéèêëíìîïóòôõöúùûüç]+-[a-záàâãäéèêëíìîïóòôõöúùûüç]+$/i;

	// Se o texto contém múltiplas ocorrências de "espaco-hifen-texto" em uma linha
	const concatenatedDialoguePattern = /\s+-[^\s-]/g;
	const matches = text.match(concatenatedDialoguePattern);

	if (matches && matches.length > 0) {
		// Detectou diálogo concatenado - precisa separar
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

	// Verifica se é uma palavra composta simples
	const trimmedText = text.trim();
	if (compoundWordPattern.test(trimmedText)) {
		return text;
	}

	return text;
}

/**
 * Extrai informações contextuais do nome do arquivo
 */
function extractFileContext(filename) {
	if (!filename) return '';

	const cleanName = filename.replace(/\.(srt|vtt|ass|ssa)$/i, '').toLowerCase();
	let context = '';

	// Detectar série/episódio
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
				.replace(/\s+/g, ' ')
				.trim()
				.split(' ')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ');
			const year = movieMatch[2];
			context = `Esta é uma legenda do filme "${movieName}" (${year}).`;
		} else {
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

	// Detectar qualidade/fonte
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
}

/**
 * Verifica se um erro é de quota
 */
function isQuotaError(error) {
	const errorMessage = error?.message?.toLowerCase() || '';
	const errorString = String(error).toLowerCase();

	return (
		error?.status === 429 ||
		error?.code === 429 ||
		error?.statusCode === 429 ||
		error?.lastError?.statusCode === 429 ||
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
		errorString.includes('too many requests')
	);
}

/**
 * Traduz um texto com retry e handling de quota (LÓGICA EXATA DO SITE)
 */
async function retrieveTranslationWithQuotaHandling(
	text,
	apiKey,
	maxRetries,
	originalSegments,
	fileContext,
) {
	// Validação básica da chave
	if (apiKey.trim().length < 30) {
		throw new Error(
			'Chave API inválida: formato incorreto ou comprimento muito curto.',
		);
	}

	// Configuração padrão do SDK (v1beta)
	const googleProvider = createGoogleGenerativeAI({ apiKey });

	// gemini-2.5-flash é o modelo atual/estável para 2026
	const geminiModel = googleProvider('gemini-2.5-flash');

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			// Construir prompt do sistema com contexto
			let systemPrompt =
				"Você é um tradutor profissional especializado em legendas de filmes e séries, com foco especial em português brasileiro. IMPORTANTE: Preserve cuidadosamente toda a formatação original, incluindo tags HTML como <i> para itálico. Separe os segmentos de tradução com o símbolo '|'. Mantenha o estilo e tom da linguagem original. Nomes próprios não devem ser traduzidos. Preserve os nomes de programas como 'The Amazing Race'. CRÍTICO: Preserve EXATAMENTE a estrutura de quebras de linha do texto original. Quando encontrar diálogos com hífens em linhas separadas (como '-Texto1\\n-Texto2\\n-Texto3'), mantenha cada fala em sua própria linha com quebra de linha (\\n). NUNCA una múltiplas falas em uma única linha. Exemplo: '-Olá.\\n-Oi!' deve se tornar '-Olá.\\n-Oi!' e NÃO '-Olá. -Oi!'. Mantenha quebras de linha originais com \\n.";

			if (fileContext) {
				systemPrompt += `\n\nCONTEXTO: ${fileContext} Use este contexto para melhorar a qualidade da tradução, adaptando o vocabulário, estilo e tom apropriados para o conteúdo específico.`;
			}

			console.log(
				`\n[Tentativa ${attempt + 1}/${maxRetries}] Enviando para Gemini API...`,
			);
			console.log(
				`Texto a traduzir (${text.length} chars, ${text.split('|').length} segmentos)`,
			);

			// Google Gemini API não aceita messages com role 'system' junto com user
			// Vamos colocar as instruções direto no prompt user
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

			console.log(
				`✅ Resposta recebida: ${translatedText.length} chars, ${translatedText.split('|').length} segmentos`,
			);

			// Verificar se a resposta foi truncada
			const inputSegments = text.split('|').length;
			const outputSegments = translatedText.split('|').length;

			if (outputSegments < inputSegments) {
				const missingSegments = inputSegments - outputSegments;
				console.log(
					`⚠️  Resposta truncada! Faltam ${missingSegments} segmentos (${outputSegments}/${inputSegments})`,
				);

				// Se perdeu segmentos E temos os segmentos originais, vamos dividir
				if (
					missingSegments > 0 &&
					originalSegments &&
					originalSegments.length > 1
				) {
					throw new Error('SPLIT_CHUNK_NEEDED');
				}

				// Para chunks pequenos, tenta novamente uma vez
				if (attempt === 0 && inputSegments <= 10) {
					console.log('🔄 Chunk pequeno truncado, tentando novamente...');
					throw new Error('Response truncated - retry needed');
				}
			}

			return { result: translatedText };
		} catch (error) {
			console.log(`❌ Erro na tentativa ${attempt + 1}:`, error.message);

			// Se precisamos dividir o chunk, propaga o erro
			if (error.message === 'SPLIT_CHUNK_NEEDED') {
				throw error;
			}

			// Verificar erros de autenticação
			if (error instanceof Error) {
				const errorMessage = error.message.toLowerCase();
				if (
					errorMessage.includes('403') ||
					errorMessage.includes('auth') ||
					errorMessage.includes('authentication') ||
					errorMessage.includes('unauthorized') ||
					errorMessage.includes('forbidden') ||
					errorMessage.includes('invalid key') ||
					errorMessage.includes('invalid api key') ||
					errorMessage.includes('api key not valid') ||
					errorMessage.includes('missing api key') ||
					errorMessage.includes('api key is required') ||
					errorMessage.includes('gemini api key') ||
					errorMessage.includes("method doesn't allow unregistered callers") ||
					errorMessage.includes('caller not authorized')
				) {
					if (
						errorMessage.includes("method doesn't allow unregistered callers")
					) {
						throw new Error(
							'Erro de autenticação: O Google Gemini não reconheceu sua chave API. Verifique se a chave foi copiada corretamente e é válida.',
						);
					} else if (
						errorMessage.includes('invalid key') ||
						errorMessage.includes('invalid api key')
					) {
						throw new Error(
							'Erro de autenticação: Chave API inválida. Verifique se obteve a chave correta do Google AI Studio.',
						);
					} else {
						throw new Error(
							'Erro de autenticação: Chave de API inválida ou não autorizada.',
						);
					}
				}
			}

			// Verificar erros de quota
			if (isQuotaError(error)) {
				const retryAfter = 65;
				console.log(`🚫 QUOTA ERROR detectado! Aguardando ${retryAfter}s...`);

				if (attempt === maxRetries - 1) {
					throw new Error('QUOTA_ERROR');
				}

				await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
				console.log('✅ Tentando novamente após quota reset...');
				continue;
			}

			// Retry com backoff exponencial
			if (attempt < maxRetries - 1) {
				const delay = Math.pow(2, attempt) * 1000;
				console.log(
					`⏳ Aguardando ${delay / 1000}s antes de tentar novamente...`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			throw error;
		}
	}

	throw new Error('Max retries exceeded');
}

/**
 * Processa um grupo de segmentos (com splitting automático)
 */
async function processSegmentGroup(segmentGroup, chunkIndex) {
	const chunkText = segmentGroup.map((seg) => seg.text).join('|');

	try {
		const { result } = await retrieveTranslationWithQuotaHandling(
			chunkText,
			API_KEY,
			MAX_RETRIES,
			segmentGroup,
			null, // fileContext será passado separadamente
		);

		const translatedChunks = result.split('|');

		// Garantir que temos o número correto de traduções
		if (translatedChunks.length < segmentGroup.length) {
			console.log(
				`⚠️  Preenchendo ${segmentGroup.length - translatedChunks.length} segmentos faltantes...`,
			);
			for (let i = translatedChunks.length; i < segmentGroup.length; i++) {
				translatedChunks.push(segmentGroup[i].text);
			}
		} else if (translatedChunks.length > segmentGroup.length) {
			console.log(
				`⚠️  Removendo ${translatedChunks.length - segmentGroup.length} traduções extras...`,
			);
			translatedChunks.splice(segmentGroup.length);
		}

		return translatedChunks;
	} catch (error) {
		if (error.message === 'SPLIT_CHUNK_NEEDED') {
			console.log(
				`\n🔄 Chunk ${chunkIndex + 1} muito grande, dividindo (${segmentGroup.length} → ${Math.ceil(segmentGroup.length / 2)} + ${Math.floor(segmentGroup.length / 2)} segmentos)...`,
			);

			// Se só tem 1 segmento, não pode dividir mais
			if (segmentGroup.length === 1) {
				console.log(
					'⚠️  Não é possível dividir mais (apenas 1 segmento), tentando com mais retries...',
				);
				try {
					const { result } = await retrieveTranslationWithQuotaHandling(
						chunkText,
						API_KEY,
						5, // Mais retries para segmentos únicos
						undefined,
						null,
					);
					const translatedChunks = result.split('|');
					if (translatedChunks.length === 0 || !translatedChunks[0].trim()) {
						return [segmentGroup[0].text];
					}
					return [translatedChunks[0]];
				} catch (singleError) {
					console.log('❌ Falha mesmo com mais retries, usando texto original');
					return [segmentGroup[0].text];
				}
			}

			// Dividir ao meio
			const midPoint = Math.ceil(segmentGroup.length / 2);
			const firstHalf = segmentGroup.slice(0, midPoint);
			const secondHalf = segmentGroup.slice(midPoint);

			const [firstResult, secondResult] = await Promise.all([
				processSegmentGroup(firstHalf, chunkIndex),
				processSegmentGroup(secondHalf, chunkIndex),
			]);

			const combinedResult = [...firstResult, ...secondResult];

			// Validar resultado combinado
			if (combinedResult.length !== segmentGroup.length) {
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

		// Para outros erros, retornar texto original
		console.log('❌ Erro no chunk, usando texto original');
		return segmentGroup.map((seg) => seg.text);
	}
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function main() {
	console.log(
		'╔════════════════════════════════════════════════════════════════╗',
	);
	console.log(
		'║     SCRIPT DE TESTE - TRADUÇÃO LEGENDAI                       ║',
	);
	console.log(
		'║     Replica EXATAMENTE a lógica do site                       ║',
	);
	console.log(
		'╚════════════════════════════════════════════════════════════════╝\n',
	);

	// Pegar arquivo SRT da linha de comando
	const srtFile = process.argv[2];
	if (!srtFile) {
		console.error('❌ Erro: Forneça um arquivo SRT como argumento');
		console.log('Uso: node scripts/test/test-translation.js [arquivo.srt]\n');
		console.log(
			'Exemplo: node scripts/test/test-translation.js scripts/test/test-input.srt',
		);
		process.exit(1);
	}

	// Verificar se arquivo existe
	if (!fs.existsSync(srtFile)) {
		console.error(`❌ Erro: Arquivo não encontrado: ${srtFile}`);
		process.exit(1);
	}

	// Ler conteúdo do arquivo
	console.log(`📁 Lendo arquivo: ${srtFile}`);
	const content = fs.readFileSync(srtFile, 'utf-8');
	const filename = path.basename(srtFile);

	// Parse dos segmentos
	console.log('📝 Parseando segmentos...');
	const segments = content
		.split(/\r\n\r\n|\n\n/)
		.map(parseSegment)
		.filter(
			(segment) => segment.id && segment.timestamp && segment.text.trim(),
		);

	console.log(`✅ ${segments.length} segmentos válidos encontrados\n`);

	if (segments.length === 0) {
		console.error('❌ Erro: Nenhum segmento válido encontrado no arquivo');
		process.exit(1);
	}

	// Extrair contexto do arquivo
	const fileContext = extractFileContext(filename);
	if (fileContext) {
		console.log(`🎬 Contexto detectado: ${fileContext}\n`);
	}

	// Agrupar segmentos
	console.log(
		`📦 Agrupando segmentos (max ${MAX_TOKENS_IN_SEGMENT} tokens)...`,
	);
	const groups = groupSegmentsByTokenLength(segments, MAX_TOKENS_IN_SEGMENT);
	console.log(`✅ ${groups.length} chunks criados\n`);

	// Log dos chunks
	console.log('📊 Distribuição dos chunks:');
	groups.forEach((group, i) => {
		const tokens = numTokens(group.map((s) => s.text).join('|'));
		console.log(
			`   Chunk ${i + 1}: ${group.length} segmentos, ~${tokens} tokens`,
		);
	});
	console.log('\n' + '='.repeat(64) + '\n');

	// Processar chunks
	console.log('🚀 Iniciando tradução...\n');
	const translatedSegments = [];
	let currentSegmentIndex = 0;

	for (let chunkIndex = 0; chunkIndex < groups.length; chunkIndex++) {
		const group = groups[chunkIndex];
		const progress = ((chunkIndex / groups.length) * 100).toFixed(1);

		console.log(
			`\n[${'█'.repeat(Math.floor(progress / 5))}${' '.repeat(20 - Math.floor(progress / 5))}] ${progress}%`,
		);
		console.log(
			`\n📦 Processando Chunk ${chunkIndex + 1}/${groups.length} (${group.length} segmentos)...`,
		);

		try {
			const translatedChunks = await processSegmentGroup(group, chunkIndex);
			translatedSegments.push(...translatedChunks);
			currentSegmentIndex += group.length;

			console.log(
				`✅ Chunk ${chunkIndex + 1} concluído (${currentSegmentIndex}/${segments.length} segmentos traduzidos)`,
			);
		} catch (error) {
			console.log(`\n❌ ERRO no chunk ${chunkIndex + 1}:`, error.message);

			if (error.message === 'QUOTA_ERROR') {
				console.log('🚫 QUOTA ERROR - Aguardando 65s e tentando novamente...');
				await new Promise((resolve) => setTimeout(resolve, 65000));
				console.log('✅ Tentando chunk novamente...');

				try {
					const translatedChunks = await processSegmentGroup(group, chunkIndex);
					translatedSegments.push(...translatedChunks);
					currentSegmentIndex += group.length;
					console.log(`✅ Chunk ${chunkIndex + 1} concluído após retry`);
				} catch (retryError) {
					console.log(`❌ ERRO após retry:`, retryError.message);
					console.log('⚠️  Usando texto original para este chunk');
					translatedSegments.push(...group.map((s) => s.text));
					currentSegmentIndex += group.length;
				}
			} else {
				console.log('⚠️  Usando texto original para este chunk');
				translatedSegments.push(...group.map((s) => s.text));
				currentSegmentIndex += group.length;
			}
		}
	}

	console.log('\n' + '='.repeat(64));
	console.log('\n✅ Tradução concluída!\n');

	// Garantir que temos o mesmo número de traduções que segmentos
	while (translatedSegments.length < segments.length) {
		const missingIndex = translatedSegments.length;
		translatedSegments.push(segments[missingIndex].text);
	}

	if (translatedSegments.length > segments.length) {
		translatedSegments.splice(segments.length);
	}

	// Construir SRT final
	console.log('📝 Construindo arquivo SRT final...');
	let finalSRT = '';

	for (let i = 0; i < segments.length; i++) {
		const originalSegment = segments[i];
		const translatedText = translatedSegments[i] || originalSegment.text;
		const formattedText = formatDialogueLines(translatedText);

		if (i === segments.length - 1) {
			finalSRT += `${i + 1}\n${originalSegment.timestamp}\n${formattedText.trim()}\n`;
		} else {
			finalSRT += `${i + 1}\n${originalSegment.timestamp}\n${formattedText.trim()}\n\n`;
		}
	}

	// Salvar arquivo de saída
	const outputFile = srtFile.replace(/\.srt$/i, '-translated.srt');
	fs.writeFileSync(outputFile, finalSRT, 'utf-8');

	console.log(`✅ Arquivo salvo: ${outputFile}`);
	console.log(`\n📊 Estatísticas:`);
	console.log(`   • Segmentos processados: ${segments.length}`);
	console.log(`   • Chunks traduzidos: ${groups.length}`);
	console.log(`   • Arquivo de saída: ${outputFile}`);
	console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!\n');
}

// Executar
main().catch((error) => {
	console.error('\n❌ ERRO FATAL:', error);
	console.error('\nStack trace:', error.stack);
	process.exit(1);
});
