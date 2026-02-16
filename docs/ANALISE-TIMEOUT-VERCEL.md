# 🔍 Análise Técnica: Timeout do Vercel (300 segundos)

**Data:** 30 de dezembro de 2025  
**Issue:** #1  
**Criticidade:** 🔥 CRÍTICA  
**Status:** EM ANÁLISE

---

## 📋 Contexto

**Problema relatado:**

```
Vercel Runtime Timeout Error: Task timed out after 300 seconds
```

**Quando ocorre:**

- Legendas com >500 linhas
- Processamento sequencial demora >5 minutos
- Aplicação trava e não retorna resposta

**Por que funciona no Render:**

- Render **NÃO tem timeout de execução** (ou tem limite muito maior, tipo 30-60 minutos)
- Render usa instâncias persistentes (não serverless)
- Vercel usa **serverless functions** com limite rígido de 300s

---

## 🏗️ Arquitetura Atual

### Como está funcionando AGORA:

```
┌────────────┐                     ┌──────────────────┐
│   Cliente  │────POST /api────────▶│  Vercel Edge     │
│  (Browser) │                      │  (Serverless)    │
└────────────┘                      └──────────────────┘
      │                                      │
      │                                      │
      │                            ┌─────────▼─────────┐
      │                            │  route.ts         │
      │                            │  (851 linhas)     │
      │                            │                   │
      │                            │  Loop sequencial: │
      │                            │  for (chunk of    │
      │                            │       chunks) {   │
      │                            │    await gemini() │
      │                            │  }                │
      │                            └─────────┬─────────┘
      │                                      │
      │◀────SSE Stream Progress──────────────┤
      │     (data: {...})                    │
      │                                      │
      │                            ⏱️ TIMEOUT depois de
      │                               300 segundos!
      └──────────❌ ERRO ────────────────────┘
```

### Por que está quebrando:

1. **UMA única requisição HTTP**
   - Cliente faz POST → Servidor processa TUDO → Retorna resultado
   - Se demora >300s = timeout

2. **Processamento bloqueante**
   - `for await` loop esperando cada chunk
   - Cada chunk demora ~3-5 segundos
   - 100 chunks × 5s = 500 segundos ❌

3. **Serverless não é para long-running tasks**
   - Vercel limita funções em 10s (hobby), 60s (Pro), 300s (máximo com configuração)
   - Mesmo com Pro, não resolve para arquivos grandes

---

## 🎯 Todas as Soluções Possíveis

Vou analisar TODAS as opções, não só as 3 mencionadas no ROADMAP.

---

### ✅ Opção 1: Streaming com Chunks Menores (MAIS SIMPLES)

**Arquitetura:**

```
Cliente                      Servidor (Vercel)
   │                              │
   │────POST /api/translate──────▶│
   │  chunk1: [linhas 1-50]       │
   │                              │──── gemini() ────▶ Gemini
   │◀────response chunk1───────────│◀──── tradução ───┘
   │                              │
   │────POST /api/translate──────▶│
   │  chunk2: [linhas 51-100]     │
   │                              │──── gemini() ────▶ Gemini
   │◀────response chunk2───────────│◀──── tradução ───┘
   │                              │
   │  (repete até terminar)       │
```

**Como funciona:**

- Cliente divide arquivo em **chunks pequenos** (~30-50 linhas)
- Faz **múltiplas requisições HTTP** sequenciais
- Cada requisição processa 1 chunk e retorna em <30s
- Cliente concatena os resultados no final

**Implementação:**

**Cliente (React):**

```typescript
async function translateFile(file: File, apiKey: string) {
	const content = await file.text();
	const segments = parseSegmentsFromSRT(content);

	// Dividir em chunks pequenos (30-50 linhas cada)
	const LINES_PER_CHUNK = 40;
	const chunks = [];

	for (let i = 0; i < segments.length; i += LINES_PER_CHUNK) {
		chunks.push(segments.slice(i, i + LINES_PER_CHUNK));
	}

	const translatedSegments: Segment[] = [];

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];

		// Fazer POST para cada chunk
		const response = await fetch('/api/translate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				segments: chunk,
				apiKey,
				chunkIndex: i,
				totalChunks: chunks.length,
			}),
		});

		const result = await response.json();
		translatedSegments.push(...result.translatedSegments);

		// Atualizar progresso
		setProgress({
			current: translatedSegments.length,
			total: segments.length,
			percentage: (translatedSegments.length / segments.length) * 100,
		});
	}

	return buildSRTFromSegments(translatedSegments);
}
```

**Servidor (route.ts):**

```typescript
export async function POST(request: Request) {
	const { segments, apiKey, chunkIndex, totalChunks } = await request.json();

	// Processar apenas ESTE chunk (não todos)
	const textToTranslate = segments.map((s) => s.text).join('|');

	// Traduzir (rápido, <30s)
	const translated = await translateWithGemini(textToTranslate, apiKey);

	// Retornar resultado IMEDIATAMENTE
	return Response.json({
		translatedSegments: parseTranslatedSegments(translated, segments),
		chunkIndex,
		totalChunks,
	});
}
```

**Prós:**

- ✅ **Mais simples** de implementar (~4-6 horas)
- ✅ Funciona no Vercel sem mudanças de infra
- ✅ Cada requisição <30s = sem timeout
- ✅ Cliente tem controle total (pode pausar, cancelar, retomar)
- ✅ Pode processar arquivos ENORMES (10.000+ linhas)
- ✅ Progresso em tempo real natural (não precisa polling)

**Contras:**

- ❌ Mais requisições HTTP (impacto mínimo, é rápido)
- ❌ Cliente precisa gerenciar estado (mas já faz isso com chunks)
- ❌ Não resolve rate limiting (mas isso é problema separado)

**Princípios de Arquitetura:**

- ✅ **SRP:** Cada requisição = 1 chunk
- ✅ **Stateless:** Servidor não guarda estado entre requisições
- ✅ **Escalável:** Não depende de backend persistente
- ✅ **Resiliente:** Se uma requisição falha, só reprocessa aquele chunk

**Estimativa:** 4-6 horas de implementação

---

### ✅ Opção 2: Background Jobs com Polling (MAIS PROFISSIONAL)

**Arquitetura:**

```
Cliente                   API Gateway              Worker           Storage
   │                          │                      │                │
   │─POST /api/translate─────▶│                      │                │
   │  {file, apiKey}           │──create job─────────┼───────────────▶│
   │                           │                      │    Redis/DB    │
   │◀──{jobId: "abc123"}───────│                      │    jobs table  │
   │                           │                      │                │
   │                           │                      │◀────job────────┤
   │                           │                      │  status:pending│
   │                           │                      │                │
   │                           │                      │──process───────▶
   │                           │                      │   chunks
   │                           │                      │                │
   │                           │                      │──update────────▶
   │                           │                      │  progress 30%  │
   │                           │                      │                │
   │─GET /api/status/abc123───▶│──────────────────────┼───────────────▶│
   │◀──{progress: 30%}─────────│◀─────────────────────┼────────────────┤
   │                           │                      │                │
   │  (polling a cada 2s)      │                      │                │
   │                           │                      │──update────────▶
   │                           │                      │  status:done   │
   │                           │                      │  result: {...} │
   │─GET /api/status/abc123───▶│──────────────────────┼───────────────▶│
   │◀──{status: 'done', ───────│◀─────────────────────┼────────────────┤
   │    result: "..."}          │                      │                │
```

**Como funciona:**

1. Cliente faz POST inicial → retorna `jobId` imediatamente
2. Servidor cria job no Redis/DB com status "pending"
3. Worker assíncrono processa o job no background
4. Cliente faz polling GET `/api/status/{jobId}` a cada 2-3 segundos
5. Quando completo, cliente baixa o resultado

**Implementação:**

**Storage (Redis/Upstash):**

```typescript
interface Job {
	id: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	progress: number;
	totalSegments: number;
	translatedSegments: number;
	result?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

// jobs:{jobId} = JSON.stringify(job)
```

**API POST /api/translate:**

```typescript
export async function POST(request: Request) {
	const { content, apiKey, filename } = await request.json();

	const jobId = generateUniqueId(); // uuid v4

	// Salvar job no Redis
	await redis.set(
		`jobs:${jobId}`,
		JSON.stringify({
			id: jobId,
			status: 'pending',
			progress: 0,
			totalSegments: parseSegments(content).length,
			translatedSegments: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
		{ ex: 3600 },
	); // TTL 1 hora

	// Salvar input no Redis (temporário)
	await redis.set(
		`jobs:${jobId}:input`,
		JSON.stringify({
			content,
			apiKey,
			filename,
		}),
		{ ex: 3600 },
	);

	// Retornar jobId IMEDIATAMENTE (sem esperar)
	return Response.json({ jobId });
}
```

**Worker (Vercel Cron ou separado):**

```typescript
// Pode ser:
// 1. Vercel Cron (/api/cron/process-jobs) que roda a cada 10s
// 2. Vercel Edge Function com timeout maior
// 3. Separate worker (Railway, Render, AWS Lambda)

export async function processJob(jobId: string) {
	// Pegar input
	const input = await redis.get(`jobs:${jobId}:input`);
	const { content, apiKey, filename } = JSON.parse(input);

	// Atualizar status
	await updateJob(jobId, { status: 'processing' });

	try {
		const segments = parseSegments(content);
		const chunks = groupIntoChunks(segments);
		const translatedSegments = [];

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];

			// Traduzir chunk
			const translated = await translateWithGemini(chunk, apiKey);
			translatedSegments.push(...translated);

			// Atualizar progresso
			await updateJob(jobId, {
				progress: Math.round(
					(translatedSegments.length / segments.length) * 100,
				),
				translatedSegments: translatedSegments.length,
				updatedAt: Date.now(),
			});
		}

		// Finalizar
		const result = buildSRT(translatedSegments);
		await updateJob(jobId, {
			status: 'done',
			result,
			progress: 100,
			updatedAt: Date.now(),
		});
	} catch (error) {
		await updateJob(jobId, {
			status: 'error',
			error: error.message,
			updatedAt: Date.now(),
		});
	} finally {
		// Limpar input (não precisa mais)
		await redis.del(`jobs:${jobId}:input`);
	}
}
```

**API GET /api/status/:jobId:**

```typescript
export async function GET(
	request: Request,
	{ params }: { params: { jobId: string } },
) {
	const { jobId } = params;

	const job = await redis.get(`jobs:${jobId}`);

	if (!job) {
		return Response.json({ error: 'Job not found' }, { status: 404 });
	}

	return Response.json(JSON.parse(job));
}
```

**Cliente (React com polling):**

```typescript
async function translateFile(file: File, apiKey: string) {
	// 1. Iniciar job
	const { jobId } = await fetch('/api/translate', {
		method: 'POST',
		body: JSON.stringify({ content: await file.text(), apiKey }),
	}).then((r) => r.json());

	// 2. Polling a cada 2 segundos
	return new Promise((resolve, reject) => {
		const interval = setInterval(async () => {
			const job = await fetch(`/api/status/${jobId}`).then((r) => r.json());

			// Atualizar UI
			setProgress({
				percentage: job.progress,
				current: job.translatedSegments,
				total: job.totalSegments,
			});

			if (job.status === 'done') {
				clearInterval(interval);
				resolve(job.result);
			}

			if (job.status === 'error') {
				clearInterval(interval);
				reject(new Error(job.error));
			}
		}, 2000);
	});
}
```

**Prós:**

- ✅ **Sem timeout** (worker roda quanto tempo precisar)
- ✅ **Escalável** (pode ter múltiplos workers)
- ✅ **Resiliente** (se worker crashar, outro pode continuar)
- ✅ **Profissional** (padrão da indústria)
- ✅ **Pode processar arquivos ENORMES** (10.000+ linhas)
- ✅ **Cliente pode fechar browser** e voltar depois (com jobId)

**Contras:**

- ❌ **Mais complexo** (~2-3 dias de implementação)
- ❌ **Requer persistência** (Redis/Upstash ou DB)
- ❌ **Custo adicional** (Upstash Redis ou PostgreSQL)
- ❌ **Mais moving parts** (mais coisas que podem quebrar)
- ❌ **Latência inicial** (precisa criar job antes de começar)

**Princípios de Arquitetura:**

- ✅ **Separation of Concerns:** API ≠ Worker
- ✅ **Async Processing:** Não bloqueia requisição
- ✅ **Stateful:** Usa storage para compartilhar estado
- ✅ **Scalable:** Workers podem escalar horizontalmente
- ✅ **Observable:** Progresso rastreável via polling

**Estimativa:** 2-3 dias de implementação

---

### ✅ Opção 3: WebSockets Real-Time (OVER-ENGINEERED)

**Arquitetura:**

```
Cliente                   WebSocket Server         Worker
   │                            │                     │
   │─────connect ws://──────────▶│                     │
   │                             │                     │
   │──msg: {type: 'start'}──────▶│─────dispatch───────▶│
   │                             │                     │
   │◀──msg: {type: 'progress'}───│◀────update─────────┤
   │    {progress: 20%}           │                     │
   │                             │                     │
   │◀──msg: {type: 'progress'}───│◀────update─────────┤
   │    {progress: 40%}           │                     │
   │                             │                     │
   │◀──msg: {type: 'done'}───────│◀────done───────────┤
   │    {result: "..."}           │                     │
```

**Como funciona:**

- Cliente abre **conexão WebSocket**
- Servidor processa chunks e envia **updates em tempo real** via WS
- Sem polling (push-based)

**Prós:**

- ✅ **Real-time** (sem delay de polling)
- ✅ **Eficiente** (não faz várias requisições HTTP)
- ✅ **Modern** (padrão para apps real-time)

**Contras:**

- ❌ **Muito complexo** (~4-5 dias)
- ❌ **Vercel não suporta WS** nativamente (precisa de outro servidor)
- ❌ **Over-engineering** para este caso de uso
- ❌ **Mais caro** (precisa servidor persistente para WS)

**Estimativa:** 4-5 dias + infra adicional

**Não recomendo** para este projeto.

---

### ✅ Opção 4: Server-Sent Events (SSE) - JÁ ESTÁ USANDO!

Espera... **vocês JÁ ESTÃO usando SSE**! 🤔

Olhando o código atual:

```typescript
// app/api/route.ts
export async function POST(request: Request) {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			// ...processar chunks...

			// Enviar progresso via SSE
			const progressData = {
				type: 'progress',
				translated: translatedSegments.length,
				total: segments.length,
				percentage: Math.round(
					(translatedSegments.length / segments.length) * 100,
				),
			};
			controller.enqueue(
				encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`),
			);
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

**O problema NÃO é a arquitetura!**  
**O problema é processar TUDO em UMA única requisição!**

**A solução é simples:** Manter SSE, mas fazer múltiplas requisições curtas.

---

### ✅ Opção 5: Migrar para Render/Railway (NÃO RESOLVE O PROBLEMA)

**Por que funciona no Render:**

- Render usa **instâncias persistentes** (não serverless)
- Sem limite de 300s
- Pode rodar por horas

**Prós:**

- ✅ **Resolve imediatamente** (2 horas)
- ✅ **Sem código novo**

**Contras:**

- ❌ **Não resolve o problema raiz** (código ainda ruim)
- ❌ **Perde benefícios do Vercel** (Edge, CDN global, preview deployments)
- ❌ **Mais caro** (Render cobra por instância sempre ligada)
- ❌ **Não escala bem** (instância tem limite de RAM/CPU)

**Não recomendo** como solução definitiva.

---

### ✅ Opção 6: Aumentar Timeout do Vercel (NÃO FUNCIONA)

**Limites do Vercel:**

- Hobby: 10s
- Pro: 60s (padrão), até 300s (config)
- Enterprise: até 900s (15 minutos)

**Mas:**

- ❌ Você JÁ está no máximo (300s)
- ❌ Arquivos grandes ainda vão estourar
- ❌ Não resolve o problema de design

**Não é solução.**

---

## 🏆 Recomendação Final

### Para AGORA (resolver urgente): **Opção 1 - Múltiplas Requisições**

**Por quê:**

1. **Mais simples** (~4-6 horas vs 2-3 dias)
2. **Funciona no Vercel** (sem infra adicional)
3. **Resolve o timeout** completamente
4. **Mantém SSE** para progresso
5. **Escalável** (processa arquivos enormes)
6. **Princípios de arquitetura** sólidos (stateless, SRP)

**Como implementar:**

1. Modificar cliente para dividir arquivo em chunks pequenos (30-50 linhas)
2. Fazer loop de requisições POST sequenciais
3. Cada POST processa 1 chunk e retorna JSON (não SSE!)
4. Cliente concatena resultados e atualiza barra de progresso
5. No final, monta SRT completo

**Tempo:** 4-6 horas

---

### Para FUTURO (quando monetizar): **Opção 2 - Background Jobs**

**Quando migrar:**

- Quando implementar autenticação/pagamentos
- Quando tiver >1000 usuários
- Quando precisar de features como:
  - "Sair do site e voltar depois"
  - "Processar vários arquivos em paralelo"
  - "Fila de prioridade (usuários pagos primeiro)"

**O que precisa:**

- Redis (Upstash: ~$10/mês)
- Worker separado (Vercel Cron ou Railway)
- Sistema de jobs com status

---

## 🚀 Plano de Ação Recomendado

### SPRINT 1 - Resolver AGORA (1 dia)

**Implementar Opção 1:**

1. **Modificar cliente** (`components/Form.tsx`):

   ```typescript
   // Dividir arquivo em chunks pequenos
   const LINES_PER_REQUEST = 40;

   for (let i = 0; i < allSegments.length; i += LINES_PER_REQUEST) {
     const chunk = allSegments.slice(i, i + LINES_PER_REQUEST);

     const response = await fetch('/api/translate-chunk', {
       method: 'POST',
       body: JSON.stringify({ chunk, apiKey, filename }),
     });

     const result = await response.json();
     translatedSegments.push(...result.segments);

     // Atualizar progresso
     setProgress(...);
   }
   ```

2. **Criar novo endpoint** (`app/api/translate-chunk/route.ts`):

   ```typescript
   export async function POST(request: Request) {
   	const { chunk, apiKey, filename } = await request.json();

   	// Traduzir APENAS este chunk (rápido!)
   	const translated = await translateChunk(chunk, apiKey);

   	// Retornar JSON (não SSE)
   	return Response.json({
   		segments: translated,
   		processedCount: chunk.length,
   	});
   }
   ```

3. **Testar:**
   - Arquivo pequeno (10 linhas)
   - Arquivo médio (100 linhas)
   - Arquivo grande (1000+ linhas)

4. **Deploy no Vercel**

**Tempo estimado:** 4-6 horas

---

### SPRINT 5+ - Quando Monetizar (futuro)

**Migrar para Opção 2 (Background Jobs):**

1. Setup Upstash Redis
2. Criar sistema de jobs
3. Implementar workers
4. Implementar polling no cliente
5. Migrar usuários gradualmente

**Tempo estimado:** 2-3 dias

---

## 📊 Comparação Final

| Critério                 | Opção 1: Múltiplas Reqs | Opção 2: Background Jobs | Opção 5: Migrar Render |
| ------------------------ | ----------------------- | ------------------------ | ---------------------- |
| **Tempo implementação**  | 4-6 horas               | 2-3 dias                 | 2 horas                |
| **Complexidade**         | Baixa                   | Alta                     | Baixíssima             |
| **Custo adicional**      | $0                      | ~$10/mês (Redis)         | ~$7/mês (instância)    |
| **Funciona no Vercel**   | ✅ Sim                  | ✅ Sim                   | ❌ Não (outro host)    |
| **Escalabilidade**       | ✅ Alta                 | ✅ Muito alta            | ⚠️ Média               |
| **Resolve timeout**      | ✅ Sim (100%)           | ✅ Sim (100%)            | ✅ Sim                 |
| **Arquitetura limpa**    | ✅ Sim                  | ✅ Sim                   | ❌ Não muda nada       |
| **Pronto para produção** | ✅ Sim                  | ✅ Sim                   | ⚠️ Temporário          |

**Winner:** 🏆 **Opção 1** para resolver AGORA, **Opção 2** para longo prazo.

---

## 🤔 Perguntas Frequentes

### "Por que não usar Vercel Edge Functions?"

- Edge Functions também têm limite de tempo
- Não resolve o problema raiz (muito processamento em uma req)

### "Por que não processar em paralelo?"

- Gemini tem rate limit (10 req/min no free tier)
- Processar em paralelo vai estourar rate limit
- Melhor fazer sequencial com controle

### "Por que não usar outro modelo (GPT-4)?"

- Problema não é o modelo, é a arquitetura
- Qualquer modelo vai ter o mesmo timeout

### "Por que não cachear traduções?"

- Cache ajuda em reprocessamento, mas não resolve primeiro processamento
- Vale implementar DEPOIS (Fase 2)

---

**Próxima ação:** Decidir entre Opção 1 (rápida) ou Opção 2 (profissional) e começar implementação.

---

**Última atualização:** 30 de dezembro de 2025  
**Autor:** GitHub Copilot + Tiago
