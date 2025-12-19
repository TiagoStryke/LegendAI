# 🔨 Plano de Refatoração: route.ts → Módulos

**Projeto:** LegendAI  
**Data:** 19 de dezembro de 2025  
**Status:** PLANEJAMENTO  
**Arquivo Alvo:** `app/api/route.ts` (851 linhas)

---

## 📋 Análise do Arquivo Atual

### Estatísticas
- **Linhas totais:** 851
- **Funções:** 4 principais
- **Responsabilidades:** MUITAS (violação do Single Responsibility Principle)
- **Complexidade:** ALTA (difícil manutenção)

### Estrutura Atual

```typescript
app/api/route.ts (851 linhas)
├── Imports (linhas 1-4)
├── Config exports (linhas 6-8)
├── Constants (linha 10)
├── Interface TranslationProgress (linhas 12-19)
├── formatDialogueLines() (linhas 21-72)
│   └── Formata diálogos vs palavras compostas
├── extractFileContext() (linhas 74-176)
│   └── Extrai contexto de série/filme do filename
├── isQuotaError() (linhas 178-206)
│   └── Detecta erros de rate limiting
├── retrieveTranslationWithQuotaHandling() (linhas 208-347)
│   └── Traduz com retry automático
└── POST handler() (linhas 349-851)
    └── Endpoint principal com lógica de streaming
```

### Problemas Identificados

1. ❌ **Violação do SRP:** Um arquivo com 4+ responsabilidades diferentes
2. ❌ **Difícil testar:** Funções acopladas, sem separação clara
3. ❌ **Difícil manter:** 851 linhas em um único arquivo
4. ❌ **Sem reutilização:** Funções presas no arquivo de rota
5. ❌ **Difícil debugar:** Muito código concentrado
6. ❌ **Rate limiting reativo:** Só age DEPOIS do erro

---

## 🎯 Objetivos da Refatoração

### Princípios
- ✅ **Single Responsibility:** Cada módulo com UMA responsabilidade
- ✅ **DRY:** Não repetir código
- ✅ **Testável:** Funções puras testáveis isoladamente
- ✅ **Reutilizável:** Módulos podem ser usados em outras partes
- ✅ **Manutenível:** Código organizado e documentado
- ✅ **Escalável:** Fácil adicionar novas features

### Resultados Esperados
- 📁 **route.ts:** ~150 linhas (apenas POST handler)
- 📁 **6 novos módulos** com responsabilidades bem definidas
- 🧪 **Testável:** Cada módulo pode ter testes unitários
- 📈 **Preparado para:** Integração TMDb, melhor rate limiting, multi-idioma

---

## 🗂️ Nova Estrutura de Arquivos

```
legendai/
├── lib/
│   └── translation/
│       ├── types.ts                    (~40 linhas)  - Interfaces e tipos
│   ├── config.ts                   (~30 linhas)  - Constantes e configurações
│   ├── formatter.ts                (~80 linhas)  - Formatação de texto
│   ├── context-extractor.ts        (~150 linhas) - Extração de contexto
│   ├── error-handler.ts            (~60 linhas)  - Detecção e tratamento de erros
│   ├── rate-limiter.ts             (~120 linhas) - Rate limiting preventivo (NOVO)
│   ├── translator.ts               (~200 linhas) - Lógica de tradução
│   └── index.ts                    (~20 linhas)  - Exports centralizados
└── [existentes]
    ├── client.ts
    └── srt.ts

app/api/
└── route.ts                        (~150 linhas) - Apenas POST handler
```

---

## 📦 Detalhamento dos Módulos

### 1. `lib/translation/types.ts`
**Responsabilidade:** Definir todos os tipos TypeScript

```typescript
// Interfaces e tipos usados em todo o sistema de tradução

export interface TranslationProgress {
  type: 'progress' | 'quota_error' | 'retry' | 'complete' | 'error';
  translated: number;
  total: number;
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
  message?: string;
  retryAfter?: number;
}

export interface TranslationRequest {
  content: string;
  language: string;
  apiKey: string;
  validationOnly?: boolean;
  filename?: string;
  format?: SubtitleFormat; // Formato detectado ou especificado
}

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'sub' | 'sbv' | 'unknown';

export interface ParsedSubtitle {
  format: SubtitleFormat;
  entries: SubtitleEntry[];
  metadata?: Record<string, any>; // Para ASS/SSA (estilos, etc.)
}

export interface SubtitleEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
  style?: string; // Para ASS/SSA
  position?: string; // Para VTT
}

export interface TranslationResult {
  result: string;
  retryAfter?: number;
}

export interface FileContext {
  type: 'series' | 'movie' | 'unknown';
  name: string;
  season?: number;
  episode?: number;
  year?: string;
  quality?: string[];
  description: string; // Texto formatado para o prompt
}

export interface TMDbContext {
  overview?: string;        // Sinopse
  genres?: string[];        // Gêneros
  cast?: Array<{           // Elenco principal
    name: string;
    character: string;
    gender: 'male' | 'female' | 'unknown';
  }>;
  // Expandir depois com integração TMDb
}

export interface RateLimitState {
  requestsInWindow: number;
  windowStartTime: number;
  maxRequests: number;
  windowDurationMs: number;
}
```

---

### 2. `lib/translation/config.ts`
**Responsabilidade:** Configurações e constantes

```typescript
// Configurações do sistema de tradução

export const TRANSLATION_CONFIG = {
  // Limites de tokens
  MAX_TOKENS_IN_SEGMENT: 400,
  MAX_TOKENS_PER_REQUEST: 8000, // Gemini limit
  
  // Rate limiting (API Gemini Free tier)
  MAX_REQUESTS_PER_MINUTE: 10,
  MAX_TOKENS_PER_MINUTE: 32000,
  
  // Retry
  MAX_RETRIES: 3,
  RETRY_BACKOFF_BASE: 1000, // 1s, 2s, 4s...
  QUOTA_RETRY_DELAY: 65000, // 65 segundos
  
  // Next.js API config
  DYNAMIC: 'force-dynamic' as const,
  RUNTIME: 'nodejs' as const,
  
  // Gemini model
  DEFAULT_MODEL: 'gemini-2.0-flash-exp',
  
  // Validações
  MIN_API_KEY_LENGTH: 30,
} as const;

export const LANGUAGE_CONFIG = {
  DEFAULT_SOURCE: 'English',
  DEFAULT_TARGET: 'Portuguese (Brazil)',
  // Expandir depois para multi-idioma
  SUPPORTED_LANGUAGES: [
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'en-US', name: 'English' },
    { code: 'es-ES', name: 'Spanish' },
    // ... mais idiomas depois
  ],
} as const;
```

---

### 3. `lib/translation/formatter.ts`
**Responsabilidade:** Formatação de texto e diálogos

```typescript
import type { FileContext } from './types';

/**
 * Formata corretamente as linhas de diálogo preservando a estrutura original
 * Distingue entre falas de diálogo e palavras compostas
 */
export function formatDialogueLines(text: string): string {
  // [CÓDIGO ATUAL DE formatDialogueLines - linhas 25-72 do route.ts]
  // ...
}

/**
 * Constrói o prompt do sistema para o Gemini com contexto apropriado
 */
export function buildSystemPrompt(
  fileContext?: FileContext,
  tmdbContext?: any // Depois criar tipo TMDbContext
): string {
  let systemPrompt = 
    "Você é um tradutor profissional especializado em legendas de filmes e séries, " +
    "com foco especial em português brasileiro. " +
    "IMPORTANTE: Preserve cuidadosamente toda a formatação original, incluindo tags HTML como <i> para itálico. " +
    "Separe os segmentos de tradução com o símbolo '|'. " +
    "Mantenha o estilo e tom da linguagem original. " +
    "Nomes próprios não devem ser traduzidos. " +
    "Preserve os nomes de programas como 'The Amazing Race'. " +
    "CRÍTICO: Preserve EXATAMENTE a estrutura de quebras de linha do texto original. " +
    "Quando encontrar diálogos com hífens em linhas separadas (como '-Texto1\\n-Texto2\\n-Texto3'), " +
    "mantenha cada fala em sua própria linha com quebra de linha (\\n). " +
    "NUNCA una múltiplas falas em uma única linha. " +
    "Exemplo: '-Olá.\\n-Oi!' deve se tornar '-Olá.\\n-Oi!' e NÃO '-Olá. -Oi!'. " +
    "Mantenha quebras de linha originais com \\n.";

  // Adicionar contexto do arquivo
  if (fileContext && fileContext.description) {
    systemPrompt += `\n\nCONTEXTO: ${fileContext.description} `;
    systemPrompt += "Use este contexto para melhorar a qualidade da tradução, ";
    systemPrompt += "adaptando o vocabulário, estilo e tom apropriados para o conteúdo específico.";
  }

  // Adicionar contexto do TMDb (FUTURO)
  if (tmdbContext) {
    if (tmdbContext.overview) {
      systemPrompt += `\n\nSINOPSE: ${tmdbContext.overview}`;
    }
    if (tmdbContext.cast && tmdbContext.cast.length > 0) {
      const castList = tmdbContext.cast
        .map((c: any) => `${c.character} (interpretado por ${c.name}, ${c.gender})`)
        .join(', ');
      systemPrompt += `\n\nPERSONAGENS PRINCIPAIS: ${castList}. `;
      systemPrompt += "Use esta informação para traduzir corretamente gêneros gramaticais ";
      systemPrompt += "(excitado/excitada, culpado/culpada, etc.).";
    }
  }

  return systemPrompt;
}

/**
 * Valida se a resposta foi completa (não truncada)
 */
export function validateTranslationCompleteness(
  inputText: string,
  outputText: string,
  originalSegments?: any[]
): { isComplete: boolean; missingSegments: number; needsSplit: boolean } {
  const inputSegments = inputText.split('|').length;
  const outputSegments = outputText.split('|').length;
  const missingSegments = inputSegments - outputSegments;

  return {
    isComplete: missingSegments === 0,
    missingSegments,
    needsSplit: missingSegments > 0 && originalSegments !== undefined && originalSegments.length > 1,
  };
}
```

---

### 4. `lib/translation/context-extractor.ts`
**Responsabilidade:** Extrair contexto de filenames e futuramente do TMDb

```typescript
import type { FileContext, TMDbContext } from './types';

/**
 * Extrai informações contextuais do nome do arquivo
 */
export function extractFileContext(filename: string): FileContext {
  // [CÓDIGO ATUAL DE extractFileContext - linhas 77-176 do route.ts]
  // Refatorar para retornar objeto FileContext estruturado
  // ...
  
  if (!filename) {
    return {
      type: 'unknown',
      name: '',
      description: '',
    };
  }
  
  // ... resto da lógica atual ...
  
  // Retorna objeto estruturado ao invés de string
  return {
    type: 'series', // ou 'movie' ou 'unknown'
    name: 'Survivor',
    season: 47,
    episode: 13,
    quality: ['1080p', 'Blu-ray'],
    description: 'Esta é uma legenda da série "Survivor", temporada 47, episódio 13. Fonte: alta definição (1080p), Blu-ray.',
  };
}

// Cache simples em memória (para início)
// NOTA: Em produção com múltiplos usuários, migrar para Redis/Upstash
const tmdbCache = new Map<string, { data: TMDbContext; timestamp: number }>();
const TMDB_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// Rate limiter para TMDb (40 req / 10 segundos)
let tmdbRequestTimes: number[] = [];
const TMDB_MAX_REQUESTS = 40;
const TMDB_WINDOW_MS = 10000;

function canMakeTMDbRequest(): boolean {
  const now = Date.now();
  tmdbRequestTimes = tmdbRequestTimes.filter(time => now - time < TMDB_WINDOW_MS);
  return tmdbRequestTimes.length < TMDB_MAX_REQUESTS;
}

function recordTMDbRequest(): void {
  tmdbRequestTimes.push(Date.now());
}

/**
 * Busca contexto adicional no TMDb (FUTURO - FASE 2)
 * ⚠️ IMPORTANTE: Implementa cache agressivo e rate limiting
 */
export async function fetchTMDbContext(
  fileContext: FileContext,
  tmdbApiKey?: string
): Promise<TMDbContext | null> {
  if (!tmdbApiKey) return null;

  // Criar chave de cache única
  const cacheKey = `${fileContext.type}:${fileContext.name}:${fileContext.season}:${fileContext.episode}`;
  
  // Verificar cache
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TMDB_CACHE_TTL) {
    return cached.data;
  }

  // Verificar rate limit ANTES de fazer requisição
  if (!canMakeTMDbRequest()) {
    console.warn('TMDb rate limit atingido, usando cache ou filename context');
    return null; // Fallback para contexto do filename
  }

  try {
    recordTMDbRequest();

    // TODO: Implementar na FASE 2
    // if (fileContext.type === 'series') {
    //   // GET https://api.themoviedb.org/3/search/tv?query={name}
    //   // GET https://api.themoviedb.org/3/tv/{id}/season/{season}
    //   // Extrair: overview, cast, genres
    // } else if (fileContext.type === 'movie') {
    //   // GET https://api.themoviedb.org/3/search/movie?query={name}&year={year}
    //   // Extrair: overview, cast, genres
    // }

    // Salvar no cache
    const data: TMDbContext = {}; // TODO: popular com dados reais
    tmdbCache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
  } catch (error) {
    console.error('Erro ao buscar TMDb:', error);
    return null; // Fallback gracioso
  }
}

/**
 * Combina contextos de múltiplas fontes
 */
export function mergeContexts(
  fileContext: FileContext,
  tmdbContext: TMDbContext | null
): FileContext {
  // Enriquecer fileContext com dados do TMDb
  if (!tmdbContext) return fileContext;

  // TODO: Implementar merge na FASE 2
  return fileContext;
}
```

---

### 5. `lib/translation/error-handler.ts`
**Responsabilidade:** Detecção e classificação de erros

```typescript
export type ErrorType = 
  | 'AUTH_ERROR'
  | 'QUOTA_ERROR'
  | 'INVALID_API_KEY'
  | 'TRUNCATION_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface ClassifiedError {
  type: ErrorType;
  message: string;
  retryable: boolean;
  retryAfter?: number;
}

/**
 * Verifica se o erro é relacionado a quota/rate limiting
 */
export function isQuotaError(error: any): boolean {
  // [CÓDIGO ATUAL DE isQuotaError - linhas 178-206 do route.ts]
  // ...
}

/**
 * Verifica se o erro é de autenticação/API key inválida
 */
export function isAuthError(error: any): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();
  
  const authIndicators = [
    '403',
    'auth',
    'authentication',
    'unauthorized',
    'forbidden',
    'invalid key',
    'invalid api key',
    'api key not valid',
    'missing api key',
    'api key is required',
    'gemini api key',
    "method doesn't allow unregistered callers",
    'caller not authorized',
  ];

  return authIndicators.some(indicator => errorMessage.includes(indicator));
}

/**
 * Classifica o erro e retorna informações estruturadas
 */
export function classifyError(error: any): ClassifiedError {
  // Autenticação
  if (isAuthError(error)) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes("method doesn't allow unregistered callers")) {
      return {
        type: 'AUTH_ERROR',
        message: 'O Google Gemini não reconheceu sua chave API. Verifique se a chave foi copiada corretamente e é válida.',
        retryable: false,
      };
    }
    
    if (errorMessage.includes('invalid key') || errorMessage.includes('invalid api key')) {
      return {
        type: 'INVALID_API_KEY',
        message: 'Chave API inválida. Verifique se obteve a chave correta do Google AI Studio (https://aistudio.google.com/app/apikey).',
        retryable: false,
      };
    }
    
    return {
      type: 'AUTH_ERROR',
      message: 'Chave de API inválida ou não autorizada. Verifique sua chave API do Google Gemini.',
      retryable: false,
    };
  }

  // Quota/Rate Limit
  if (isQuotaError(error)) {
    return {
      type: 'QUOTA_ERROR',
      message: 'Limite de requisições excedido. Aguardando para tentar novamente...',
      retryable: true,
      retryAfter: 65,
    };
  }

  // Truncation (resposta incompleta)
  if (error.message === 'SPLIT_CHUNK_NEEDED') {
    return {
      type: 'TRUNCATION_ERROR',
      message: 'Resposta truncada. Dividindo chunk e tentando novamente...',
      retryable: true,
    };
  }

  // Erro genérico
  return {
    type: 'UNKNOWN_ERROR',
    message: error.message || String(error),
    retryable: true,
  };
}

/**
 * Valida API key antes de fazer chamadas
 */
export function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey) {
    return {
      valid: false,
      error: 'API key is required',
    };
  }

  if (apiKey.trim().length < 30) {
    return {
      valid: false,
      error: 'API key appears to be invalid (too short)',
    };
  }

  return { valid: true };
}
```

---

### 6. `lib/translation/rate-limiter.ts` (NOVO - PREVENTIVO)
**Responsabilidade:** Gerenciar rate limiting de forma PREVENTIVA

```typescript
import { TRANSLATION_CONFIG } from './config';
import type { RateLimitState } from './types';

/**
 * Rate Limiter PREVENTIVO para API do Gemini
 * Evita atingir o limite de 10 req/min
 */
export class RateLimiter {
  private state: RateLimitState;

  constructor(
    maxRequests: number = TRANSLATION_CONFIG.MAX_REQUESTS_PER_MINUTE,
    windowDurationMs: number = 60000 // 1 minuto
  ) {
    this.state = {
      requestsInWindow: 0,
      windowStartTime: Date.now(),
      maxRequests,
      windowDurationMs,
    };
  }

  /**
   * Verifica se pode fazer uma requisição AGORA
   */
  canMakeRequest(): boolean {
    this.resetWindowIfNeeded();
    return this.state.requestsInWindow < this.state.maxRequests;
  }

  /**
   * Calcula quanto tempo precisa esperar (em ms)
   */
  getWaitTime(): number {
    this.resetWindowIfNeeded();
    
    if (this.canMakeRequest()) {
      return 0;
    }

    // Precisa esperar até o fim da janela atual
    const elapsedTime = Date.now() - this.state.windowStartTime;
    const timeUntilReset = this.state.windowDurationMs - elapsedTime;
    
    return Math.max(0, timeUntilReset);
  }

  /**
   * Aguarda até poder fazer uma requisição
   */
  async waitIfNeeded(): Promise<void> {
    const waitTime = this.getWaitTime();
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.resetWindowIfNeeded();
    }
  }

  /**
   * Registra que uma requisição foi feita
   */
  recordRequest(): void {
    this.resetWindowIfNeeded();
    this.state.requestsInWindow++;
  }

  /**
   * Reseta a janela se passou o tempo limite
   */
  private resetWindowIfNeeded(): void {
    const now = Date.now();
    const elapsedTime = now - this.state.windowStartTime;

    if (elapsedTime >= this.state.windowDurationMs) {
      this.state.requestsInWindow = 0;
      this.state.windowStartTime = now;
    }
  }

  /**
   * Obtém o estado atual (para debug/frontend)
   */
  getState(): Readonly<RateLimitState> {
    this.resetWindowIfNeeded();
    return { ...this.state };
  }

  /**
   * Força reset (para testes)
   */
  reset(): void {
    this.state.requestsInWindow = 0;
    this.state.windowStartTime = Date.now();
  }
}

// Instância singleton compartilhada entre requisições
// NOTA: Em serverless, pode ser resetada entre invocações
// Para produção, considerar usar Redis/Upstash
let globalRateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();
  }
  return globalRateLimiter;
}
```

---

### 7. `lib/translation/translator.ts`
**Responsabilidade:** Lógica principal de tradução

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { TRANSLATION_CONFIG } from './config';
import { classifyError } from './error-handler';
import { buildSystemPrompt, validateTranslationCompleteness } from './formatter';
import { getRateLimiter } from './rate-limiter';
import type { FileContext, TranslationResult } from './types';

export interface TranslationCallbacks {
  onQuotaError?: (retryAfter: number) => Promise<void>;
  onQuotaRetry?: () => Promise<void>;
  onRateLimitWait?: (waitTime: number) => Promise<void>;
}

/**
 * Traduz um texto usando Gemini com retry automático e rate limiting
 */
export async function translateWithRetry(
  text: string,
  language: string,
  apiKey: string,
  fileContext?: FileContext,
  originalSegments?: any[],
  callbacks?: TranslationCallbacks
): Promise<TranslationResult> {
  const googleProvider = createGoogleGenerativeAI({ apiKey });
  const geminiModel = googleProvider(TRANSLATION_CONFIG.DEFAULT_MODEL);
  const rateLimiter = getRateLimiter();

  for (let attempt = 0; attempt < TRANSLATION_CONFIG.MAX_RETRIES; attempt++) {
    try {
      // PREVENTIVO: Aguarda se atingiu rate limit
      const waitTime = rateLimiter.getWaitTime();
      if (waitTime > 0) {
        if (callbacks?.onRateLimitWait) {
          await callbacks.onRateLimitWait(waitTime);
        }
        await rateLimiter.waitIfNeeded();
      }

      // Registra requisição no rate limiter
      rateLimiter.recordRequest();

      // Construir prompt
      const systemPrompt = buildSystemPrompt(fileContext);

      // Fazer chamada para Gemini
      const { text: translatedText } = await generateText({
        model: geminiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Traduza estas legendas para ${language}: ${text}` },
        ],
      });

      // Validar completude da resposta
      const validation = validateTranslationCompleteness(text, translatedText, originalSegments);

      if (!validation.isComplete) {
        if (validation.needsSplit) {
          throw new Error('SPLIT_CHUNK_NEEDED');
        }

        // Para chunks pequenos, tenta novamente uma vez
        if (attempt === 0 && text.split('|').length <= 10) {
          throw new Error('Response truncated - retry needed');
        }
      }

      return { result: translatedText };

    } catch (error: any) {
      const classified = classifyError(error);

      // Erros não-retryable (autenticação)
      if (!classified.retryable) {
        throw new Error(classified.message);
      }

      // Erro de quota
      if (classified.type === 'QUOTA_ERROR') {
        if (attempt === TRANSLATION_CONFIG.MAX_RETRIES - 1) {
          throw new Error('QUOTA_ERROR');
        }

        if (callbacks?.onQuotaError && classified.retryAfter) {
          await callbacks.onQuotaError(classified.retryAfter);
        }

        await new Promise(resolve => 
          setTimeout(resolve, classified.retryAfter! * 1000)
        );

        if (callbacks?.onQuotaRetry) {
          await callbacks.onQuotaRetry();
        }

        continue;
      }

      // Erro de truncamento (precisa dividir chunk)
      if (classified.type === 'TRUNCATION_ERROR') {
        throw error;
      }

      // Outros erros: exponential backoff
      if (attempt < TRANSLATION_CONFIG.MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * TRANSLATION_CONFIG.RETRY_BACKOFF_BASE;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

---

### 8. `lib/translation/index.ts`
**Responsabilidade:** Exports centralizados

```typescript
// Re-exports de todos os módulos
export * from './types';
export * from './config';
export * from './formatter';
export * from './context-extractor';
export * from './error-handler';
export * from './rate-limiter';
export * from './translator';
```

---

### 9. `app/api/route.ts` (REFATORADO - ~150 linhas)
**Responsabilidade:** APENAS o POST handler (endpoint)

```typescript
import { parseSegment } from '@/lib/client';
import { groupSegmentsByTokenLength } from '@/lib/srt';
import {
  TRANSLATION_CONFIG,
  type TranslationProgress,
  type TranslationRequest,
  extractFileContext,
  validateApiKey,
  translateWithRetry,
  classifyError,
} from '@/lib/translation';

// Configuração da rota
export const dynamic = TRANSLATION_CONFIG.DYNAMIC;
export const runtime = TRANSLATION_CONFIG.RUNTIME;

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Parse request
        const data: TranslationRequest = await request.json();
        const { content, language, apiKey, validationOnly, filename } = data;

        // Validar API key
        const validation = validateApiKey(apiKey);
        if (!validation.valid) {
          const errorData: TranslationProgress = {
            type: 'error',
            translated: 0,
            total: 0,
            percentage: 0,
            message: validation.error,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        // Se é apenas validação, retorna sucesso
        if (validationOnly) {
          const successData: TranslationProgress = {
            type: 'complete',
            translated: 0,
            total: 0,
            percentage: 100,
            message: 'API key is valid',
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(successData)}\n\n`));
          controller.close();
          return;
        }

        // Extrair contexto do filename
        const fileContext = extractFileContext(filename || '');

        // Parse SRT e agrupar por tokens
        const lines = content.split('\n');
        const segments = lines
          .map((line, index) => parseSegment(line, index + 1))
          .filter(Boolean);

        const groupedSegments = groupSegmentsByTokenLength(segments);
        const totalChunks = groupedSegments.length;

        // Traduzir cada chunk
        let translatedSegments: any[] = [];

        for (let i = 0; i < groupedSegments.length; i++) {
          const chunk = groupedSegments[i];
          const textToTranslate = chunk.map(s => s.text).join('|');

          try {
            // Callbacks para feedback em tempo real
            const callbacks = {
              onQuotaError: async (retryAfter: number) => {
                const errorData: TranslationProgress = {
                  type: 'quota_error',
                  translated: translatedSegments.length,
                  total: segments.length,
                  percentage: Math.round((translatedSegments.length / segments.length) * 100),
                  currentChunk: i + 1,
                  totalChunks,
                  retryAfter,
                  message: `Rate limit atingido. Aguardando ${retryAfter}s...`,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
              },
              onQuotaRetry: async () => {
                const retryData: TranslationProgress = {
                  type: 'retry',
                  translated: translatedSegments.length,
                  total: segments.length,
                  percentage: Math.round((translatedSegments.length / segments.length) * 100),
                  currentChunk: i + 1,
                  totalChunks,
                  message: 'Retomando tradução...',
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(retryData)}\n\n`));
              },
              onRateLimitWait: async (waitTime: number) => {
                const waitData: TranslationProgress = {
                  type: 'progress',
                  translated: translatedSegments.length,
                  total: segments.length,
                  percentage: Math.round((translatedSegments.length / segments.length) * 100),
                  currentChunk: i + 1,
                  totalChunks,
                  message: `Aguardando rate limit (${Math.ceil(waitTime / 1000)}s)`,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(waitData)}\n\n`));
              },
            };

            // Traduzir chunk
            const { result } = await translateWithRetry(
              textToTranslate,
              language,
              apiKey,
              fileContext,
              chunk,
              callbacks
            );

            // Processar resultado
            const translatedTexts = result.split('|');
            const chunkTranslated = chunk.map((segment, idx) => ({
              ...segment,
              text: translatedTexts[idx] || segment.text,
            }));

            translatedSegments = [...translatedSegments, ...chunkTranslated];

            // Enviar progresso
            const progressData: TranslationProgress = {
              type: 'progress',
              translated: translatedSegments.length,
              total: segments.length,
              percentage: Math.round((translatedSegments.length / segments.length) * 100),
              currentChunk: i + 1,
              totalChunks,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`));

          } catch (error: any) {
            const classified = classifyError(error);

            // Enviar erro ao cliente
            const errorData: TranslationProgress = {
              type: 'error',
              translated: translatedSegments.length,
              total: segments.length,
              percentage: Math.round((translatedSegments.length / segments.length) * 100),
              currentChunk: i + 1,
              totalChunks,
              message: classified.message,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
            controller.close();
            return;
          }
        }

        // Gerar SRT final
        const translatedSRT = translatedSegments
          .map(s => `${s.index}\n${s.timestamp}\n${s.text}\n`)
          .join('\n');

        // Enviar resultado completo
        const completeData: TranslationProgress = {
          type: 'complete',
          translated: translatedSegments.length,
          total: segments.length,
          percentage: 100,
          message: translatedSRT,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`));
        controller.close();

      } catch (error: any) {
        const errorData: TranslationProgress = {
          type: 'error',
          translated: 0,
          total: 0,
          percentage: 0,
          message: error.message || 'Unknown error',
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        controller.close();
      }
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

---

## ✅ Checklist de Refatoração

### Fase 1: Preparação
- [ ] Criar branch `feature/code-organization`
- [ ] Criar backup (git tag `v0.2.0-pre-refactor`)
- [ ] Criar estrutura de pastas `lib/translation/`
- [ ] Garantir que testes manuais estão funcionando ANTES

### Fase 2: Criação de Módulos
- [ ] Criar `lib/translation/types.ts`
- [ ] Criar `lib/translation/config.ts`
- [ ] Criar `lib/translation/formatter.ts` (mover formatDialogueLines)
- [ ] Criar `lib/translation/context-extractor.ts` (mover extractFileContext)
- [ ] Criar `lib/translation/error-handler.ts` (mover isQuotaError + criar classify)
- [ ] Criar `lib/translation/rate-limiter.ts` (NOVO - rate limiting preventivo)
- [ ] Criar `lib/translation/translator.ts` (mover retrieveTranslation...)
- [ ] Criar `lib/translation/index.ts` (exports)

### Fase 3: Refatorar route.ts
- [ ] Substituir funções internas por imports dos novos módulos
- [ ] Simplificar POST handler
- [ ] Testar localmente (`npm run dev`)
- [ ] Verificar que streaming ainda funciona
- [ ] Verificar que retry funciona
- [ ] Verificar que contexto de filename funciona

### Fase 4: Testes
- [ ] Upload de arquivo pequeno (10 linhas)
- [ ] Upload de arquivo médio (100 linhas)
- [ ] Upload de arquivo grande (500+ linhas)
- [ ] Testar com erro de API key inválida
- [ ] Testar com quota limit (fazer várias traduções seguidas)
- [ ] Testar extração de contexto (arquivo com S01E01)
- [ ] Testar tema claro/escuro
- [ ] Testar download do arquivo traduzido

### Fase 5: Build e Deploy
- [ ] `npm run build` - sucesso?
- [ ] Deploy preview no Vercel
- [ ] Testar em produção (preview URL)
- [ ] Verificar logs do Vercel (sem erros?)
- [ ] Se tudo OK: merge para main
- [ ] Atualizar CHANGELOG.md com a refatoração
- [ ] Criar release tag `v0.3.0`

---

## 🎯 Próximos Passos Após Refatoração

Com o código organizado, será MUITO mais fácil implementar:

1. **Integração TMDb** (adicionar apenas em `context-extractor.ts`)
2. **Multi-idioma** (adicionar em `config.ts` e `translator.ts`)
3. **Upload múltiplo** (criar novo endpoint baseado no refatorado)
4. **Testes unitários** (cada módulo testável isoladamente)
5. **Rate limiting com Redis** (substituir apenas `rate-limiter.ts`)

---

## 📊 Métricas de Sucesso

### Antes da Refatoração
- ❌ **1 arquivo:** 851 linhas
- ❌ **Difícil testar:** Funções acopladas
- ❌ **Difícil manter:** Muita responsabilidade
- ❌ **Rate limiting:** Reativo (só age após erro)

### Depois da Refatoração
- ✅ **9 arquivos:** ~150 linhas cada
- ✅ **Testável:** Módulos independentes
- ✅ **Manutenível:** Single Responsibility
- ✅ **Rate limiting:** Preventivo (evita erros)

---

**Próxima ação:** Começar FASE 1 - Criar branch e estrutura de pastas
