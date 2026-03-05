# LegendAI Desktop - AI APIs Strategy

> **Propósito:** Análise detalhada e estratégia de uso de APIs de IA para tradução, focando em custo zero e máxima confiabilidade.

---

## 🎯 Requisitos

### Funcionais

- Traduzir ~500 legendas por episódio
- Processar ~10 arquivos/dia (uso pessoal)
- Contexto de séries/filmes preservado
- Formatação HTML mantida
- Diálogos com múltiplas falas preservados

### Não-Funcionais

- **Custo:** Zero (ou próximo de zero)
- **Latência:** Aceitável (não precisa ser instantâneo)
- **Confiabilidade:** Alta (retry automático)
- **Escalabilidade:** Suportar múltiplas keys

---

## 📊 Comparação de APIs

### 1. Google Gemini (ATUAL - Tier Free)

#### Especificações

| Métrica         | Free Tier                               | Paid Tier                        |
| --------------- | --------------------------------------- | -------------------------------- |
| **RPM**         | 15 requests/min                         | 360 RPM                          |
| **TPM**         | 32k tokens/min                          | 4M TPM                           |
| **Daily Limit** | 1,500 requests/day                      | Unlimited                        |
| **Custo**       | **$0**                                  | $0.075/1M input                  |
| **Latência**    | ~2-3s/request                           | ~1-2s/request                    |
| **Max Tokens**  | 32k context                             | 2M context                       |
| **Modelos**     | gemini-2.0-flash-exp, geminii-1.5-flash | gemini-2.0-flash, gemini-1.5-pro |

#### Cálculo para Uso Pessoal

```
1 episódio = 500 legendas
Chunks de 10 legendas = 50 requests/episódio

10 episódios/dia × 50 requests = 500 requests/dia
Com 5 keys = 100 requests/dia/key ✅ (dentro do limite)

Tempo estimado:
500 requests × 3s = 1500s = 25 minutos/dia de tradução
```

#### ✅ Vantagens

- Gratuito até 1500 req/dia por key
- Boa qualidade de tradução
- Contexto grande (32k tokens)
- Suporte a PT-BR nativo
- Projeto web já usa (código reutilizável)

#### ❌ Desvantagens

- RPM baixo (15/minuto)
- Erros 429 frequentes
- Necessita múltiplas keys
- Quotas podem mudar sem aviso

#### Estratégia de Uso

```typescript
const GEMINI_CONFIG = {
	model: 'gemini-2.0-flash-exp',
	maxKeys: 5,
	rpm: 10, // Conservador (15 real)
	cooldownOnQuota: 300000, // 5 min
	retries: 3,
	backoff: 'exponential',
};
```

---

### 2. Groq (Llama 3.1 70B) - FREE

#### Especificações

| Métrica         | Free Tier                      |
| --------------- | ------------------------------ |
| **RPM**         | 30 requests/min                |
| **TPD**         | 14,400 tokens/day              |
| **Custo**       | **$0**                         |
| **Latência**    | ~0.5s (MUITO RÁPIDO!)          |
| **Max Context** | 8k tokens                      |
| **Quality**     | Boa (não tão boa quanto GPT-4) |

#### Cálculo

```
30 RPM >> 15 RPM do Gemini ✅
14,400 TPD = ~2,880 requests/dia (5 tokens/req avg)

10 episódios × 50 requests = 500 requests ✅
```

#### ✅ Vantagens

- **MUITO RÁPIDO** (800 tokens/s)
- RPM maior que Gemini
- Gratuito (por enquanto)
- Sem quota diária clara

#### ❌ Desvantagens

- Qualidade inferior ao Gemini
- Serviço em beta (pode mudar)
- Menos contexto (8k)
- Ainda não muito confiável

#### Estratégia de Uso

**Usar como Backup/Fallback:**

```typescript
const AI_PROVIDERS = [
  { name: 'gemini', priority: 1, keys: [...] },
  { name: 'groq', priority: 2, keys: [...] }  // Fallback
];
```

---

### 3. DeepL API - FREE/PAID

#### Especificações

| Métrica           | Free Tier                                       | Pro Tier                 |
| ----------------- | ----------------------------------------------- | ------------------------ |
| **Chars/month**   | 500k                                            | Unlimited                |
| **Custo**         | **$0**                                          | €4.99/mês + €20/1M chars |
| **Latência**      | ~1s                                             | ~1s                      |
| **Quality**       | **Excelente** (melhor que LLMs em alguns casos) |
| **PT-BR Support** | ✅ Nativo                                       | ✅ Nativo                |

#### Cálculo

```
1 legenda = ~50 caracteres
500 legendas × 50 chars = 25k chars/episódio
10 episódios × 25k = 250k chars/dia

Por mês (30 dias):
250k × 30 = 7.5M chars/mês ❌ (excede free tier)

Com Free Tier:
500k chars/mês ÷ 25k chars/ep = 20 episódios/mês ⚠️
```

#### ✅ Vantagens

- **Melhor qualidade** para tradução pura
- Especializado em tradução
- PT-BR excelente
- Sem rate limiting absurdo

#### ❌ Desvantagens

- Limite mensal (não diário)
- Não entende contexto de séries/filmes
- Paid tier caro para alto volume
- Não preserva tags HTML automaticamente

#### Estratégia de Uso

**Usar para legendas VIP/importantes:**

```typescript
const USE_DEEPL_FOR = [
	'filmes_importantes',
	'series_favoritas',
	'quando_gemini_falhar_muito',
];
```

---

### 4. OpenAI GPT-4o-mini - PAID (barato)

#### Especificações

| Métrica      | Valor                               |
| ------------ | ----------------------------------- |
| **RPM**      | 500 (Tier 2) / 10,000 (Tier 5)      |
| **TPM**      | 200k (Tier 2) / 30M (Tier 5)        |
| **Custo**    | **$0.15/1M input**, $0.60/1M output |
| **Latência** | ~1-2s                               |
| **Quality**  | Excelente                           |
| **Context**  | 128k tokens                         |

#### Cálculo de Custo

```
1 episódio = 500 legendas × 50 chars = 25k chars
25k chars ÷ 4 (tokens) = ~6,250 tokens input
Output: similar, ~6,250 tokens

Custo por episódio:
Input: 6,250 × $0.15/1M = $0.0009375
Output: 6,250 × $0.60/1M = $0.00375
TOTAL: ~$0.0047/episódio

10 episódios/dia × $0.0047 = $0.047/dia
Por mês: $0.047 × 30 = $1.41/mês 💰
```

#### ✅ Vantagens

- Muito barato
- RPM alto (sem rate limiting)
- Qualidade excelente
- Contexto imenso (128k)
- Confiável e estável

#### ❌ Desvantagens

- **NÃO é grátis** (mas quase)
- Precisa cartão de crédito
- $5 mínimo para começar

#### Estratégia de Uso

**Considerar se:**

- Gemini começar a falhar muito
- Precisar de mais velocidade
- $1-2/mês for aceitável

---

### 5. Anthropic Claude 3.5 Haiku - PAID (barato)

#### Especificações

| Métrica      | Valor                               |
| ------------ | ----------------------------------- |
| **RPM**      | 4,000                               |
| **TPM**      | 400k                                |
| **Custo**    | **$0.25/1M input**, $1.25/1M output |
| **Latência** | ~1-2s                               |
| **Quality**  | **Excelente** (melhor que GPT)      |
| **Context**  | 200k tokens                         |

#### Cálculo de Custo

```
Custo por episódio:
Input: 6,250 × $0.25/1M = $0.0016
Output: 6,250 × $1.25/1M = $0.0078
TOTAL: ~$0.0094/episódio

Por mês: $0.0094 × 10 × 30 = $2.82/mês 💰
```

#### ✅ Vantagens

- **Melhor qualidade** geral
- Excelente com contexto
- RPM altíssimo
- Contexto 200k
- Muito confiável

#### ❌ Desvantagens

- Mais caro que GPT-4o-mini
- Ainda pago

---

## 🎯 Estratégia Recomendada: Tier System

### Tier 1: FREE (Primário)

```typescript
const PRIMARY_PROVIDERS = [
	{
		name: 'Google Gemini',
		model: 'gemini-2.0-flash-exp',
		keys: 5,
		rpm: 10,
		priority: 1,
		cost: 0,
	},
	{
		name: 'Groq (Llama 3.1)',
		model: 'llama-3.1-70b-versatile',
		keys: 2,
		rpm: 30,
		priority: 2,
		cost: 0,
	},
];
```

### Tier 2: PAID (Fallback opcional)

```typescript
const FALLBACK_PROVIDERS = [
	{
		name: 'OpenAI GPT-4o-mini',
		model: 'gpt-4o-mini',
		rpm: 500,
		priority: 3,
		enabled: false, // Ativar manualmente
		cost: 0.0047, // por episódio
	},
	{
		name: 'DeepL',
		priority: 4,
		enabled: false,
		monthlyLimit: 500000,
		cost: 0, // até limite
	},
];
```

### Lógica de Rotação

```typescript
async function translate(segments: string[]) {
	// Try Tier 1 (Free)
	for (const provider of PRIMARY_PROVIDERS) {
		try {
			return await provider.translate(segments);
		} catch (error) {
			if (isQuotaError(error)) {
				logger.warn(`${provider.name} quota exceeded, trying next`);
				continue;
			}
			throw error; // Other errors = stop
		}
	}

	// Tier 1 exhausted, check if user wants to use paid
	if (settings.allowPaidAPIs) {
		for (const provider of FALLBACK_PROVIDERS.filter((p) => p.enabled)) {
			try {
				return await provider.translate(segments);
			} catch (error) {
				logger.error(`${provider.name} failed`, error);
				continue;
			}
		}
	}

	// All failed
	throw new Error('All providers exhausted or unavailable');
}
```

---

## 🔧 Implementação Multi-Provider

### Interface Base

```typescript
interface AIProvider {
	name: string;
	translate(text: string, options?: TranslateOptions): Promise<string>;
	isAvailable(): Promise<boolean>;
	getRateLimit(): RateLimitInfo;
	getCost(tokens: number): number;
}

interface TranslateOptions {
	sourceLang?: string;
	targetLang?: string;
	context?: string;
	preserveFormatting?: boolean;
}

interface RateLimitInfo {
	requestsPerMinute: number;
	tokensPerMinute: number;
	dailyLimit?: number;
}
```

### Provider Implementations

#### Gemini Provider

```typescript
export class GeminiProvider implements AIProvider {
	name = 'Google Gemini';
	private keys: string[];
	private currentKeyIndex = 0;
	private rateLimiter: RateLimiter;

	constructor(keys: string[]) {
		this.keys = keys;
		this.rateLimiter = new RateLimiter({ rpm: 10 });
	}

	async translate(text: string, options?: TranslateOptions): Promise<string> {
		const key = this.getNextAvailableKey();
		if (!key) throw new Error('No available keys');

		await this.rateLimiter.wait(key.id);

		try {
			const result = await this.callGeminiAPI(key.value, text, options);
			key.markSuccess();
			return result;
		} catch (error) {
			if (isQuotaError(error)) {
				key.markQuotaExceeded();
				throw new QuotaError('Gemini quota exceeded');
			}
			throw error;
		}
	}

	async isAvailable(): Promise<boolean> {
		return this.keys.some((k) => k.isAvailable());
	}

	getRateLimit(): RateLimitInfo {
		return {
			requestsPerMinute: 10,
			tokensPerMinute: 32000,
			dailyLimit: 1500,
		};
	}

	getCost(): number {
		return 0; // Free
	}
}
```

#### Groq Provider

```typescript
export class GroqProvider implements AIProvider {
	name = 'Groq';
	private apiKey: string;
	private rateLimiter: RateLimiter;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
		this.rateLimiter = new RateLimiter({ rpm: 30 });
	}

	async translate(text: string, options?: TranslateOptions): Promise<string> {
		await this.rateLimiter.wait(this.apiKey);

		const response = await fetch(
			'https://api.groq.com/openai/v1/chat/completions',
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'llama-3.1-70b-versatile',
					messages: [
						{
							role: 'system',
							content: 'You are a professional subtitle translator...',
						},
						{
							role: 'user',
							content: `Translate to Portuguese: ${text}`,
						},
					],
				}),
			},
		);

		const data = await response.json();
		return data.choices[0].message.content;
	}

	getRateLimit(): RateLimitInfo {
		return {
			requestsPerMinute: 30,
			tokensPerMinute: 14400,
		};
	}

	getCost(): number {
		return 0; // Free (beta)
	}
}
```

### Provider Manager

```typescript
export class ProviderManager {
	private providers: AIProvider[] = [];

	registerProvider(provider: AIProvider, priority: number) {
		this.providers.push({ provider, priority });
		this.providers.sort((a, b) => a.priority - b.priority);
	}

	async translate(text: string, options?: TranslateOptions): Promise<string> {
		let lastError: Error | null = null;

		for (const { provider } of this.providers) {
			if (!(await provider.isAvailable())) {
				logger.debug(`${provider.name} not available, skipping`);
				continue;
			}

			try {
				logger.info(`Attempting translation with ${provider.name}`);
				const result = await provider.translate(text, options);

				logger.info(`Translation successful with ${provider.name}`);
				return result;
			} catch (error) {
				logger.warn(`${provider.name} failed: ${error.message}`);
				lastError = error;

				// If not quota error, don't continue
				if (!(error instanceof QuotaError)) {
					throw error;
				}
			}
		}

		throw lastError || new Error('All providers failed');
	}

	getStats() {
		return {
			providers: this.providers.map(({ provider }) => ({
				name: provider.name,
				available: provider.isAvailable(),
				rateLimit: provider.getRateLimit(),
				cost: provider.getCost(1000), // Cost per 1k tokens
			})),
		};
	}
}
```

---

## 📊 Monitoramento e Estatísticas

### Métricas por Provider

```typescript
interface ProviderStats {
	name: string;
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	quotaErrors: number;
	avgLatency: number;
	totalCost: number;
	lastUsed: Date;
}

export class StatsCollector {
	private db: Database;

	recordRequest(
		provider: string,
		success: boolean,
		latency: number,
		cost: number,
	) {
		this.db.run(
			`
      INSERT INTO provider_stats 
      (provider, success, latency, cost, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `,
			[provider, success ? 1 : 0, latency, cost, Date.now()],
		);
	}

	getStats(provider: string, since?: Date): ProviderStats {
		const query = since
			? 'SELECT * FROM provider_stats WHERE provider = ? AND timestamp > ?'
			: 'SELECT * FROM provider_stats WHERE provider = ?';

		const rows = this.db.all(query, [provider, since?.getTime()]);

		return {
			name: provider,
			totalRequests: rows.length,
			successfulRequests: rows.filter((r) => r.success).length,
			failedRequests: rows.filter((r) => !r.success).length,
			quotaErrors: rows.filter((r) => r.error_type === 'quota').length,
			avgLatency: rows.reduce((sum, r) => sum + r.latency, 0) / rows.length,
			totalCost: rows.reduce((sum, r) => sum + r.cost, 0),
			lastUsed: new Date(Math.max(...rows.map((r) => r.timestamp))),
		};
	}

	getAllStats(): ProviderStats[] {
		const providers = this.db
			.all(
				`
      SELECT DISTINCT provider FROM provider_stats
    `,
			)
			.map((r) => r.provider);

		return providers.map((p) => this.getStats(p));
	}
}
```

### Dashboard de Custos

```tsx
// src/renderer/components/CostDashboard.tsx
export function CostDashboard() {
	const stats = useProviderStats();

	return (
		<div className="grid grid-cols-2 gap-4">
			<div className="bg-white p-4 rounded shadow">
				<h3 className="font-bold mb-2">Custo Total (Mês)</h3>
				<div className="text-3xl text-green-600">
					${stats.totalCost.toFixed(2)}
				</div>
				<div className="text-sm text-gray-500">
					{stats.freeRequests} requests gratuitas
				</div>
			</div>

			<div className="bg-white p-4 rounded shadow">
				<h3 className="font-bold mb-2">Provider Usado</h3>
				<div className="space-y-2">
					{stats.providers.map((p) => (
						<div key={p.name} className="flex justify-between">
							<span>{p.name}</span>
							<span className="text-sm">
								{p.percentage}% ({p.requests} req)
							</span>
						</div>
					))}
				</div>
			</div>

			<div className="bg-white p-4 rounded shadow">
				<h3 className="font-bold mb-2">Taxa de Sucesso</h3>
				<div className="text-3xl text-blue-600">{stats.successRate}%</div>
			</div>

			<div className="bg-white p-4 rounded shadow">
				<h3 className="font-bold mb-2">Latência Média</h3>
				<div className="text-3xl text-purple-600">{stats.avgLatency}s</div>
			</div>
		</div>
	);
}
```

---

## 🎯 Decisão Final

### Configuração Recomendada (Custo Zero)

```typescript
const CONFIG = {
	primary: {
		provider: 'gemini',
		model: 'gemini-2.0-flash-exp',
		keys: [
			// User adiciona 5 keys
		],
		rpm: 10,
		cooldown: 300000, // 5 min
	},
	fallback: {
		provider: 'groq',
		model: 'llama-3.1-70b-versatile',
		keys: [
			// User adiciona 1-2 keys
		],
		rpm: 30,
	},
	cache: {
		enabled: true,
		ttl: Infinity, // Cache permanente
	},
	retry: {
		maxAttempts: 3,
		backoff: 'exponential',
		initialDelay: 1000,
	},
};
```

### Paths de Upgrade

**Se usar muito (>10 episódios/dia):**

1. Adicionar mais keys Gemini (5 → 10 keys)
2. Usar Groq mais agressivamente
3. Considerar GPT-4o-mini ($1-2/mês)

**Se qualidade for crítica:**

1. DeepL para filmes importantes
2. Claude Haiku para séries favoritas
3. GPT-4o para casos especiais

**Se velocidade for necessária:**

1. Groq como primário (muito rápido)
2. Paralelizar com múltiplos providers
3. Aumentar concorrência

---

## 📈 Roadmap de APIs

### Fase 1 (MVP) - FREE ONLY

- [x] Gemini (múltiplas keys)
- [x] Rate limiting
- [x] Key rotation
- [ ] Groq como fallback

### Fase 2 - HYBRID

- [ ] Suporte a providers pagos (opt-in)
- [ ] GPT-4o-mini integration
- [ ] DeepL para casos especiais
- [ ] Dashboard de custos

### Fase 3 - ADVANCED

- [ ] Claude integration
- [ ] Auto-selection baseado em qualidade
- [ ] A/B testing de providers
- [ ] Cost optimization automático

### Futuro

- [ ] Modelos locais (Ollama)
- [ ] Fine-tuning de modelos próprios
- [ ] API REST para integrações

---

**Última atualização:** 3 de março de 2026  
**Decisão:** Começar com Gemini + Groq (100% FREE)  
**Custo estimado:** **$0/mês** ✅
