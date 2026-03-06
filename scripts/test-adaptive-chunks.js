/**
 * Script TDD - Teste Adaptativo de Chunks com API Real
 *
 * Estratégia:
 * 1. Tenta chunk de 100 legendas
 * 2. Valida: outputSegments === inputSegments (EXATO)
 * 3. Se passar → continua
 * 4. Se falhar → divide em 2 chunks de 50
 * 5. Se 50 falhar → divide em chunks de 15 (fallback)
 */

const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { generateText } = require('ai');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = 'gemini-2.5-flash';
const TARGET_LANGUAGE = 'pt-BR';
const SRT_FILE =
	'./test/Dexter.New.Blood.S01E10.I.peccati.del.padre.ITA.ENG.2160p.HDR.WEB.H.265-MeM.GP_eng.srt';

// Chunk sizes para testar (adaptativo)
const CHUNK_SIZES = {
	LARGE: 100,
	MEDIUM: 50,
	SMALL: 15,
};

// ============================================================================
// ESTATÍSTICAS
// ============================================================================

const stats = {
	totalRequests: 0,
	successfulRequests: 0,
	failedRequests: 0,
	retries: 0,
	byChunkSize: {
		100: { attempts: 0, success: 0, failed: 0 },
		50: { attempts: 0, success: 0, failed: 0 },
		15: { attempts: 0, success: 0, failed: 0 },
	},
};

// ============================================================================
// FUNÇÕES DE PARSE SRT
// ============================================================================

function parseSRT(content) {
	const subtitles = [];
	const blocks = content.trim().split(/\n\s*\n/);

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		if (lines.length < 3) continue;

		const index = parseInt(lines[0]);
		const timeLine = lines[1];
		const text = lines.slice(2).join('\n');

		const timeMatch = timeLine.match(/(\S+)\s+-->\s+(\S+)/);
		if (!timeMatch) continue;

		subtitles.push({
			index,
			startTime: timeMatch[1],
			endTime: timeMatch[2],
			text: text.trim(),
		});
	}

	return subtitles;
}

// ============================================================================
// VALIDAÇÃO SIMPLES E DIRETA
// ============================================================================

function validateSegmentCount(inputText, outputText) {
	// Conta pipes no input
	const inputCount = inputText.split('|').length;

	// Conta pipes no output
	const outputCount = outputText.split('|').length;

	// VALIDAÇÃO SIMPLES: devem ser EXATAMENTE iguais
	const isValid = inputCount === outputCount;

	return {
		isValid,
		inputCount,
		outputCount,
		difference: outputCount - inputCount,
	};
}

// ============================================================================
// CHAMADA DE API
// ============================================================================

async function translateChunk(segments, chunkSize, chunkNumber) {
	// Inicializa Google AI SDK
	const google = createGoogleGenerativeAI({
		apiKey: API_KEY,
	});
	const model = google(MODEL);

	// Junta segmentos com separador |
	const text = segments.map((s) => s.text).join('|');

	// Conta segmentos de entrada
	const inputSegmentCount = segments.length;

	console.log(`\n[${'='.repeat(60)}]`);
	console.log(`[CHUNK ${chunkNumber}] Tamanho: ${chunkSize} legendas`);
	console.log(`[INPUT] ${inputSegmentCount} segmentos`);
	console.log(`[TEXTO] ${text.substring(0, 100)}...`);

	// System prompt (igual ao sistema atual)
	const systemPrompt =
		'Você é um tradutor profissional especializado em legendas de filmes e séries, com foco especial em português brasileiro. ' +
		'IMPORTANTE: Preserve cuidadosamente toda a formatação original, incluindo tags HTML como <i> para itálico. ' +
		"Separe os segmentos de tradução com o símbolo '|'. " +
		'Mantenha o estilo e tom da linguagem original. ' +
		'Nomes próprios não devem ser traduzidos. ' +
		'CRÍTICO: Preserve EXATAMENTE a estrutura de quebras de linha do texto original. ' +
		"Quando encontrar diálogos com hífens em linhas separadas (como '-Texto1\\n-Texto2'), mantenha cada fala em sua própria linha com quebra de linha (\\n). " +
		'NUNCA una múltiplas falas em uma única linha.';

	const fullPrompt = `${systemPrompt}\n\nTraduza estas legendas para português brasileiro: ${text}`;

	try {
		stats.totalRequests++;
		stats.byChunkSize[chunkSize].attempts++;

		const startTime = Date.now();
		const result = await generateText({
			model: model,
			prompt: fullPrompt,
		});
		const translatedText = result.text;
		const duration = Date.now() - startTime;

		console.log(`[API] Resposta em ${duration}ms`);
		console.log(`[OUTPUT] ${translatedText.substring(0, 100)}...`);

		// VALIDAÇÃO SIMPLES
		const validation = validateSegmentCount(text, translatedText);

		console.log(`\n[VALIDAÇÃO]`);
		console.log(`  Input segments:  ${validation.inputCount}`);
		console.log(`  Output segments: ${validation.outputCount}`);
		console.log(`  Diferença:       ${validation.difference}`);
		console.log(
			`  Status:          ${validation.isValid ? '✅ PASSOU' : '❌ FALHOU'}`,
		);

		if (validation.isValid) {
			stats.successfulRequests++;
			stats.byChunkSize[chunkSize].success++;

			// Divide a tradução de volta nos segmentos
			const translatedSegments = translatedText.split('|');
			return segments.map((seg, idx) => ({
				...seg,
				text: translatedSegments[idx] || seg.text,
			}));
		} else {
			stats.failedRequests++;
			stats.byChunkSize[chunkSize].failed++;

			throw new Error(
				`Segment count mismatch: expected ${validation.inputCount}, got ${validation.outputCount} (diff: ${validation.difference})`,
			);
		}
	} catch (error) {
		stats.failedRequests++;
		stats.byChunkSize[chunkSize].failed++;

		console.log(`[ERRO] ${error.message}`);
		throw error;
	}
}

// ============================================================================
// SISTEMA ADAPTATIVO COM RETRY
// ============================================================================

async function translateWithAdaptiveChunks(segments, chunkSize, chunkNumber) {
	try {
		// Tenta com o chunk size atual
		return await translateChunk(segments, chunkSize, chunkNumber);
	} catch (error) {
		console.log(
			`\n[RETRY] Chunk de ${chunkSize} falhou. Tentando estratégia menor...`,
		);
		stats.retries++;

		// Define próximo tamanho adaptativo
		if (chunkSize === CHUNK_SIZES.LARGE) {
			// 100 falhou → divide em 2 chunks de 50
			const mid = Math.ceil(segments.length / 2);
			const chunk1 = segments.slice(0, mid);
			const chunk2 = segments.slice(mid);

			console.log(`[ESTRATÉGIA] Dividindo 100 em 2 chunks de ~${mid}`);

			const result1 = await translateWithAdaptiveChunks(
				chunk1,
				CHUNK_SIZES.MEDIUM,
				`${chunkNumber}.1`,
			);
			const result2 = await translateWithAdaptiveChunks(
				chunk2,
				CHUNK_SIZES.MEDIUM,
				`${chunkNumber}.2`,
			);

			return [...result1, ...result2];
		} else if (chunkSize === CHUNK_SIZES.MEDIUM) {
			// 50 falhou → divide em chunks de 15
			const smallChunks = [];
			for (let i = 0; i < segments.length; i += CHUNK_SIZES.SMALL) {
				smallChunks.push(segments.slice(i, i + CHUNK_SIZES.SMALL));
			}

			console.log(
				`[ESTRATÉGIA] Dividindo 50 em ${smallChunks.length} chunks de 15`,
			);

			const results = [];
			for (let i = 0; i < smallChunks.length; i++) {
				const result = await translateWithAdaptiveChunks(
					smallChunks[i],
					CHUNK_SIZES.SMALL,
					`${chunkNumber}.${i + 1}`,
				);
				results.push(...result);
			}

			return results;
		} else {
			// Chunk de 15 falhou → sem fallback, propaga erro
			console.log(`[ERRO FATAL] Até chunk de 15 falhou. Impossível traduzir.`);
			throw error;
		}
	}
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function main() {
	console.log(
		'\n╔═══════════════════════════════════════════════════════════════╗',
	);
	console.log(
		'║         TESTE TDD - CHUNKS ADAPTATIVOS COM API REAL         ║',
	);
	console.log(
		'╚═══════════════════════════════════════════════════════════════╝\n',
	);

	// Lê arquivo SRT
	const srtPath = path.resolve(SRT_FILE);
	console.log(`[ARQUIVO] ${srtPath}`);

	if (!fs.existsSync(srtPath)) {
		console.error(`[ERRO] Arquivo não encontrado: ${srtPath}`);
		process.exit(1);
	}

	const content = fs.readFileSync(srtPath, 'utf-8');
	const subtitles = parseSRT(content);

	console.log(`[LEGENDAS] ${subtitles.length} segmentos encontrados\n`);

	// Divide em chunks de 100
	const chunks = [];
	for (let i = 0; i < subtitles.length; i += CHUNK_SIZES.LARGE) {
		chunks.push(subtitles.slice(i, i + CHUNK_SIZES.LARGE));
	}

	console.log(
		`[ESTRATÉGIA INICIAL] ${chunks.length} chunks de ~${CHUNK_SIZES.LARGE} legendas`,
	);
	console.log(`[API KEY] ${API_KEY.substring(0, 20)}...`);
	console.log(`[MODEL] ${MODEL}`);

	const startTime = Date.now();

	// Processa cada chunk
	const translatedSubtitles = [];
	for (let i = 0; i < chunks.length; i++) {
		console.log(
			`\n\n╔═══════════════════════════════════════════════════════════════╗`,
		);
		console.log(
			`║                    PROCESSANDO CHUNK ${i + 1}/${chunks.length}                    ║`,
		);
		console.log(
			`╚═══════════════════════════════════════════════════════════════╝`,
		);

		const result = await translateWithAdaptiveChunks(
			chunks[i],
			CHUNK_SIZES.LARGE,
			i + 1,
		);
		translatedSubtitles.push(...result);

		// Rate limiting: aguarda 1 segundo entre chunks
		if (i < chunks.length - 1) {
			console.log('\n[RATE LIMIT] Aguardando 1s...');
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	const duration = Date.now() - startTime;

	// ============================================================================
	// RELATÓRIO FINAL
	// ============================================================================

	console.log('\n\n');
	console.log(
		'╔═══════════════════════════════════════════════════════════════╗',
	);
	console.log(
		'║                      RELATÓRIO FINAL                         ║',
	);
	console.log(
		'╚═══════════════════════════════════════════════════════════════╝\n',
	);

	console.log(
		`⏱️  TEMPO TOTAL: ${(duration / 1000).toFixed(2)}s (${(duration / 60000).toFixed(2)} min)`,
	);
	console.log(
		`📊 LEGENDAS: ${subtitles.length} → ${translatedSubtitles.length}`,
	);
	console.log(
		`✅ INTEGRIDADE: ${subtitles.length === translatedSubtitles.length ? 'PRESERVADA' : '❌ CORROMPIDA'}`,
	);

	console.log('\n📈 ESTATÍSTICAS DE REQUESTS:');
	console.log(`   Total:        ${stats.totalRequests}`);
	console.log(
		`   Sucesso:      ${stats.successfulRequests} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%)`,
	);
	console.log(
		`   Falhas:       ${stats.failedRequests} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(1)}%)`,
	);
	console.log(`   Retries:      ${stats.retries}`);

	console.log('\n📊 POR TAMANHO DE CHUNK:');
	for (const [size, data] of Object.entries(stats.byChunkSize)) {
		if (data.attempts > 0) {
			const successRate = ((data.success / data.attempts) * 100).toFixed(1);
			console.log(
				`   ${size} legendas: ${data.attempts} tentativas | ${data.success} ✅ | ${data.failed} ❌ | Taxa: ${successRate}%`,
			);
		}
	}

	console.log('\n🎯 EFICIÊNCIA:');
	const theoreticalMin = Math.ceil(subtitles.length / CHUNK_SIZES.LARGE);
	const efficiency = ((theoreticalMin / stats.totalRequests) * 100).toFixed(1);
	console.log(`   Requests mínimos (100/chunk): ${theoreticalMin}`);
	console.log(`   Requests usados:              ${stats.totalRequests}`);
	console.log(`   Eficiência:                   ${efficiency}%`);

	console.log('\n💡 RECOMENDAÇÕES:');
	if (stats.byChunkSize[100].success === stats.byChunkSize[100].attempts) {
		console.log(
			'   ✅ Chunks de 100 funcionaram perfeitamente! Use esse tamanho.',
		);
	} else if (stats.byChunkSize[50].success > 0) {
		console.log(
			'   ⚠️  Chunks de 100 falharam, mas 50 funcionou. Use chunks de 50.',
		);
	} else {
		console.log(
			'   ❌ Apenas chunks de 15 funcionaram. Sistema atual está otimizado.',
		);
	}

	console.log(
		'\n═══════════════════════════════════════════════════════════════\n',
	);

	// Salva resultado
	const outputPath = './test/output-adaptive-test.json';
	fs.writeFileSync(
		outputPath,
		JSON.stringify(
			{
				meta: {
					duration,
					inputCount: subtitles.length,
					outputCount: translatedSubtitles.length,
					stats,
				},
				subtitles: translatedSubtitles.slice(0, 10), // Salva apenas primeiros 10 para inspeção
			},
			null,
			2,
		),
	);

	console.log(`💾 Resultado salvo em: ${outputPath}\n`);
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

main().catch((error) => {
	console.error('\n❌ ERRO FATAL:', error);
	process.exit(1);
});
