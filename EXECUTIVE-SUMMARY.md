# 📝 Resumo Executivo - Plano de Desenvolvimento

**Data:** 19 de dezembro de 2025  
**Projeto:** LegendAI (anteriormente SRT-PT-AI)  
**Versão Atual:** 0.2.0  
**Status:** PLANEJAMENTO COMPLETO ✅

**URLs:**
- 🌐 Produção: https://uselegendai.vercel.app
- 📦 GitHub: https://github.com/TiagoStryke/LegendAI

---

## 📚 Arquivos de Documentação Criados

1. ✅ **ROADMAP.md** - Todas as ideias e features organizadas em fases
2. ✅ **CHANGELOG.md** - Histórico retroativo de todas as mudanças
3. ✅ **REFACTORING-PLAN.md** - Plano detalhado de refatoração do código
4. ✅ **DEPENDENCIES-UPDATE-PLAN.md** - Análise e estratégia de atualização
5. ✅ **EXECUTIVE-SUMMARY.md** - Este arquivo (resumo executivo)

---

## 🎯 Prioridades Imediatas

### 1️⃣ PRIMEIRA PRIORIDADE: Refatoração de Código
**Por quê?** Impossível adicionar novas features com 851 linhas em um arquivo

**O que fazer:**
- Dividir `route.ts` em 9 módulos organizados
- Implementar rate limiting PREVENTIVO (não mais reativo)
- Preparar estrutura para TMDb e multi-idioma

**Tempo estimado:** 2-3 dias  
**Documentação:** Ver [REFACTORING-PLAN.md](./REFACTORING-PLAN.md)

### 2️⃣ SEGUNDA PRIORIDADE: Integração TMDb
**Por quê?** Resolver problemas de contexto e gênero gramatical

**O que fazer:**
- Criar conta no TMDb e obter API key
- Implementar busca automática de séries/filmes
- Extrair sinopse, personagens e gêneros
- Melhorar prompt da IA com esse contexto
- ⚠️ **CRÍTICO:** Implementar cache OBRIGATÓRIO
  - TMDb limita: 40 requisições / 10 segundos
  - Cache em memória inicial (Map/LRU)
  - Migrar para Redis se crescer (múltiplos usuários)
  - Cache TTL: 24-48h (contexto não muda)
  - Fallback: usar filename se TMDb falhar

**Tempo estimado:** 4-5 dias (inclui sistema de cache robusto)  
**Benefícios:**
- ✅ Tradução mais precisa (contexto de episódio)
- ✅ Gênero correto (excitado vs excitada)
- ✅ Vocabulário específico (buff = bandana em Survivor)
- ✅ Escalável (cache evita rate limiting)

### 3️⃣ TERCEIRA PRIORIDADE: Múltiplos Formatos e Upload em Lote
**Por quê?** Experiência do usuário - processar temporada inteira em qualquer formato

**O que fazer:**
- **Suporte a múltiplos formatos:** SRT, VTT, ASS, SSA, SUB, SBV
  - Parser universal de legendas
  - Download no mesmo formato do upload
  - Preservar estilos e metadados
- **Upload múltiplo:**
  - Input aceita múltiplos arquivos
  - Fila de processamento
  - Progresso individual
- **Download inteligente:**
  - 🎯 **IDEAL:** File System Access API (salvar na pasta escolhida)
  - 📦 **ALTERNATIVA:** ZIP unificado
  - 📥 **FALLBACK:** Downloads individuais automáticos
  - 🖥️ **FUTURO:** App desktop (salva na mesma pasta automaticamente)

**Tempo estimado:** 4-5 dias (inclui parsers de múltiplos formatos)  
**Complexidade:** Média-Alta

---

## 📅 Cronograma Sugerido

### SEMANA 1-2: Organização e Refatoração
- [ ] **Dia 1-2:** Criar branch e módulos (REFACTORING-PLAN.md Fase 2)
- [ ] **Dia 3-4:** Refatorar route.ts (REFACTORING-PLAN.md Fase 3)
- [ ] **Dia 5-6:** Testes completos (REFACTORING-PLAN.md Fase 4)
- [ ] **Dia 7:** Build, deploy e merge (REFACTORING-PLAN.md Fase 5)

**Entregável:** Código organizado, rate limiting preventivo, base para features

### SEMANA 3-4: Integração TMDb
- [ ] **Dia 1:** Criar conta TMDb, estudar API
- [ ] **Dia 2-3:** Implementar busca e cache de contexto
- [ ] **Dia 4-5:** Integrar com prompt da IA
- [ ] **Dia 6-7:** Testes e ajustes finos

**Entregável:** Tradução com contexto automático de episódios/filmes

### SEMANA 5-6: Múltiplos Formatos e Upload em Lote
- [ ] **Dia 1-2:** Implementar parsers (VTT, ASS, SSA, etc.)
- [ ] **Dia 3:** Implementar fila de arquivos múltiplos
- [ ] **Dia 4:** UI de progresso múltiplo
- [ ] **Dia 5:** File System Access API (salvar em pasta escolhida)
- [ ] **Dia 6:** Fallback ZIP + downloads individuais
- [ ] **Dia 7:** Polimento e testes

**Entregável:** Processar múltiplas legendas em qualquer formato, download inteligente

### SEMANA 7-8: Internacionalização
- [ ] **Dia 1-2:** Setup i18n (next-intl)
- [ ] **Dia 3-4:** Traduzir site para inglês e espanhol
- [ ] **Dia 5-6:** Suportar tradução EN→ES, ES→PT, etc.
- [ ] **Dia 7:** Testes multi-idioma

**Entregável:** Site e tradução suportando múltiplos idiomas

---

## 💰 Plano de Monetização (Médio/Longo Prazo)

### Modelo Proposto: Freemium

#### Tier Gratuito (com própria API key)
- ✅ Traduções ilimitadas
- ✅ Todas as features (TMDb, upload múltiplo)
- ⚠️ Usuário fornece chave Gemini
- ⚠️ Com anúncios (Google AdSense)
- ⚠️ Créditos nas legendas

#### Tier Gratuito (trial)
- ✅ 3 legendas/dia
- ✅ Até 500 linhas por legenda
- ⚠️ Com anúncios
- ⚠️ Créditos obrigatórios

#### Tier Pago (R$ 9,90/mês ou R$ 99,90/ano)
- ✅ API key da aplicação (GPT-4 ou Gemini melhor)
- ✅ Traduções ilimitadas
- ✅ Sem anúncios
- ✅ Prioridade no processamento
- ✅ Créditos opcionais
- ✅ Suporte prioritário

### Implementação
**Quando?** Após Semana 8 (base estável)

**O que precisa:**
- Sistema de autenticação (NextAuth.js)
- Banco de dados (Supabase/PostgreSQL)
- Gateway de pagamento (Stripe + Mercado Pago)
- Dashboard do usuário
- Google AdSense setup

**Tempo estimado:** 4-6 semanas

---

## 🚨 Avisos Importantes

### ❌ NÃO FAZER AGORA

1. **NÃO atualizar dependências** antes de refatorar
   - Next.js 14 → 16, React 18 → 19 são MAJOR updates
   - Se algo quebrar durante refatoração, será impossível debugar
   - **Quando:** Após refatoração completa e testada

2. **NÃO tornar repositório privado** ainda
   - Mantém open source para crescimento orgânico
   - Comunidade pode contribuir
   - **Quando:** Decidir após implementar monetização

3. **NÃO implementar todas as features de uma vez**
   - Foco em uma fase por vez
   - Testar bem antes de prosseguir
   - Evitar "feature creep"

### ✅ FAZER

1. **Seguir ordem das prioridades**
   - Refatoração → TMDb → Upload → Multi-idioma → Monetização
   
2. **Testar extensivamente em cada etapa**
   - Desenvolvimento local
   - Preview deploy (Vercel)
   - Produção

3. **Documentar tudo**
   - Atualizar CHANGELOG.md a cada release
   - Atualizar README.md com novas features
   - Commits descritivos

---

## 🎓 Aprendizados e Melhorias Contínuas

### Arquitetura
- ✅ Rate limiting preventivo > reativo
- ✅ Módulos pequenos e focados
- ✅ Separação de responsabilidades
- 🔜 Cache com Redis (futuro)
- 🔜 Queue system para jobs longos (futuro)

### IA e Tradução
- ✅ Contexto melhora muito a qualidade
- ✅ Filename parsing é útil mas limitado
- 🔜 TMDb dará contexto muito melhor
- 🔜 Histórico de diálogos anteriores (sliding window)
- 🔜 Fine-tuning de modelo (muito futuro)

### Experiência do Usuário
- ✅ Feedback em tempo real é crucial
- ✅ Transparência sobre rate limits
- 🔜 Upload múltiplo é muito pedido
- 🔜 Multi-idioma expande público
- 🔜 Mobile app aumentará alcance

---

## 📊 Métricas de Sucesso

### Técnicas
- [ ] Código bem organizado (< 200 linhas por arquivo)
- [ ] Taxa de erro < 5%
- [ ] Tempo de resposta < 2min para 100 linhas
- [ ] Rate limit preventivo funcionando (zero erros 429)
- [ ] Build time < 60s
- [ ] Lighthouse score > 90

### Produto
- [ ] Traduções de alta qualidade (gênero correto)
- [ ] Contexto TMDb funcionando (vocabulário específico)
- [ ] Usuários processando temporadas completas (upload múltiplo)
- [ ] Suporte a 3+ idiomas
- [ ] NPS > 8/10

### Negócio (futuro)
- [ ] 100+ usuários ativos/mês
- [ ] 1000+ traduções/mês
- [ ] Conversão freemium → pago > 2%
- [ ] Receita > custos (break-even)

---

## 🔗 Recursos e Links Úteis

### APIs e Serviços
- **Google Gemini:** https://aistudio.google.com/app/apikey
- **TMDb API:** https://www.themoviedb.org/settings/api
- **OpenSubtitles:** https://www.opensubtitles.com/api
- **Stripe:** https://stripe.com/
- **Mercado Pago:** https://www.mercadopago.com.br/developers

### Documentação
- **Next.js:** https://nextjs.org/docs
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **next-intl:** https://next-intl-docs.vercel.app/
- **NextAuth.js:** https://next-auth.js.org/

### Ferramentas
- **Upstash Redis:** https://upstash.com/ (rate limiting distribuído)
- **Supabase:** https://supabase.com/ (PostgreSQL + Auth)
- **Sentry:** https://sentry.io/ (error tracking)
- **PostHog:** https://posthog.com/ (analytics)

---

## 🤔 Decisões Pendentes

### Urgente
- [x] ~~**Nome definitivo:**~~ **LegendAI** ✅ (Decidido em 19/12/2025)
- [ ] **Começar refatoração agora ou depois?** → AGORA (prioridade 1)

### Importante
- [ ] **Licença:** MIT (open source) ou Proprietária?
- [ ] **IA para tier pago:** GPT-4, Claude 3, ou Gemini melhor?
- [ ] **Preço:** R$ 9,90/mês ou outro valor?
- [ ] **Download múltiplo:** File System Access API, ZIP, ou ambos?

### Pode esperar
- [ ] **Repositório:** Manter público ou tornar privado?
- [ ] **Mobile:** React Native ou Flutter?
- [ ] **Desktop:** Electron ou Tauri?

---

## 🎬 Próxima Ação IMEDIATA

```bash
# 1. Criar branch de refatoração
git checkout -b feature/code-organization

# 2. Criar tag de backup
git tag v0.2.0-pre-refactor

# 3. Criar estrutura de pastas
mkdir -p lib/translation

# 4. Começar criando types.ts (base para todo o resto)
# Ver REFACTORING-PLAN.md seção "1. lib/translation/types.ts"
```

---

## 📞 Perguntas?

Consulte os documentos específicos:
- **Dúvidas sobre ROADMAP?** → [ROADMAP.md](./ROADMAP.md)
- **Dúvidas sobre refatoração?** → [REFACTORING-PLAN.md](./REFACTORING-PLAN.md)
- **Dúvidas sobre dependências?** → [DEPENDENCIES-UPDATE-PLAN.md](./DEPENDENCIES-UPDATE-PLAN.md)
- **Histórico de mudanças?** → [CHANGELOG.md](./CHANGELOG.md)

---

**Última atualização:** 18 de dezembro de 2025  
**Status:** Pronto para começar! 🚀

_"Organização agora, features depois. Código limpo é código que escala."_
