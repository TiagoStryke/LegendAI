# 🗺️ LegendAI - Roadmap

**Última atualização:** 29 de dezembro de 2025  
**Versão Atual:** 0.2.0  
**URLs:**
- 🌐 Produção: https://uselegendai.vercel.app
- 📦 GitHub: https://github.com/TiagoStryke/LegendAI

---

## 📊 Status Atual

### ✅ Funcionalidades Implementadas
- Tradução de legendas SRT para português brasileiro
- Interface web responsiva com tema claro/escuro
- Processamento em chunks com barra de progresso em tempo real
- Sistema de retry automático para erros de API
- Extração de contexto do nome do arquivo (série/filme)
- Deploy automatizado na Vercel e Render

### 🚨 Problemas Críticos Identificados
- **CRÍTICO:** Timeout do Vercel após 300 segundos (5 minutos)
- **CRÍTICO:** 851 linhas em um único arquivo (route.ts) - dificulta manutenção
- **ALTA:** Rate limiting reativo (estoura 10 req/min) - precisa ser preventivo
- **ALTA:** Falta validação de API key antes de iniciar tradução
- **MÉDIA:** Perda de contexto entre chunks
- **MÉDIA:** Erros de gênero na tradução (excitado/excitada, culpado/culpada)

---

## 🔥 PRIORIDADE CRÍTICA - Resolver Imediatamente

### 1. 🚨 Resolver Timeout do Vercel (300 segundos)
**Problema:** `Vercel Runtime Timeout Error: Task timed out after 300 seconds`

**Causa:** A aplicação faz UMA única chamada POST que processa todas as legendas sequencialmente. Legendas grandes (>500 linhas) demoram mais de 5 minutos e excedem o limite do Vercel.

**Soluções Possíveis:**

#### Opção A: Processar em Background Job (RECOMENDADA)
- Dividir em 2 requests:
  1. POST inicial retorna imediatamente um `job_id`
  2. Cliente faz polling em GET `/api/status/${job_id}` para acompanhar progresso
- **Vantagens:** Sem timeout, escalável, pode processar arquivos enormes
- **Desvantagens:** Mais complexo, requer persistência (Redis/Upstash ou DB)
- **Tempo:** 2-3 dias

#### Opção B: Processar Chunk por Chunk via Múltiplas Requisições (MAIS RÁPIDA)
- Cliente divide o arquivo em chunks e faz múltiplas requisições POST
- Cada requisição processa 1 chunk (~50-100 linhas) e retorna em <30s
- Cliente concatena os resultados no final
- **Vantagens:** Simples, não precisa backend adicional, funciona no Vercel
- **Desvantagens:** Mais requisições, cliente precisa gerenciar estado
- **Tempo:** 1 dia

#### Opção C: Migrar para Render/Railway (TEMPORÁRIA)
- Render não tem limite de 300s (vimos que funciona lá)
- **Vantagens:** Resolve imediatamente sem código
- **Desvantagens:** Perde benefícios do Vercel (Edge, CDN), não resolve o problema raiz
- **Tempo:** 2 horas

**DECISÃO RECOMENDADA:** Opção B (múltiplas requisições) primeiro para resolver urgente, depois migrar para Opção A quando implementar fila de jobs.

**Checklist:**
- [ ] Criar branch `fix/vercel-timeout`
- [ ] Modificar cliente para dividir arquivo em chunks menores
- [ ] Criar endpoint `/api/translate-chunk` que processa 1 chunk por vez
- [ ] Modificar barra de progresso para mostrar chunks processados
- [ ] Testar com arquivo grande (1000+ linhas)
- [ ] Deploy e teste em produção
- [ ] Documentar solução no README.md

---

### 2. ✅ Validar API Key antes de iniciar tradução
**Problema:** Usuário só descobre que a API key é inválida DEPOIS de fazer upload e iniciar tradução.

**Solução:**
- Adicionar validação no Step 2 (input da API key)
- Fazer uma chamada test ao Gemini quando usuário cola a chave
- Mostrar ✅ "API key válida" ou ❌ "API key inválida" em tempo real
- Desabilitar botão de upload se key for inválida

**Checklist:**
- [ ] Criar função `validateApiKey()` no cliente
- [ ] Fazer chamada leve ao Gemini (ex: traduzir "hello" → "olá")
- [ ] Adicionar feedback visual no input (ícone ✅/❌)
- [ ] Adicionar mensagem de erro clara
- [ ] Desabilitar próximo step se key inválida
- [ ] Adicionar cache da validação (não validar a cada tecla)
- [ ] Testar com key válida e inválida

**Tempo estimado:** 2-3 horas

---

## 🔴 PRIORIDADE ALTA - Fazer logo após críticos

### 3. Refatorar route.ts em módulos (851 linhas → ~150 linhas)

**Por quê?** Impossível adicionar novas features com 851 linhas em um arquivo. Código difícil de manter, testar e debugar.

**Estrutura proposta:**
```
lib/translation/
├── types.ts              (~40 linhas)  - Interfaces e tipos
├── config.ts             (~30 linhas)  - Constantes e configurações
├── formatter.ts          (~80 linhas)  - Formatação de texto
├── context-extractor.ts  (~150 linhas) - Extração de contexto (filename + TMDb)
├── error-handler.ts      (~60 linhas)  - Detecção e tratamento de erros
├── rate-limiter.ts       (~120 linhas) - Rate limiting PREVENTIVO (NOVO)
├── translator.ts         (~200 linhas) - Lógica de tradução
└── index.ts              (~20 linhas)  - Exports centralizados

app/api/route.ts          (~150 linhas) - Apenas POST handler
```

**Checklist:**
- [ ] Criar branch `feature/code-organization`
- [ ] Criar backup: `git tag v0.2.0-pre-refactor`
- [ ] Criar estrutura de pastas `lib/translation/`
- [ ] Criar módulos na ordem: types → config → formatter → error-handler → rate-limiter → context-extractor → translator
- [ ] Refatorar route.ts para importar dos módulos
- [ ] Testar todas as funcionalidades
- [ ] `npm run build` - verificar se passa
- [ ] Deploy preview no Vercel
- [ ] Merge para main e criar tag `v0.3.0`

**Documentação completa:** Ver [REFACTORING-PLAN.md](./REFACTORING-PLAN.md)

**Tempo estimado:** 2-3 dias

---

### 4. Implementar Rate Limiting Preventivo

**Problema atual:** Sistema é REATIVO - só age DEPOIS do erro 429. Isso causa:
- Retry loops que demoram minutos
- Experiência ruim do usuário
- Desperdício de recursos

**Solução:**
- Rate limiter PREVENTIVO dentro do módulo `rate-limiter.ts`
- Rastrear requisições/minuto ANTES de fazer chamada
- Se próximo da quota, aguardar automaticamente
- Mostrar feedback ao usuário: "Aguardando rate limit (5s)..."

**Limites do Gemini:**
- 10 requisições por minuto (tier gratuito)
- 40 requisições por minuto (tier pago - investigar)

**Features:**
- Contador de requisições em janela deslizante
- Previsão de quando pode fazer próxima chamada
- Feedback visual no progresso
- Configurável por environment variable

**Checklist:**
- [ ] Já será criado na refatoração (módulo `rate-limiter.ts`)
- [ ] Implementar sliding window counter
- [ ] Adicionar método `canMakeRequest()`
- [ ] Adicionar método `waitUntilReady()`
- [ ] Integrar com `translator.ts`
- [ ] Adicionar feedback na UI
- [ ] Testar com múltiplas traduções seguidas
- [ ] Medir melhoria: zero erros 429

**Tempo estimado:** Incluído na refatoração (item 3)

---

## 🟠 PRIORIDADE MÉDIA - Melhorar qualidade e features

### 5. Integração com TMDb (contexto de filmes/séries)

**Problema:** Tradução perde contexto e comete erros de vocabulário específico e gênero.

**Exemplos:**
- "buff" em Survivor = "bandana" (não "polimento" ou "forte")
- "Você está excitado?" - Traduz errado se não saber gênero do personagem
- Falta de contexto da trama do episódio

**Solução:**
- Criar conta no TMDb e obter API key
- Buscar série/filme baseado no filename
- Extrair: sinopse, gêneros, personagens, cast
- Enriquecer prompt da IA com esse contexto
- **⚠️ CRÍTICO:** Implementar CACHE AGRESSIVO (TMDb limita 40 req/10s)

**Sistema de Cache:**
```typescript
// Cache em memória (início)
Map<filename, { tmdbData, timestamp }>

// Cache distribuído (produção com múltiplos usuários)
Redis/Upstash com TTL de 24-48h
```

**Checklist:**
- [ ] Criar conta TMDb: https://www.themoviedb.org/settings/api
- [ ] Adicionar `TMDB_API_KEY` no `.env.local`
- [ ] Implementar busca no TMDb (já estruturado em `context-extractor.ts`)
- [ ] Extrair: overview, genres, cast, episode details
- [ ] Implementar cache em memória (Map)
- [ ] Enriquecer prompt com contexto TMDb
- [ ] Testar com Survivor, Friends, Breaking Bad
- [ ] Medir melhoria na qualidade
- [ ] (Futuro) Migrar cache para Redis se necessário

**Tempo estimado:** 3-4 dias (inclui sistema de cache)

---

### 6. Manter contexto entre chunks (sliding window)

**Problema:** Cada chunk é traduzido isoladamente, perdendo contexto de falas anteriores.

**Solução:**
- Implementar "sliding window" - incluir últimas 2-3 legendas do chunk anterior
- Formato: `[CONTEXTO: ...legendas anteriores...] | [ATUAL: ...legendas a traduzir...]`
- IA recebe contexto mas só traduz a parte ATUAL
- Melhora coerência de pronomes, tempos verbais, referências

**Checklist:**
- [ ] Modificar `groupSegmentsByTokenLength()` em `lib/srt.ts`
- [ ] Adicionar overlap de 2-3 legendas entre chunks
- [ ] Ajustar prompt para distinguir CONTEXTO vs ATUAL
- [ ] Ajustar parsing da resposta (ignorar contexto, pegar só atual)
- [ ] Testar com diálogos longos
- [ ] Medir impacto na qualidade

**Tempo estimado:** 2 dias

---

### 7. Suporte a múltiplos formatos de legenda

**Objetivo:** Aceitar e exportar SRT, VTT, ASS, SSA, SUB, SBV (YouTube)

**Formatos principais:**
- ✅ SRT - já suportado
- [ ] VTT (WebVTT) - padrão web, similar ao SRT
- [ ] ASS/SSA (Advanced SubStation) - suporta estilos, cores, posições
- [ ] SUB (MicroDVD, SubViewer) - formato antigo
- [ ] SBV (SubViewer/YouTube) - formato do YouTube

**Estratégia:**
- Parser universal que detecta formato automaticamente
- Converter para formato interno unificado
- Traduzir o conteúdo
- Exportar no MESMO formato do upload (preservar estilos)

**Checklist:**
- [ ] Pesquisar bibliotecas: `subsrt`, `subtitle.js`, `subtitles-parser`
- [ ] Implementar detector de formato
- [ ] Criar parsers para cada formato
- [ ] Criar formato interno unificado
- [ ] Criar exporters para cada formato
- [ ] Preservar estilos (cores, posições) do ASS/SSA
- [ ] Testar com arquivos reais de cada formato
- [ ] Atualizar UI para mostrar formato detectado

**Tempo estimado:** 4-5 dias

---

### 8. Upload múltiplo de arquivos (processar temporada inteira)

**Feature solicitada:** Fazer upload de múltiplos arquivos SRT de uma vez e processar todos.

**Funcionalidades:**
- [ ] Input `multiple` para selecionar vários arquivos
- [ ] UI com lista de arquivos (cards ou tabela)
- [ ] Progresso individual por arquivo
- [ ] Fila de processamento (respeita rate limit)
- [ ] Permitir cancelar arquivos individuais
- [ ] Processar em paralelo (até 3-5 simultâneos)

**Download inteligente:**

**OPÇÃO 1: File System Access API (RECOMENDADA)**
```javascript
// Pedir permissão uma vez para escolher pasta
const directoryHandle = await window.showDirectoryPicker();

// Salvar cada legenda diretamente na pasta escolhida
for (const file of translatedFiles) {
  const fileHandle = await directoryHandle.getFileHandle(file.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file.content);
  await writable.close();
}
```

**OPÇÃO 2: ZIP unificado (fallback para navegadores antigos)**
```javascript
import JSZip from 'jszip';

const zip = new JSZip();
translatedFiles.forEach(file => {
  zip.file(file.name, file.content);
});
const blob = await zip.generateAsync({ type: 'blob' });
downloadBlob(blob, 'legendas-traduzidas.zip');
```

**OPÇÃO 3: Downloads individuais (último recurso)**
- Navegador baixa cada arquivo automaticamente
- Pode ser bloqueado por popup blocker se >5 arquivos

**UI de escolha:**
```
┌─────────────────────────────────────────┐
│ Como deseja baixar as legendas?         │
│                                         │
│ ○ Salvar na pasta escolhida (Chrome)   │
│ ○ Baixar como ZIP                       │
│ ○ Downloads individuais                 │
│                                         │
│ [Lembrar minha escolha]                │
└─────────────────────────────────────────┘
```

**Checklist:**
- [ ] Modificar input para `multiple`
- [ ] Criar componente `FileQueue.tsx`
- [ ] Implementar fila de processamento
- [ ] Adicionar progresso individual
- [ ] Implementar File System Access API
- [ ] Implementar fallback ZIP
- [ ] Implementar fallback downloads individuais
- [ ] Adicionar modal de escolha de método
- [ ] Salvar preferência no localStorage
- [ ] Testar com 10+ arquivos

**Tempo estimado:** 5-6 dias

---

## 🟡 PRIORIDADE BAIXA - Features adicionais

### 9. Internacionalização (i18n) do site

**Objetivo:** Interface em múltiplos idiomas (não só tradução de legendas)

**Idiomas alvos:**
- ✅ Português (pt-BR) - já existe
- [ ] Inglês (en-US) - prioridade
- [ ] Espanhol (es-ES)
- [ ] Francês (fr-FR) - considerar

**Implementação:**
- [ ] Instalar `next-intl` ou `react-i18next`
- [ ] Criar arquivos de tradução: `locales/pt.json`, `locales/en.json`, etc.
- [ ] Adicionar seletor de idioma no header/footer
- [ ] Persistir preferência no localStorage
- [ ] Traduzir TODA a interface (botões, mensagens, erros)
- [ ] Testar em todos os idiomas

**Tempo estimado:** 2-3 dias

---

### 10. Suporte a múltiplos idiomas de tradução

**Objetivo:** Traduzir de/para qualquer idioma (não só EN → PT-BR)

**Features:**
- [ ] Dropdown de idioma de origem (auto-detect ou manual)
- [ ] Dropdown de idioma de destino
- [ ] Suportar principais idiomas: EN, PT, ES, FR, DE, IT, JA, KO, ZH
- [ ] Ajustar prompt da IA para idioma selecionado
- [ ] Testar qualidade em cada par de idiomas

**Checklist:**
- [ ] Adicionar dropdowns na UI
- [ ] Criar constante `SUPPORTED_LANGUAGES` em `config.ts`
- [ ] Modificar prompt para ser dinâmico
- [ ] Implementar detecção automática de idioma (opcional)
- [ ] Testar: EN→PT, EN→ES, ES→PT, PT→EN
- [ ] Atualizar README e marketing

**Tempo estimado:** 3-4 dias

---

### 11. Créditos opcionais nas legendas

**Feature:** Adicionar texto no final da legenda traduzida:
```
[Última legenda do arquivo]

999
00:42:15,000 --> 00:42:18,000
Traduzido por LegendAI (uselegendai.vercel.app)
Powered by Google Gemini AI
```

**Configurações:**
- [ ] Checkbox: "Adicionar créditos ao final da legenda"
- [ ] Customizar texto dos créditos
- [ ] Customizar duração (1-10 segundos)
- [ ] Salvar preferência

**Tempo estimado:** 2-3 horas

---

### 12. Integração com OpenSubtitles

**Objetivo:** Permitir upload automático de legendas traduzidas para o OpenSubtitles.

**Features:**
- [ ] Criar conta na API do OpenSubtitles
- [ ] Checkbox: "Compartilhar no OpenSubtitles"
- [ ] Após tradução, fazer upload automaticamente
- [ ] Marcar como "tradução automática por IA"
- [ ] Gamificação: contador de legendas compartilhadas

**Tempo estimado:** 3-4 dias

---

## 💰 MONETIZAÇÃO - Implementar quando base estiver estável

### 13. Modelo Freemium

**Tiers propostos:**

#### 🆓 Gratuito (com API key própria)
- Traduções ilimitadas
- Todas as features
- Usuário fornece chave Gemini
- Com anúncios (Google AdSense)
- Créditos obrigatórios nas legendas

#### 🎁 Gratuito (trial sem API key)
- 3 legendas/dia
- Até 500 linhas por legenda
- Com anúncios
- Créditos obrigatórios

#### 💎 Pago (R$ 9,90/mês ou R$ 99,90/ano)
- API key da aplicação (GPT-4 ou melhor)
- Traduções ilimitadas
- Sem anúncios
- Prioridade no processamento
- Créditos opcionais
- Suporte prioritário

**Implementação:**
- [ ] Sistema de autenticação (NextAuth.js)
- [ ] Banco de dados (Supabase/PostgreSQL)
- [ ] Gateway de pagamento (Stripe + Mercado Pago)
- [ ] Dashboard do usuário
- [ ] Sistema de quotas
- [ ] Google AdSense setup

**Tempo estimado:** 4-6 semanas

---

### 14. Cálculo de custos e preços

**Análise necessária:**
- [ ] Medir tokens usados por legenda (pequena, média, grande)
- [ ] Calcular custo médio por tradução
- [ ] Projetar custos mensais para X usuários
- [ ] Definir margem de lucro
- [ ] Calcular ponto de break-even
- [ ] Criar calculadora de custos no site

**Tempo estimado:** 1 semana (análise + implementação)

---

## 📱 EXPANSÃO - Longo prazo

### 15. Extensão para navegador (Chrome/Firefox)
- Integrar com players de vídeo online
- Tradução sob demanda
- Suporte: YouTube, Netflix, Prime Video

**Tempo estimado:** 6-8 semanas

---

### 16. App Mobile (React Native/Flutter)
- Android (prioridade)
- iOS
- Tradução offline (modelo local?)
- In-app purchases

**Tempo estimado:** 3-4 meses

---

### 17. App Desktop (Electron/Tauri)
- Extração de legendas de MKV
- Batch processing
- Integração com VLC/Plex

**Tempo estimado:** 2-3 meses

---

## 🔧 MELHORIAS TÉCNICAS

### 18. Atualização de dependências (APÓS refatoração)

**⚠️ NÃO ATUALIZAR ANTES DA REFATORAÇÃO**

Atualizações MAJOR aguardando:
- Next.js: 14.0.4 → 16.1.0 (breaking changes)
- React: 18 → 19 (breaking changes)
- Tailwind: 3.3.0 → 4.1.18 (breaking changes)
- @ai-sdk/google: 1.0.12 → 2.0.49 (breaking changes)
- ai: 4.0.22 → 5.0.115 (breaking changes)

**Documentação completa:** Ver [DEPENDENCIES-UPDATE-PLAN.md](./DEPENDENCIES-UPDATE-PLAN.md)

**Checklist:**
- [ ] Aguardar refatoração completa
- [ ] Criar branch `test/next-16-react-19`
- [ ] Criar backup: `git tag v0.3.0-pre-upgrade`
- [ ] Ler changelogs de breaking changes
- [ ] Atualizar gradualmente: Next.js/React → AI SDK → Tailwind
- [ ] Testar EXTENSIVAMENTE cada atualização
- [ ] Deploy preview e teste em produção
- [ ] Merge e criar tag de release

**Tempo estimado:** 1-2 semanas (após refatoração)

---

### 19. Sistema de cache distribuído (Redis/Upstash)

**Quando?** Após integração TMDb e se crescer (>100 usuários simultâneos)

**O quê cachear:**
- Contextos do TMDb (TTL: 24-48h)
- Traduções frequentes (chunks repetidos)
- Rate limit state (compartilhado entre instâncias)

**Checklist:**
- [ ] Criar conta no Upstash (serverless-friendly)
- [ ] Implementar camada de cache em `lib/cache.ts`
- [ ] Migrar cache do TMDb para Redis
- [ ] Implementar rate limiter distribuído
- [ ] Métricas: cache hit rate, latência
- [ ] Comparar custos vs benefícios

**Tempo estimado:** 1 semana

---

### 20. Monitoramento e observabilidade

**Ferramentas:**
- [ ] Sentry (error tracking)
- [ ] LogRocket (session replay)
- [ ] PostHog ou Mixpanel (analytics)
- [ ] Google Analytics 4

**Métricas customizadas:**
- Tempo médio de tradução
- Taxa de erro vs sucesso
- Programas mais traduzidos
- Idiomas mais usados
- Taxa de conversão (free → paid)

**Tempo estimado:** 3-4 dias

---

## 📈 MARKETING E CRESCIMENTO

### 21. SEO e conteúdo

**Tarefas:**
- [ ] Meta tags otimizadas
- [ ] Sitemap.xml
- [ ] robots.txt
- [ ] Schema.org markup
- [ ] Blog integrado (tutoriais, novidades)
- [ ] Landing pages por idioma

**Tempo estimado:** 2-3 semanas

---

### 22. Social media e comunidade

**Canais:**
- [ ] Twitter/X bot (compartilhar stats)
- [ ] Instagram showcase
- [ ] YouTube (tutoriais)
- [ ] Reddit (r/subtitles, r/translator)
- [ ] Discord/Telegram community

**Tempo estimado:** Contínuo

---

## 📅 CRONOGRAMA SUGERIDO

### 🔥 SPRINT 1 (1 semana) - CRÍTICO
- [ ] Dia 1-2: Resolver timeout Vercel (opção B - múltiplas requisições)
- [ ] Dia 3: Implementar validação de API key
- [ ] Dia 4-7: Refatorar route.ts em módulos

**Entregável:** v0.3.0 - Código organizado, sem timeout, validação de key

### 🔴 SPRINT 2 (1 semana) - ALTA PRIORIDADE
- [ ] Dia 1-2: Testar e ajustar rate limiting preventivo
- [ ] Dia 3-5: Integração básica com TMDb
- [ ] Dia 6-7: Implementar cache do TMDb

**Entregável:** v0.4.0 - Contexto inteligente, sem erros de rate limit

### 🟠 SPRINT 3 (2 semanas) - MÉDIA PRIORIDADE
- [ ] Semana 1: Suporte a múltiplos formatos (VTT, ASS, SSA)
- [ ] Semana 2: Upload múltiplo + download inteligente

**Entregável:** v0.5.0 - Múltiplos formatos, batch processing

### 🟡 SPRINT 4 (2 semanas) - FEATURES ADICIONAIS
- [ ] Semana 1: Internacionalização (EN, ES)
- [ ] Semana 2: Multi-idioma de tradução

**Entregável:** v0.6.0 - Interface e tradução multi-idioma

### 💰 SPRINT 5+ (4-6 semanas) - MONETIZAÇÃO
- [ ] Autenticação e banco de dados
- [ ] Sistema de pagamentos
- [ ] Dashboard do usuário
- [ ] Google AdSense

**Entregável:** v1.0.0 - Versão comercial completa

---

## ✅ CHECKLIST GERAL DE DESENVOLVIMENTO

### Antes de cada feature:
- [ ] Criar branch específica
- [ ] Criar tag de backup se for mudança grande
- [ ] Ler documentação de APIs/bibliotecas

### Durante desenvolvimento:
- [ ] Commits atômicos e descritivos
- [ ] Testar localmente (`npm run dev`)
- [ ] Verificar erros no console

### Antes de fazer merge:
- [ ] `npm run build` - build sem erros?
- [ ] Testar todas as funcionalidades afetadas
- [ ] Deploy preview no Vercel
- [ ] Testar em produção (preview URL)
- [ ] Verificar logs de erro

### Após merge:
- [ ] Atualizar CHANGELOG.md
- [ ] Criar release tag (vX.Y.Z)
- [ ] Atualizar README.md se necessário
- [ ] Comunicar mudanças (se relevante)

---

## 📝 DECISÕES PENDENTES

1. ✅ ~~Nome do projeto~~ → **LegendAI** (decidido em 19/12/2025)
2. 🤔 **Licença:** MIT (open source) ou Proprietária?
3. 🤔 **Modelo de IA pago:** GPT-4, Claude 3, ou Gemini Pro?
4. 🤔 **Gateway de pagamento:** Stripe, Mercado Pago, ou ambos?
5. 🤔 **Download múltiplo:** File System Access API, ZIP, ou ambos?
6. 🤔 **Hosting:** Continuar Vercel ou migrar para AWS/Railway?

---

## 📚 DOCUMENTOS DE REFERÊNCIA

- **[REFACTORING-PLAN.md](./REFACTORING-PLAN.md)** - Detalhes da refatoração de código
- **[DEPENDENCIES-UPDATE-PLAN.md](./DEPENDENCIES-UPDATE-PLAN.md)** - Estratégia de atualização
- **[CHANGELOG.md](./CHANGELOG.md)** - Histórico de mudanças
- **[README.md](./README.md)** - Documentação geral do projeto

---

**Última atualização:** 29 de dezembro de 2025  
**Próxima ação:** Resolver timeout do Vercel (SPRINT 1, Dia 1-2)

_"Resolver problemas críticos primeiro, features depois. Código limpo é código que escala."_
