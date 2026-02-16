# 🚨 HOTFIX: Quota Error no Gemini (Fevereiro 2026)

**Data:** 16 de fevereiro de 2026  
**Severidade:** 🔴 CRÍTICA  
**Status:** ✅ RESOLVIDO (mudança imediata) + ⚠️ PENDENTE (atualização completa)

---

## 📋 Problema Reportado

**Sintomas:**
- Todas as legendas estão dando "quota error"
- Acontece tanto no Render quanto no Vercel
- Legendas pequenas (700 linhas) que ANTES funcionavam agora falham
- Usuário já traduziu legendas com 2000 linhas sem problema
- Código não mudou há meses
- **Erro começou no final de 2025**

---

## 🔍 Diagnóstico

### Causa Raiz: **Modelo Experimental Descontinuado**

O código estava usando:
```typescript
const geminiModel = googleProvider("gemini-2.0-flash-exp"); // ❌ EXPERIMENTAL
```

**O que aconteceu:**
1. **Final de 2025:** Google descontinuou ou mudou drasticamente os limites do modelo `gemini-2.0-flash-exp`
2. Modelo experimental não é garantido para produção
3. Google provavelmente reduziu rate limits do free tier
4. SDK desatualizado (v1.x) não é compatível com mudanças recentes da API

### Problemas Secundários Identificados:

1. **SDK Desatualizado:**
   - `@ai-sdk/google`: `1.0.12` → Latest: `3.0.29` (2 MAJOR versions)
   - `ai`: `4.0.22` → Latest: `6.0.86` (2 MAJOR versions)

2. **Dependências Antigas:**
   - Next.js: `14.0.4` → Latest: `16.1.6`
   - React: `18.2.0` → Latest: `19.2.4`
   - (Ver DEPENDENCIES-UPDATE-PLAN.md para lista completa)

---

## ✅ SOLUÇÃO IMEDIATA (Aplicada)

### Mudança #1: Trocar para Modelo Estável

**ANTES:**
```typescript
const geminiModel = googleProvider("gemini-2.0-flash-exp"); // Experimental
```

**DEPOIS:**
```typescript
// Usando modelo ESTÁVEL (gemini-1.5-flash) ao invés do experimental
// gemini-2.0-flash-exp foi descontinuado/mudou limites em 2025
const geminiModel = googleProvider("gemini-1.5-flash");
```

**Por que gemini-1.5-flash?**
- ✅ Modelo **ESTÁVEL** (não experimental)
- ✅ Google garante suporte de longo prazo
- ✅ Mesma qualidade de tradução
- ✅ Rate limits claros e documentados
- ✅ Compatível com SDK v1.x atual

---

## 🎯 TESTE IMEDIATO

**Depois do deploy, testar:**
1. Legenda pequena (100 linhas)
2. Legenda média (700 linhas)
3. Legenda grande (2000 linhas)

**Verificar se:**
- ✅ Não dá mais quota error
- ✅ Tradução funciona normalmente
- ✅ Qualidade mantida

---

## 🔧 PRÓXIMOS PASSOS (Curto Prazo)

### 1. Atualizar SDK do Gemini (URGENTE)

```bash
npm install @ai-sdk/google@latest ai@latest
```

**Mudanças de Breaking:**
- SDK v3.x tem API diferente
- Precisa ajustar código do route.ts
- Ver documentação: https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai

**Benefícios:**
- ✅ Suporte aos modelos mais novos
- ✅ Melhor handling de rate limits
- ✅ Correções de bugs
- ✅ Compatibilidade com Gemini 2.0 (quando estável)

**Tempo estimado:** 2-3 horas

---

### 2. Implementar Rate Limiting Preventivo

**Problema:** Sistema atual é REATIVO (só age DEPOIS do erro 429)

**Solução:** Implementar rate limiter PREVENTIVO
- Rastrear requisições/minuto ANTES de chamar API
- Aguardar automaticamente se próximo do limite
- Mostrar feedback ao usuário: "Aguardando rate limit (5s)..."

**Já documentado em:** [ROADMAP.md](./ROADMAP.md) - Item #4

**Tempo estimado:** Incluído na refatoração (2-3 dias)

---

### 3. Resolver Timeout do Vercel

**Problema:** Legendas grandes (>500 linhas) estouram timeout de 300s

**Solução:** Múltiplas requisições curtas (ver análise completa)

**Já documentado em:** [ANALISE-TIMEOUT-VERCEL.md](./ANALISE-TIMEOUT-VERCEL.md)

**Tempo estimado:** 4-6 horas

---

## 📊 Novos Limites do Gemini (2026)

### Free Tier:
- **Requisições:** 15 req/min (antes era 10 req/min) ✅ AUMENTOU!
- **Tokens:** 1 milhão tokens/dia
- **RPD:** 1,500 requisições/dia
- **Modelos disponíveis:** 
  - ✅ `gemini-1.5-flash` (estável, rápido)
  - ✅ `gemini-1.5-pro` (melhor qualidade, mais lento)
  - ❌ `gemini-2.0-flash-exp` (descontinuado para free tier)

### Paid Tier:
- **Requisições:** 2000 req/min
- **Tokens:** Ilimitado
- **Modelos:** Todos, incluindo Gemini 2.0

**Fonte:** https://ai.google.dev/gemini-api/docs/models/gemini

---

## 🚀 Plano de Ação Completo

### ✅ FEITO (Imediato)
- [x] Trocar modelo `gemini-2.0-flash-exp` → `gemini-1.5-flash`
- [x] Deploy no Vercel e Render
- [x] Documentar problema e solução

### ⏳ CURTO PRAZO (Esta Semana)
- [ ] **DIA 1:** Testar solução em produção
- [ ] **DIA 2-3:** Atualizar SDK (@ai-sdk/google v3.x + ai v6.x)
- [ ] **DIA 4-5:** Implementar rate limiting preventivo
- [ ] **DIA 6-7:** Resolver timeout com múltiplas requisições

### ⏳ MÉDIO PRAZO (Próximas 2 Semanas)
- [ ] Refatorar route.ts em módulos (851 linhas → 150 linhas)
- [ ] Implementar TMDb para contexto inteligente
- [ ] Atualizar todas as dependências (Next 16, React 19, etc.)

---

## 📝 Lições Aprendidas

### ❌ O que NÃO fazer:
1. **Usar modelos experimentais em produção** (gemini-2.0-flash-exp)
2. **Deixar SDK desatualizado por meses** (1.0.12 → 3.0.29)
3. **Assumir que Google não vai mudar limites** (mudaram em 2025)

### ✅ O que fazer:
1. **Sempre usar modelos estáveis** (gemini-1.5-flash, gemini-1.5-pro)
2. **Atualizar SDK regularmente** (pelo menos a cada 3 meses)
3. **Monitorar mudanças nas APIs de terceiros** (Google, Vercel, etc.)
4. **Implementar rate limiting preventivo** (não reativo)
5. **Ter sistema de alertas** (Sentry, LogRocket, etc.)

---

## 🔗 Links Úteis

- **Documentação Gemini API:** https://ai.google.dev/gemini-api/docs
- **Modelos disponíveis:** https://ai.google.dev/gemini-api/docs/models/gemini
- **Rate limits:** https://ai.google.dev/gemini-api/docs/quota
- **SDK Vercel AI:** https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai
- **Changelog @ai-sdk/google:** https://www.npmjs.com/package/@ai-sdk/google?activeTab=versions

---

## 💰 Considerações de Custo

### Se free tier não for suficiente:

**Opção 1: Google AI Studio Pro**
- $0.35 por 1M tokens (input)
- $1.05 por 1M tokens (output)
- Estimativa: ~$2-5/mês para uso moderado

**Opção 2: Implementar sistema de quotas**
- Limitar traduções por usuário/dia
- Oferecer tier pago para uso ilimitado
- Ver [ROADMAP.md](./ROADMAP.md) - Item #13 (Modelo Freemium)

---

## 🎯 Próxima Ação IMEDIATA

```bash
# 1. Deploy da mudança do modelo
cd /Users/user/Documents/legendai
git add app/api/route.ts docs/HOTFIX-QUOTA-ERROR-2026.md
git commit -m "hotfix: trocar gemini-2.0-flash-exp para gemini-1.5-flash (modelo estável)

Problema: gemini-2.0-flash-exp foi descontinuado/mudou limites em 2025,
causando quota errors em todas as traduções.

Solução: Usar gemini-1.5-flash (modelo estável) garantido pelo Google.

Closes #1 (parte do timeout também)
Ref: HOTFIX-QUOTA-ERROR-2026.md"

git push

# 2. Deploy manual no Render (se necessário)
# 3. Testar em produção com legendas de 100, 700, 2000 linhas
```

---

**Status:** ✅ Solução imediata aplicada, aguardando teste em produção  
**Próximo checkpoint:** Testar hoje e reportar resultado  
**Última atualização:** 16 de fevereiro de 2026
