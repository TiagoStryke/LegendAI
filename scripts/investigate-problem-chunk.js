/**
 * Investigação do Chunk Problemático
 *
 * Objetivo: Entender POR QUE a API junta segmentos mesmo com o prompt dizendo para não fazer isso
 */

const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { generateText } = require('ai');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = 'gemini-2.5-flash';

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
// TESTE DO CHUNK PROBLEMÁTICO
// ============================================================================

async function testProblemChunk() {
	console.log(
		'\n╔═══════════════════════════════════════════════════════════════╗',
	);
	console.log(
		'║            INVESTIGAÇÃO DO CHUNK PROBLEMÁTICO                ║',
	);
	console.log(
		'╚═══════════════════════════════════════════════════════════════╝\n',
	);

	// Lê o SRT completo
	const srtPath = path.resolve(
		'./test/Dexter.New.Blood.S01E10.I.peccati.del.padre.ITA.ENG.2160p.HDR.WEB.H.265-MeM.GP_eng.srt',
	);
	const content = fs.readFileSync(srtPath, 'utf-8');
	const subtitles = parseSRT(content);

	console.log(`📄 Total de legendas: ${subtitles.length}\n`);

	// O chunk problemático é o chunk 2 (índices 100-199) → depois dividido em 2 (100-149 e 150-199)
	// O segundo chunk (150-199) → dividido em chunks de 15
	// O primeiro chunk de 15 (índices 150-164) é o que falhou

	const startIdx = 150;
	const endIdx = 165; // 15 legendas
	const problemChunk = subtitles.slice(startIdx, endIdx);

	console.log(`🎯 Testando legendas ${startIdx + 1} a ${endIdx}`);
	console.log(`📊 Total de segmentos: ${problemChunk.length}\n`);

	// Mostra os segmentos originais
	console.log(
		'═══════════════════════════════════════════════════════════════',
	);
	console.log('SEGMENTOS ORIGINAIS:');
	console.log(
		'═══════════════════════════════════════════════════════════════\n',
	);

	problemChunk.forEach((seg, idx) => {
		// Mostra quebras de linha explicitamente
		const textWithVisible = seg.text.replace(/\n/g, '⏎\n');
		console.log(
			`[${idx + 1}] #${seg.index}: ${seg.startTime} → ${seg.endTime}`,
		);
		console.log(`    ${textWithVisible}`);
		console.log('');
	});

	// Junta com pipe
	const inputText = problemChunk.map((s) => s.text).join('|');
	const inputCount = problemChunk.length;

	console.log(
		'═══════════════════════════════════════════════════════════════',
	);
	console.log('INPUT PARA API (com pipes):');
	console.log(
		'═══════════════════════════════════════════════════════════════\n',
	);
	console.log(inputText);
	console.log(`\n📊 Input segments: ${inputCount}\n`);

	// System prompt IDÊNTICO ao usado no teste
	const systemPrompt =
		'Você é um tradutor profissional especializado em legendas de filmes e séries, com foco especial em português brasileiro. ' +
		'IMPORTANTE: Preserve cuidadosamente toda a formatação original, incluindo tags HTML como <i> para itálico. ' +
		"Separe os segmentos de tradução com o símbolo '|'. " +
		'Mantenha o estilo e tom da linguagem original. ' +
		'Nomes próprios não devem ser traduzidos. ' +
		'CRÍTICO: Preserve EXATAMENTE a estrutura de quebras de linha do texto original. ' +
		"Quando encontrar diálogos com hífens em linhas separadas (como '-Texto1\\n-Texto2'), mantenha cada fala em sua própria linha com quebra de linha (\\n). " +
		'NUNCA una múltiplas falas em uma única linha.';

	const fullPrompt = `${systemPrompt}\n\nTraduza estas legendas para português brasileiro: ${inputText}`;

	console.log(
		'═══════════════════════════════════════════════════════════════',
	);
	console.log('CHAMANDO API...');
	console.log(
		'═══════════════════════════════════════════════════════════════\n',
	);

	// Inicializa API
	const google = createGoogleGenerativeAI({ apiKey: API_KEY });
	const model = google(MODEL);

	const startTime = Date.now();
	const result = await generateText({
		model: model,
		prompt: fullPrompt,
	});
	const outputText = result.text;
	const duration = Date.now() - startTime;

	console.log(`✅ Resposta recebida em ${duration}ms\n`);

	// Analisa o output
	const outputSegments = outputText.split('|');
	const outputCount = outputSegments.length;

	console.log(
		'═══════════════════════════════════════════════════════════════',
	);
	console.log('OUTPUT DA API (completo):');
	console.log(
		'═══════════════════════════════════════════════════════════════\n',
	);
	console.log(outputText);
	console.log('');

	console.log(
		'═══════════════════════════════════════════════════════════════',
	);
	console.log('SEGMENTOS TRADUZIDOS:');
	console.log(
		'═══════════════════════════════════════════════════════════════\n',
	);

	outputSegments.forEach((seg, idx) => {
		const textWithVisible = seg.replace(/\n/g, '⏎\n');
		console.log(`[${idx + 1}] ${textWithVisible}`);
		console.log('');
	});

	// Validação
	console.log(
		'═══════════════════════════════════════════════════════════════',
	);
	console.log('ANÁLISE DE VALIDAÇÃO:');
	console.log(
		'═══════════════════════════════════════════════════════════════\n',
	);

	console.log(`📊 Input count:  ${inputCount}`);
	console.log(`📊 Output count: ${outputCount}`);
	console.log(`📊 Diferença:    ${outputCount - inputCount}`);
	console.log(
		`📊 Status:       ${inputCount === outputCount ? '✅ PASSOU' : '❌ FALHOU'}\n`,
	);

	if (inputCount !== outputCount) {
		console.log('🔍 ANÁLISE DE DISCREPÂNCIA:\n');

		// Tenta identificar onde os segmentos foram unidos
		if (outputCount < inputCount) {
			console.log(`❌ API JUNTOU ${inputCount - outputCount} segmentos\n`);

			// Análise detalhada: compara input vs output
			console.log('Tentando identificar quais segmentos foram unidos...\n');

			let inputIdx = 0;
			let outputIdx = 0;

			while (inputIdx < inputCount && outputIdx < outputCount) {
				const originalText = problemChunk[inputIdx].text;
				const translatedText = outputSegments[outputIdx];

				console.log(`Comparando input[${inputIdx}] com output[${outputIdx}]:`);
				console.log(`  Original: "${originalText.substring(0, 50)}..."`);
				console.log(`  Tradução: "${translatedText.substring(0, 50)}..."`);

				// Verifica se o output contém múltiplos inputs (heurística simples)
				const originalWords = originalText.split(/\s+/).length;
				const translatedWords = translatedText.split(/\s+/).length;

				if (translatedWords > originalWords * 2) {
					console.log(
						`  ⚠️  Output parece conter múltiplos segmentos (${translatedWords} palavras vs ${originalWords} esperadas)`,
					);
				}

				console.log('');
				inputIdx++;
				outputIdx++;
			}
		} else if (outputCount > inputCount) {
			console.log(
				`❌ API DIVIDIU/ADICIONOU ${outputCount - inputCount} segmentos extras\n`,
			);
		}
	}

	// Salva resultado para análise
	const reportPath = './test/problem-chunk-report.json';
	fs.writeFileSync(
		reportPath,
		JSON.stringify(
			{
				meta: {
					inputCount,
					outputCount,
					difference: outputCount - inputCount,
					duration,
					passed: inputCount === outputCount,
				},
				input: {
					raw: inputText,
					segments: problemChunk.map((s) => s.text),
				},
				output: {
					raw: outputText,
					segments: outputSegments,
				},
			},
			null,
			2,
		),
	);

	console.log(`💾 Relatório salvo em: ${reportPath}\n`);
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

testProblemChunk().catch((error) => {
	console.error('\n❌ ERRO:', error);
	process.exit(1);
});
