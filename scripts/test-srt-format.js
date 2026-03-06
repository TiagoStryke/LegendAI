/**
 * TESTE REVOLUCIONÁRIO - Formato SRT Completo
 *
 * Nova abordagem: Mandar número + timing + texto (formato SRT nativo)
 *
 * VANTAGENS:
 * - Estrutura natural do SRT preservada
 * - Validação simples: conta números de legenda
 * - Timings automaticamente preservados
 * - API não pode quebrar estrutura (números forçam separação)
 * - Mesmo se juntar diálogos, mantém legendas separadas
 */

const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { generateText } = require('ai');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const API_KEY = 'AIzaSyCMelLCbVk2jnlPuE2n_yqdEY4rPR0M_VM';
const MODEL = 'gemini-2.5-flash';
const SRT_FILE =
	'./test/Dexter.New.Blood.S01E10.I.peccati.del.padre.ITA.ENG.2160p.HDR.WEB.H.265-MeM.GP_eng.srt';

// Chunk sizes para testar
const CHUNK_SIZES = [100, 150, 200]; // Vamos testar chunks GRANDES

// ============================================================================
// ESTATÍSTICAS
// ============================================================================

const stats = {
	totalRequests: 0,
	successfulRequests: 0,
	failedRequests: 0,
	byChunkSize: {},
};

// Inicializa stats
CHUNK_SIZES.forEach((size) => {
	stats.byChunkSize[size] = { attempts: 0, success: 0, failed: 0, details: [] };
});

// ============================================================================
// EXTRAÇÃO DE CONTEXTO DO ARQUIVO (igual ao sistema real)
// ============================================================================

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
		}
	}

	return context;
}

// ============================================================================
// PARSE SRT
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
// BUILD SRT FORMAT (NOVA FUNÇÃO)
// ============================================================================

function buildSRTBlock(segments) {
	// Constrói blocos SRT completos: número + timing + texto
	const blocks = segments.map((seg) => {
		return `${seg.index}\n${seg.startTime} --> ${seg.endTime}\n${seg.text}`;
	});

	// Junta com linha em branco dupla (padrão SRT)
	return blocks.join('\n\n');
}

// ============================================================================
// PARSE SRT RESPONSE (NOVA FUNÇÃO)
// ============================================================================

function parseSRTResponse(response) {
	// Parse da resposta no formato SRT
	const blocks = response.trim().split(/\n\s*\n/);
	const parsed = [];

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		if (lines.length < 3) continue;

		const indexMatch = lines[0].match(/^(\d+)$/);
		if (!indexMatch) continue;

		const index = parseInt(indexMatch[1]);
		const timeLine = lines[1];
		const text = lines.slice(2).join('\n');

		const timeMatch = timeLine.match(/(\S+)\s+-->\s+(\S+)/);
		if (!timeMatch) continue;

		parsed.push({
			index,
			startTime: timeMatch[1],
			endTime: timeMatch[2],
			text: text.trim(),
		});
	}

	return parsed;
}

// ============================================================================
// VALIDAÇÃO DE LEGENDAS (NOVA ABORDAGEM)
// ============================================================================

// ✨ NOVA FUNÇÃO: Valida E CORRIGE automaticamente timings errados
function validateAndFixSRTResponse(inputSegments, outputSegments) {
	const inputIndices = inputSegments.map((s) => s.index).sort((a, b) => a - b);
	const outputIndices = outputSegments
		.map((s) => s.index)
		.sort((a, b) => a - b);

	// Verifica se todos os índices estão presentes
	const missingIndices = inputIndices.filter(
		(idx) => !outputIndices.includes(idx),
	);
	const extraIndices = outputIndices.filter(
		(idx) => !inputIndices.includes(idx),
	);

	// Verifica timings E CORRIGE automaticamente se necessário
	const timingErrors = [];
	const correctedSegments = [];

	for (const outputSeg of outputSegments) {
		const inputSeg = inputSegments.find((s) => s.index === outputSeg.index);

		if (inputSeg) {
			const timingMatch =
				inputSeg.startTime === outputSeg.startTime &&
				inputSeg.endTime === outputSeg.endTime;

			if (!timingMatch) {
				// 🔧 TIMING ERRADO - Registrar e CORRIGIR
				timingErrors.push({
					index: inputSeg.index,
					expected: `${inputSeg.startTime} --> ${inputSeg.endTime}`,
					got: `${outputSeg.startTime} --> ${outputSeg.endTime}`,
				});

				// ✅ AUTO-CORREÇÃO: Usar timing original, manter tradução
				correctedSegments.push({
					index: inputSeg.index,
					startTime: inputSeg.startTime, // 🔧 TIMING ORIGINAL
					endTime: inputSeg.endTime, // 🔧 TIMING ORIGINAL
					text: outputSeg.text, // ✅ TRADUÇÃO DA IA
				});
			} else {
				// ✅ Timing correto, manter como está
				correctedSegments.push(outputSeg);
			}
		} else {
			// Segmento extra (não existe no input)
			correctedSegments.push(outputSeg);
		}
	}

	// Adicionar segmentos faltando (se houver)
	for (const idx of missingIndices) {
		const inputSeg = inputSegments.find((s) => s.index === idx);
		if (inputSeg) {
			correctedSegments.push({
				...inputSeg,
				text: `[MISSING TRANSLATION] ${inputSeg.text}`,
			});
		}
	}

	// Ordenar por índice
	correctedSegments.sort((a, b) => a.index - b.index);

	const isValid =
		inputIndices.length === outputIndices.length &&
		missingIndices.length === 0 &&
		extraIndices.length === 0;

	return {
		isValid,
		isValidAfterCorrection: isValid, // Se contagem bate, é válido após correção
		inputCount: inputIndices.length,
		outputCount: outputIndices.length,
		missingIndices,
		extraIndices,
		timingErrors,
		timingsCorrected: timingErrors.length, // 🔧 Quantos timings foram corrigidos
		correctedSegments, // ✅ SEGMENTOS COM TIMINGS CORRIGIDOS
	};
}

// ============================================================================
// CHAMADA DE API COM FORMATO SRT
// ============================================================================

async function translateChunkSRTFormat(
	segments,
	chunkSize,
	chunkNumber,
	fileContext,
) {
	const google = createGoogleGenerativeAI({ apiKey: API_KEY });
	const model = google(MODEL);

	// Constrói input no formato SRT completo
	const inputSRT = buildSRTBlock(segments);
	const inputIndices = segments.map((s) => s.index);

	console.log(`\n${'═'.repeat(70)}`);
	console.log(
		`CHUNK ${chunkNumber} | Tamanho: ${chunkSize} legendas | Índices: ${inputIndices[0]}-${inputIndices[inputIndices.length - 1]}`,
	);
	console.log(`${'═'.repeat(70)}`);

	console.log('\n📥 INPUT (formato SRT):');
	console.log(inputSRT.substring(0, 300) + '...\n');

	// PROMPT ULTRA FORTALECIDO - Instruções ABSOLUTAS sobre timings
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

	// Adiciona contexto do arquivo
	if (fileContext) {
		systemPrompt += `\n\n🎬 CONTEXTO:\n${fileContext}\nUse este contexto para melhorar a qualidade e naturalidade da tradução.`;
	}

	const fullPrompt = `${systemPrompt}\n\n${'='.repeat(70)}\n\nTraduza as legendas abaixo mantendo EXATAMENTE a estrutura SRT:\n\n${inputSRT}`;

	try {
		stats.totalRequests++;
		stats.byChunkSize[chunkSize].attempts++;

		console.log('⏳ Chamando API...');
		const startTime = Date.now();

		const result = await generateText({
			model: model,
			prompt: fullPrompt,
		});

		const outputSRT = result.text;
		const duration = Date.now() - startTime;

		console.log(`✅ Resposta recebida em ${duration}ms\n`);

		console.log('📤 OUTPUT (formato SRT):');
		console.log(outputSRT.substring(0, 300) + '...\n');

		// Parse da resposta
		const outputSegments = parseSRTResponse(outputSRT);

		// ✨ VALIDAÇÃO E AUTO-CORREÇÃO
		const validation = validateAndFixSRTResponse(segments, outputSegments);

		console.log('🔍 VALIDAÇÃO E AUTO-CORREÇÃO:');
		console.log(`   Input legendas:    ${validation.inputCount}`);
		console.log(`   Output legendas:   ${validation.outputCount}`);
		console.log(
			`   Faltando:          ${validation.missingIndices.length} ${validation.missingIndices.length > 0 ? JSON.stringify(validation.missingIndices) : ''}`,
		);
		console.log(
			`   Extras:            ${validation.extraIndices.length} ${validation.extraIndices.length > 0 ? JSON.stringify(validation.extraIndices) : ''}`,
		);
		console.log(`   Erros de timing:   ${validation.timingErrors.length}`);

		if (validation.timingsCorrected > 0) {
			console.log(
				`   🔧 Timings corrigidos automaticamente: ${validation.timingsCorrected}`,
			);
		}

		console.log(
			`   Status:            ${validation.isValidAfterCorrection ? '✅ PASSOU (com correções)' : '❌ FALHOU'}\n`,
		);

		// Detalhes de erros (antes da correção)
		if (validation.timingErrors.length > 0) {
			console.log('⚠️  ERROS DE TIMING ENCONTRADOS (já foram corrigidos):');
			validation.timingErrors.slice(0, 5).forEach((err) => {
				console.log(
					`   Legenda ${err.index}: esperado "${err.expected}", recebido "${err.got}"`,
				);
			});
			if (validation.timingErrors.length > 5) {
				console.log(
					`   ... e mais ${validation.timingErrors.length - 5} erros`,
				);
			}
			console.log('');
		}

		const testResult = {
			chunkSize,
			chunkNumber,
			inputCount: validation.inputCount,
			outputCount: validation.outputCount,
			passed: validation.isValidAfterCorrection,
			timingsCorrected: validation.timingsCorrected,
			duration,
			validation,
			inputSample: inputSRT.substring(0, 200),
			outputSample: outputSRT.substring(0, 200),
		};

		stats.byChunkSize[chunkSize].details.push(testResult);

		// ✅ Usar segmentos CORRIGIDOS (timings originais + traduções)
		if (validation.isValidAfterCorrection) {
			stats.successfulRequests++;
			stats.byChunkSize[chunkSize].success++;
			return {
				success: true,
				segments: validation.correctedSegments, // 🔧 SEGMENTOS CORRIGIDOS
				timingsCorrected: validation.timingsCorrected,
			};
		} else {
			stats.failedRequests++;
			stats.byChunkSize[chunkSize].failed++;
			return {
				success: false,
				validation,
				segments: validation.correctedSegments, // 🔧 Mesmo falhando, retornar corrigidos
			};
		}
	} catch (error) {
		stats.failedRequests++;
		stats.byChunkSize[chunkSize].failed++;

		console.log(`❌ ERRO: ${error.message}\n`);

		stats.byChunkSize[chunkSize].details.push({
			chunkSize,
			chunkNumber,
			passed: false,
			error: error.message,
		});

		return { success: false, error: error.message };
	}
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function main() {
	console.log(
		'\n╔════════════════════════════════════════════════════════════════════╗',
	);
	console.log(
		'║     TESTE REVOLUCIONÁRIO - FORMATO SRT COMPLETO                   ║',
	);
	console.log(
		'║     Nova abordagem: número + timing + texto                       ║',
	);
	console.log(
		'╚════════════════════════════════════════════════════════════════════╝\n',
	);

	// Lê arquivo SRT
	const srtPath = path.resolve(SRT_FILE);
	console.log(`📂 Arquivo: ${srtPath}`);

	if (!fs.existsSync(srtPath)) {
		console.error(`❌ Arquivo não encontrado: ${srtPath}`);
		process.exit(1);
	}

	const content = fs.readFileSync(srtPath, 'utf-8');
	const subtitles = parseSRT(content);

	// Extrai contexto do nome do arquivo
	const filename = path.basename(SRT_FILE);
	const fileContext = extractFileContext(filename);

	console.log(`📊 Total de legendas: ${subtitles.length}`);
	console.log(`🎬 Contexto: ${fileContext || 'Nenhum contexto detectado'}`);
	console.log(`🧪 Tamanhos de chunk a testar: ${CHUNK_SIZES.join(', ')}`);
	console.log(`🔑 API Key: ${API_KEY.substring(0, 20)}...`);
	console.log(`🤖 Model: ${MODEL}\n`);

	const globalStartTime = Date.now();
	const allResults = [];

	// Testa cada tamanho de chunk
	for (const chunkSize of CHUNK_SIZES) {
		console.log('\n\n');
		console.log(
			'╔════════════════════════════════════════════════════════════════════╗',
		);
		console.log(
			`║           TESTANDO CHUNK SIZE: ${chunkSize} LEGENDAS                      ║`,
		);
		console.log(
			'╚════════════════════════════════════════════════════════════════════╝\n',
		);

		// Pega apenas os primeiros chunks para teste
		const numChunksToTest = 3; // Testa 3 chunks de cada tamanho

		for (let i = 0; i < numChunksToTest; i++) {
			const startIdx = i * chunkSize;
			const endIdx = Math.min(startIdx + chunkSize, subtitles.length);

			if (startIdx >= subtitles.length) break;

			const chunk = subtitles.slice(startIdx, endIdx);

			const result = await translateChunkSRTFormat(
				chunk,
				chunkSize,
				i + 1,
				fileContext,
			);
			allResults.push(result);

			// Rate limiting
			console.log('⏸️  Aguardando 2s (rate limit)...\n');
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	const globalDuration = Date.now() - globalStartTime;

	// ============================================================================
	// RELATÓRIO FINAL
	// ============================================================================

	console.log('\n\n');
	console.log(
		'╔════════════════════════════════════════════════════════════════════╗',
	);
	console.log(
		'║                        RELATÓRIO FINAL                            ║',
	);
	console.log(
		'╚════════════════════════════════════════════════════════════════════╝\n',
	);

	console.log(
		`⏱️  TEMPO TOTAL: ${(globalDuration / 1000).toFixed(2)}s (${(globalDuration / 60000).toFixed(2)} min)\n`,
	);

	console.log('📊 ESTATÍSTICAS GERAIS:');
	console.log(`   Total de requests:    ${stats.totalRequests}`);
	console.log(
		`   Sucessos:             ${stats.successfulRequests} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%)`,
	);
	console.log(
		`   Falhas:               ${stats.failedRequests} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(1)}%)\n`,
	);

	console.log('📈 POR TAMANHO DE CHUNK:\n');
	for (const size of CHUNK_SIZES) {
		const data = stats.byChunkSize[size];
		if (data.attempts > 0) {
			const successRate = ((data.success / data.attempts) * 100).toFixed(1);
			console.log(`   ${size} legendas:`);
			console.log(`      Tentativas: ${data.attempts}`);
			console.log(`      Sucessos:   ${data.success} ✅`);
			console.log(`      Falhas:     ${data.failed} ❌`);
			console.log(`      Taxa:       ${successRate}%\n`);
		}
	}

	console.log('🎯 ANÁLISE E RECOMENDAÇÕES:\n');

	// Encontra o melhor chunk size
	let bestSize = null;
	let bestRate = 0;

	for (const size of CHUNK_SIZES) {
		const data = stats.byChunkSize[size];
		if (data.attempts > 0) {
			const rate = (data.success / data.attempts) * 100;
			if (rate > bestRate) {
				bestRate = rate;
				bestSize = size;
			}
		}
	}

	if (bestSize && bestRate === 100) {
		console.log(`   ✅ RECOMENDAÇÃO: Use chunks de ${bestSize} legendas`);
		console.log(`      Taxa de sucesso: 100%`);
		console.log(
			`      Ganho vs atual: ${Math.round((bestSize / 15) * 100)}% mais rápido\n`,
		);

		const currentRequests = Math.ceil(877 / 15);
		const newRequests = Math.ceil(877 / bestSize);
		const timeSaved = (currentRequests - newRequests) / 5; // 5 RPM

		console.log(`   📊 IMPACTO PARA 877 LEGENDAS:`);
		console.log(
			`      Sistema atual (15):  ${currentRequests} requests = ${(currentRequests / 5).toFixed(1)} min`,
		);
		console.log(
			`      Novo sistema (${bestSize}): ${newRequests} requests = ${(newRequests / 5).toFixed(1)} min`,
		);
		console.log(
			`      Economia:            ${currentRequests - newRequests} requests = ${timeSaved.toFixed(1)} min mais rápido 🚀\n`,
		);
	} else if (bestSize) {
		console.log(
			`   ⚠️  Melhor resultado: ${bestSize} legendas (${bestRate.toFixed(1)}% sucesso)`,
		);
		console.log(
			`      Considere implementar com fallback para chunks menores\n`,
		);
	} else {
		console.log(`   ❌ Nenhum tamanho teve sucesso total`);
		console.log(`      Sistema atual (15 legendas) pode já estar otimizado\n`);
	}

	// Salva resultados detalhados
	const reportPath = './test/srt-format-test-report.json';
	fs.writeFileSync(
		reportPath,
		JSON.stringify(
			{
				meta: {
					totalTime: globalDuration,
					totalRequests: stats.totalRequests,
					successRate:
						((stats.successfulRequests / stats.totalRequests) * 100).toFixed(
							1,
						) + '%',
					bestChunkSize: bestSize,
					bestSuccessRate: bestRate.toFixed(1) + '%',
				},
				stats,
				results: allResults,
			},
			null,
			2,
		),
	);

	console.log(`💾 Relatório completo salvo em: ${reportPath}\n`);

	console.log(
		'═══════════════════════════════════════════════════════════════════════\n',
	);
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

main().catch((error) => {
	console.error('\n❌ ERRO FATAL:', error);
	console.error(error.stack);
	process.exit(1);
});
