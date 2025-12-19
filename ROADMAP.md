# 🗺️ LegendAI - Roadmap & Ideas

**Última atualização:** 19 de dezembro de 2025  
**Versão Atual:** 0.2.0

---

## 📊 Status Atual do Projeto

- ✅ Tradução de legendas SRT para português brasileiro
- ✅ Interface web responsiva com tema claro/escuro
- ✅ Processamento em chunks com barra de progresso
- ✅ Sistema de retry automático para erros de API
- ✅ Extração de contexto do nome do arquivo (série/filme)
- ✅ Deploy automatizado na Vercel
- ⚠️ **Problema:** 850 linhas em um único arquivo (route.ts)
- ⚠️ **Problema:** Rate limiting não preventivo (estoura 10 req/min frequentemente)
- ⚠️ **Problema:** Perda de contexto entre chunks
- ⚠️ **Problema:** Erros de gênero na tradução (excitado/excitada, culpado/culpada)

---

## 🎯 FASE 1: ORGANIZAÇÃO E REFATORAÇÃO (PRIORIDADE MÁXIMA)

### 1.1 Estrutura de Código
- [ ] **Criar branch:** `feature/code-organization`
- [ ] **Refatorar route.ts:** Dividir em módulos menores
  - [ ] Criar `/lib/translation/context.ts` - Extração de contexto (TMDb + filename)
  - [ ] Criar `/lib/translation/translator.ts` - Lógica principal de tradução
  - [ ] Criar `/lib/translation/rate-limiter.ts` - Controle de rate limiting
  - [ ] Criar `/lib/translation/formatter.ts` - Formatação de diálogos e texto
  - [ ] Criar `/lib/translation/types.ts` - Interfaces e tipos TypeScript
  - [ ] Mover funções para módulos apropriados
- [ ] **Atualizar dependências:**
  - [ ] Next.js: 14.0.4 → 15.1.0 (latest)
  - [ ] React: 18 → 19
  - [ ] Verificar compatibilidade do @ai-sdk/google
  - [ ] Atualizar todas as dependências para versões seguras

### 1.2 Documentação
- [ ] **Criar CHANGELOG.md** (retroativo desde o início)
- [ ] **Criar CONTRIBUTING.md** (guia para contribuições)
- [ ] **Criar LICENSE** (definir licença - MIT?)
- [ ] **Atualizar README.md** com novas features

---

## 🚀 FASE 2: MELHORIAS DE CONTEXTO E QUALIDADE

### 2.1 Integração com TMDb
- [ ] **Criar conta e obter API key do TMDb**
- [ ] **⚠️ IMPORTANTE: TMDb Rate Limiting**
  - Limite: 40 requisições por 10 segundos
  - CRÍTICO: Implementar cache OBRIGATÓRIO
  - Estratégias:
    - [ ] Cache em memória (Map/LRU cache)
    - [ ] Cache em banco (Supabase/PostgreSQL)
    - [ ] Cache TTL: 24-48 horas (contexto não muda frequentemente)
    - [ ] Rate limiter preventivo específico para TMDb
    - [ ] Fallback: usar apenas contexto do filename se TMDb falhar
- [ ] **Implementar extração de contexto do TMDb:**
  - [ ] Buscar série/filme no TMDb baseado no filename
  - [ ] Para séries: GET `/tv/{show_id}/season/{season_number}?api_key=API_KEY`
  - [ ] Para filmes: GET `/movie/{movie_id}?api_key=API_KEY`
  - [ ] Extrair: sinopse, gênero, elenco principal, ano
  - [ ] **Cache AGRESSIVO de resultados** (evitar chamadas duplicadas)
- [ ] **Enriquecer prompt da IA com:**
  - [ ] Sinopse do episódio/filme
  - [ ] Personagens principais e seus gêneros
  - [ ] Contexto temporal (ano, época)
  - [ ] Gênero do conteúdo (ação, drama, comédia)

### 2.2 Escalabilidade e Performance
- [ ] **Sistema de cache distribuído (se crescer muito):**
  - [ ] Migrar cache TMDb para Redis/Upstash
  - [ ] Compartilhar cache entre todas as instâncias serverless
  - [ ] Monitorar hit rate do cache (objetivo: >90%)
  - [ ] Implementar cache warming (pré-popular séries populares)
  - [ ] Analytics: rastrear quais séries/filmes são mais traduzidos
- [ ] **Monitoramento de rate limiting:**
  - [ ] Dashboard com uso de API (Gemini + TMDb)
  - [ ] Alertas quando próximo do limite
  - [ ] Métricas: requisições/min, cache hit rate, falhas

### 2.3 Melhorias na Tradução
- [ ] **Resolver problema de gênero (masculino/feminino):**
  - [ ] Incluir lista de personagens e seus gêneros no contexto
  - [ ] Instruir IA explicitamente sobre consistência de gênero
  - [ ] Usar histórico de diálogos anteriores para manter contexto
- [ ] **Manter contexto entre chunks:**
  - [ ] Implementar "sliding window" - incluir últimas 2-3 legendas do chunk anterior
  - [ ] Passar resumo do que já foi traduzido
  - [ ] Usar conversation history do Gemini (se disponível)
- [ ] **Vocabulário especializado:**
  - [ ] Criar glossário de termos por programa (ex: Survivor → buff = bandana)
  - [ ] Permitir usuário adicionar termos customizados
  - [ ] Cache de glossários por série/filme

### 2.4 Rate Limiting Inteligente
- [ ] **Implementar rate limiter preventivo:**
  - [ ] Rastrear número de chamadas por minuto
  - [ ] Limite: 10 chamadas/minuto (API Gemini)
  - [ ] Quando atingir 8 chamadas: pausar proativamente
  - [ ] Mostrar timer no frontend: "Aguardando rate limit (15s restantes)"
  - [ ] Queue de requisições com processamento automático
- [ ] **Estudar limites da API Gemini:**
  - [ ] Documentar limites de tokens por requisição
  - [ ] Documentar limites de tokens por minuto
  - [ ] Documentar limites de requisições por minuto/dia
  - [ ] Otimizar tamanho dos chunks baseado nesses limites

---

## 🌍 FASE 3: INTERNACIONALIZAÇÃO E MULTI-IDIOMA

### 3.1 Interface Multi-idioma
- [ ] **Instalar i18n:** next-intl ou react-i18next
- [ ] **Criar traduções do site:**
  - [ ] Português (pt-BR) ✅ (já existe)
  - [ ] Inglês (en-US)
  - [ ] Espanhol (es-ES)
- [ ] **Adicionar seletor de idioma** no ThemeToggle ou header
- [ ] **Persistir preferência** (localStorage)

### 3.2 Tradução Multi-idioma
- [ ] **Suportar qualquer idioma de entrada/saída:**
  - [ ] Adicionar dropdown de idioma de origem
  - [ ] Adicionar dropdown de idioma de destino
  - [ ] Lista completa de idiomas suportados pelo Gemini
  - [ ] Detecção automática de idioma de origem (opcional)
- [ ] **Renomear projeto:**
  - [ ] Novo nome: "SubtitleAI" ou "SubTranslate AI" ou "UniversalSubs"
  - [ ] Atualizar README, package.json, documentação
  - [ ] Migrar repositório GitHub (manter redirects)
  - [ ] Configurar novo domínio Vercel

---

## 📦 FASE 4: FEATURES DE USABILIDADE

### 4.0 Suporte a Múltiplos Formatos de Legenda
- [ ] **Aceitar todos os formatos comuns:**
  - [ ] SRT (já suportado) ✅
  - [ ] VTT (WebVTT) - usado em streaming
  - [ ] ASS (Advanced SubStation Alpha) - formato avançado com estilos
  - [ ] SSA (SubStation Alpha) - predecessor do ASS
  - [ ] SUB (MicroDVD, SubViewer) - formatos antigos
  - [ ] SBV (YouTube) - formato do YouTube
- [ ] **Parser universal de legendas:**
  - [ ] Biblioteca: `subsrt` ou `subtitle.js`
  - [ ] Detectar formato automaticamente
  - [ ] Converter para formato intermediário
  - [ ] Traduzir texto preservando metadados
  - [ ] Exportar no MESMO formato do upload
- [ ] **Preservar formatação específica:**
  - [ ] ASS/SSA: estilos, cores, posições, efeitos
  - [ ] VTT: cues, posicionamento, classes CSS
  - [ ] SRT: tags HTML (<i>, <b>, <u>)
- [ ] **Validação de formato:**
  - [ ] Detectar formato inválido antes de traduzir
  - [ ] Mensagem clara de erro se formato não suportado
  - [ ] Sugestão de converter para SRT se necessário

### 4.1 Upload Múltiplo
- [ ] **Permitir seleção de múltiplos arquivos:**
  - [ ] Modificar input file para aceitar multiple
  - [ ] Suportar todos os formatos de legenda
  - [ ] Criar fila de processamento
  - [ ] Mostrar progresso de cada arquivo individualmente
  - [ ] Permitir cancelar arquivos individuais
- [ ] **Download inteligente de múltiplas legendas:**
  - [ ] **OPÇÃO 1 (Recomendada): File System Access API**
    - [ ] Usar `window.showDirectoryPicker()` (Chrome/Edge)
    - [ ] Pedir permissão para salvar na pasta selecionada
    - [ ] Salvar cada arquivo com nome original + "-translated"
    - [ ] Preservar formato original de cada arquivo
    - [ ] Fallback para ZIP se navegador não suportar
  - [ ] **OPÇÃO 2: Download individual automático**
    - [ ] Criar link de download para cada arquivo
    - [ ] Trigger automático de download em sequência
    - [ ] Intervalo de 500ms entre downloads (evitar bloqueio)
    - [ ] Navegador pergunta onde salvar cada arquivo
  - [ ] **OPÇÃO 3: ZIP unificado**
    - [ ] Criar arquivo ZIP com todas as legendas
    - [ ] Nome do ZIP: "legendas-traduzidas-YYYY-MM-DD.zip"
    - [ ] Manter estrutura de pastas se possível
    - [ ] Um único download
  - [ ] **OPÇÃO 4 (Desktop App): Salvar na mesma pasta**
    - [ ] No Electron app: acesso direto ao sistema de arquivos
    - [ ] Detectar pasta de origem do arquivo
    - [ ] Salvar tradução na mesma pasta automaticamente
    - [ ] Não precisa perguntar ao usuário
- [ ] **UI para escolher método de download:**
  - [ ] Radio buttons: "Pasta selecionada", "Downloads individuais", "ZIP"
  - [ ] Detectar suporte do navegador
  - [ ] Lembrar preferência do usuário
- [ ] **Otimizar processamento:**
  - [ ] Processar arquivos em paralelo (respeitando rate limit)
  - [ ] Persistir progresso (localStorage)
  - [ ] Continuar de onde parou em caso de erro

### 4.2 Créditos nas Legendas
- [ ] **Adicionar texto no final de cada legenda traduzida:**
  ```
  [NÚMERO_DA_ÚLTIMA_LEGENDA + 1]
  [TIMESTAMP_+1_SEGUNDO] --> [TIMESTAMP_+5_SEGUNDOS]
  Traduzida em LegendAI - https://uselegendai.vercel.app
  ```
- [ ] **Tornar configurável:**
  - [ ] Opção de habilitar/desabilitar créditos
  - [ ] Customizar texto do crédito
  - [ ] Escolher duração (1s-10s)

### 4.3 Integração com OpenSubtitles
- [ ] **Criar conta na API do OpenSubtitles**
- [ ] **Estudar documentação da API**
- [ ] **Implementar upload automático:**
  - [ ] Após cada tradução bem-sucedida
  - [ ] Opção de opt-in/opt-out para o usuário
  - [ ] Incluir metadados corretos (filme/série, temporada, episódio)
  - [ ] Marcar como "tradução automática por IA"
- [ ] **Gamificação:**
  - [ ] Mostrar contador de legendas compartilhadas
  - [ ] Badge de contribuidor

---

## 💰 FASE 5: MONETIZAÇÃO

### 5.1 Análise de Custos
- [ ] **Calcular custo médio por legenda:**
  - [ ] Medir tokens usados por arquivo (pequeno, médio, grande)
  - [ ] Calcular custo em USD do Gemini API
  - [ ] Converter para BRL
  - [ ] Criar calculadora de custos no site
- [ ] **Projeções:**
  - [ ] Custo mensal estimado para X traduções
  - [ ] Break-even point
  - [ ] Margem de lucro desejada

### 5.2 Modelo Freemium
- [ ] **Tier Gratuito (com própria API key):**
  - [ ] Usuário fornece própria chave Gemini
  - [ ] Sem limite de traduções
  - [ ] Com anúncios laterais (Google AdSense)
  - [ ] Créditos obrigatórios nas legendas
- [ ] **Tier Gratuito (trial sem API key):**
  - [ ] 3 legendas grátis por dia
  - [ ] Limite de 500 linhas por legenda
  - [ ] Com anúncios
  - [ ] Créditos obrigatórios
- [ ] **Tier Pago:**
  - [ ] Usar chave da aplicação (API melhor - GPT-4?)
  - [ ] Traduções ilimitadas
  - [ ] Sem anúncios
  - [ ] Processamento prioritário
  - [ ] Contexto TMDb automático
  - [ ] Upload múltiplo
  - [ ] Créditos opcionais
  - [ ] Preço: R$ 9,90/mês ou R$ 99,90/ano?

### 5.3 Implementação Técnica de Pagamentos
- [ ] **Escolher gateway de pagamento:**
  - [ ] Stripe (internacional)
  - [ ] Mercado Pago (Brasil)
  - [ ] Ambos?
- [ ] **Implementar:**
  - [ ] Sistema de autenticação (NextAuth.js)
  - [ ] Banco de dados (PostgreSQL/Supabase)
  - [ ] Gerenciamento de assinaturas
  - [ ] API de pagamentos
  - [ ] Dashboard do usuário (histórico, faturas)
- [ ] **Segurança da API key:**
  - [ ] Criptografar chave no servidor
  - [ ] Nunca expor no cliente
  - [ ] Variáveis de ambiente seguras
  - [ ] Rate limiting por usuário

### 5.4 Anúncios
- [ ] **Google AdSense:**
  - [ ] Criar conta
  - [ ] Adicionar ads nas laterais (desktop)
  - [ ] Ads responsivos (mobile)
  - [ ] Otimizar posicionamento para não atrapalhar UX

### 5.5 Doações
- [ ] **Buy Me a Coffee:**
  - [ ] Criar conta
  - [ ] Adicionar botão no footer
  - [ ] Widget flutuante (opcional)
- [ ] **Alternativas:**
  - [ ] Ko-fi
  - [ ] PayPal Donate
  - [ ] PIX (Brasil)

---

## 📱 FASE 6: EXPANSÃO PARA APPS E EXTENSÕES

### 6.1 Extensão para Navegador
- [ ] **Chrome Extension:**
  - [ ] Integrar com players de vídeo online
  - [ ] Traduzir legendas em tempo real
  - [ ] Suporte para YouTube, Netflix, Prime Video
- [ ] **Firefox Add-on:**
  - [ ] Port da extensão Chrome

### 6.2 Add-on para Media Players
- [ ] **VLC Plugin:**
  - [ ] Integração nativa
  - [ ] Tradução sob demanda
- [ ] **Plex/Jellyfin Plugin:**
  - [ ] Tradução automática de legendas

### 6.3 App Desktop
- [ ] **Electron App:**
  - [ ] Extração de legendas de arquivos MKV
  - [ ] Tradução local ou via API
  - [ ] Suporte para Windows, macOS, Linux
  - [ ] **VANTAGEM: Acesso direto ao sistema de arquivos**
    - [ ] Salvar tradução automaticamente na mesma pasta do original
    - [ ] Sem limitações de segurança do navegador
    - [ ] Processar pastas inteiras recursivamente
    - [ ] Watch mode: traduzir automaticamente novos arquivos

### 6.4 App Mobile
- [ ] **React Native ou Flutter:**
  - [ ] Android (prioridade)
  - [ ] iOS (futuro)
  - [ ] Upload de legendas via câmera/arquivos
  - [ ] Tradução offline (modelo local?)
- [ ] **Monetização no app:**
  - [ ] In-app purchases
  - [ ] Ads (AdMob)
  - [ ] Versão Pro

---

## 🔐 FASE 7: PRIVACIDADE E LICENCIAMENTO

### 7.1 Código Aberto vs Fechado
- [ ] **Decisão estratégica:**
  - [ ] Manter open source para crescimento orgânico?
  - [ ] Fechar código para proteger monetização?
  - [ ] Modelo híbrido: core open source, features premium fechadas?
- [ ] **Se fechar:**
  - [ ] Tornar repositório privado
  - [ ] Remover código sensível do histórico git
  - [ ] Criar versão "community edition" limitada

### 7.2 Termos de Uso e Privacidade
- [ ] **Criar Termos de Uso**
- [ ] **Criar Política de Privacidade** (LGPD/GDPR)
- [ ] **Cookies consent banner**
- [ ] **DMCA policy** (para legendas compartilhadas)

---

## 🔧 IDEIAS TÉCNICAS ADICIONAIS (do Copilot)

### Parsers e Formatos
- [ ] **Biblioteca de parsing:**
  - [ ] Avaliar: `subsrt`, `subtitle.js`, `subtitles-parser`
  - [ ] Criar abstração para adicionar novos formatos facilmente
  - [ ] Testes unitários para cada formato
- [ ] **Conversor de formatos:**
  - [ ] Permitir usuário converter SRT ↔ VTT ↔ ASS
  - [ ] Feature bônus além da tradução
  - [ ] Útil para compatibilidade

### Melhorias de Performance
- [ ] **Implementar cache Redis:**
  - [ ] Cache de traduções frequentes
  - [ ] Cache de contexto do TMDb
  - [ ] Reduzir chamadas de API duplicadas
- [ ] **WebSockets para progresso em tempo real:**
  - [ ] Substituir polling por WebSocket
  - [ ] Feedback mais responsivo
- [ ] **Service Worker:**
  - [ ] PWA (Progressive Web App)
  - [ ] Funcionar offline (cache de traduções)
  - [ ] Instalável no mobile/desktop

### Qualidade da Tradução
- [ ] **Fine-tuning de modelo:**
  - [ ] Treinar modelo customizado com legendas
  - [ ] Melhorar qualidade específica para subtítulos
- [ ] **Pós-processamento:**
  - [ ] Corretor ortográfico
  - [ ] Validação de timestamps
  - [ ] Detecção de inconsistências
- [ ] **Feedback do usuário:**
  - [ ] Sistema de rating (👍👎)
  - [ ] Reportar erros de tradução
  - [ ] Sugestões de correção
  - [ ] Machine learning com feedback

### Analytics e Monitoramento
- [ ] **Google Analytics 4**
- [ ] **Sentry** (error tracking)
- [ ] **LogRocket** (session replay)
- [ ] **Métricas customizadas:**
  - [ ] Tempo médio de tradução
  - [ ] Taxa de erro
  - [ ] Idiomas mais usados
  - [ ] Programas mais traduzidos

### SEO e Marketing
- [ ] **Otimização SEO:**
  - [ ] Meta tags otimizadas
  - [ ] Sitemap.xml
  - [ ] robots.txt
  - [ ] Schema.org markup
- [ ] **Blog integrado:**
  - [ ] Tutoriais de uso
  - [ ] Dicas de tradução
  - [ ] Novidades e updates
- [ ] **Social Media:**
  - [ ] Twitter/X bot (compartilhar traduções anônimas)
  - [ ] Reddit marketing
  - [ ] Instagram showcase

### Acessibilidade
- [ ] **WCAG 2.1 compliance:**
  - [ ] Navegação por teclado
  - [ ] Screen reader friendly
  - [ ] Contraste adequado
  - [ ] ARIA labels
- [ ] **Legendas descritivas:**
  - [ ] Suporte para SDH (legendas para surdos)
  - [ ] Descrição de sons e música

---

## 🎨 IDEIAS DE DESIGN E UX

### Interface
- [ ] **Redesign moderno:**
  - [ ] Glassmorphism ou Neumorphism
  - [ ] Animações suaves (Framer Motion)
  - [ ] Drag & drop aprimorado
- [ ] **Dashboard do usuário:**
  - [ ] Histórico de traduções
  - [ ] Estatísticas pessoais
  - [ ] Configurações salvas
- [ ] **Preview da legenda:**
  - [ ] Visualizar antes de traduzir
  - [ ] Player integrado (pré-visualização)
  - [ ] Edição manual pós-tradução

### Experiência do Usuário
- [ ] **File System Access API (Navegadores modernos):**
  - [ ] Pedir permissão para pasta uma vez
  - [ ] Salvar todas as traduções automaticamente
  - [ ] Experiência próxima de app desktop
  - [ ] Mostrar badge "Suportado no seu navegador" se disponível
- [ ] **Onboarding:**
  - [ ] Tour guiado para novos usuários
  - [ ] Tooltips interativos
  - [ ] Vídeo tutorial
  - [ ] Explicar File System Access API se disponível
- [ ] **Gamificação:**
  - [ ] Conquistas (achievements)
  - [ ] Leaderboard de tradutores
  - [ ] XP e níveis
- [ ] **Notificações:**
  - [ ] Email quando tradução concluir
  - [ ] Push notifications (PWA)
  - [ ] Webhook para integração externa

---

## 📅 CRONOGRAMA SUGERIDO

### Curto Prazo (1-2 semanas)
1. ✅ Criar ROADMAP.md e CHANGELOG.md
2. [ ] Refatorar route.ts em módulos
3. [ ] Implementar rate limiting preventivo
4. [ ] Integração básica com TMDb

### Médio Prazo (1-2 meses)
1. [ ] Sistema de upload múltiplo
2. [ ] Internacionalização (3 idiomas)
3. [ ] Suporte multi-idioma de tradução
4. [ ] Implementar anúncios e Buy Me a Coffee
5. [ ] Cálculo de custos e modelo freemium

### Longo Prazo (3-6 meses)
1. [ ] Sistema de pagamentos e autenticação
2. [ ] Integração com OpenSubtitles
3. [ ] App mobile (Android)
4. [ ] Extensão para navegador
5. [ ] Marketing e growth hacking

---

## 💡 DECISÕES PENDENTES

1. ✅ ~~**Nome do projeto:**~~ **LegendAI** (Decidido em 19/12/2025)
   - URL: https://uselegendai.vercel.app
   - GitHub: https://github.com/TiagoStryke/LegendAI
2. **Licença:** MIT (open source) ou Proprietária (fechado)?
3. **Modelo de IA pago:** GPT-4, Claude 3, ou continuar com Gemini?
4. **Gateway de pagamento:** Stripe, Mercado Pago ou ambos?
5. **Hosting do backend:** Continuar Vercel ou migrar para AWS/GCP?
6. **Download múltiplo:** File System Access API (moderno), ZIP (universal), ou ambos?
7. **Formatos prioritários:** Focar em SRT+VTT primeiro, ou implementar todos de uma vez?

### 📝 Sobre File System Access API

**O que é?**
- API do navegador que permite salvar arquivos em pastas escolhidas pelo usuário
- Usuário escolhe uma pasta UMA VEZ, app pode salvar múltiplos arquivos lá
- Experiência muito próxima de um app desktop

**Compatibilidade:**
- ✅ Chrome 86+ (2020)
- ✅ Edge 86+
- ✅ Opera 72+
- ❌ Firefox (ainda não suporta)
- ❌ Safari (ainda não suporta)
- ✅ ~70% dos usuários globalmente

**Exemplo de uso:**
```javascript
// Usuário escolhe pasta
const dirHandle = await window.showDirectoryPicker();

// App salva múltiplos arquivos
for (const file of translatedFiles) {
  const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file.content);
  await writable.close();
}
```

**Vantagens:**
- 🎯 Melhor UX possível (sem cliques extras)
- 📁 Salva na pasta que o usuário quer
- 🚀 Rápido (não precisa criar ZIP)
- 💾 Mantém nomes originais

**Desvantagens:**
- ⚠️ Não funciona em Firefox/Safari
- 🔒 Requer permissão do usuário
- 📱 Não funciona em mobile

**Recomendação:**
- Implementar File System Access API como OPÇÃO 1
- Detectar se navegador suporta
- Fallback para ZIP se não suportar
- No app desktop (Electron): acesso direto sem restrições

---

## 📝 NOTAS

- **Prioridade:** Foco em organização e refatoração antes de adicionar features
- **Qualidade > Quantidade:** Testar bem cada feature antes de lançar
- **Monetização ética:** Manter tier gratuito acessível e funcional
- **Comunidade:** Se manter open source, incentivar contribuições
- **Documentação:** Manter CHANGELOG e README sempre atualizados

---

**Próxima ação:** Criar branch `feature/code-organization` e começar refatoração do route.ts
