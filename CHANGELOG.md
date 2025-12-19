# Changelog - LegendAI

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [0.2.0] - 2025-12-19

### Alterado
- 🏷️ **Rebranding para LegendAI** (anteriormente SRT-PT-AI)
  - Novo nome do projeto: LegendAI
  - Novo domínio: https://uselegendai.vercel.app
  - Novo repositório: https://github.com/TiagoStryke/LegendAI
  - Reflete melhor a visão do projeto: suporte multi-idioma e múltiplos formatos

### Adicionado
- ✨ **Extração inteligente de contexto do nome do arquivo** (commit: 05b0442)
  - Detecta automaticamente se é série ou filme
  - Reconhece padrões: S01E01, 1x01, 2025, etc.
  - Envia contexto para a IA melhorar qualidade da tradução
  - Exemplo: "Survivor.S47.E13.srt" → IA sabe que é Survivor temporada 47, episódio 13
- 📚 **README.md abrangente** com toda a documentação do projeto (commit: 4cb7309)
  - Badges de status
  - Instruções de instalação e uso
  - Arquitetura e fluxo de dados
  - Troubleshooting
  - Guia de contribuição
  - Roadmap inicial

### Corrigido
- 🐛 **Erro crítico de deploy na Vercel: "Missing tiktoken_bg.wasm"** (commit: a882f9d)
  - Adicionado `experimental.outputFileTracingIncludes` no next.config.js
  - Configurado `functions.includeFiles` no vercel.json
  - Deploy serverless agora inclui arquivos WASM do tiktoken
- 🔧 **Configuração de ambiente e .gitignore** (commit: c0dc283)
  - Adicionado .env.vercel ao .gitignore
  - Melhorada configuração de variáveis de ambiente

### Removido
- 🗑️ **Limpeza da estrutura do projeto** (commit: 4cb7309)
  - Removidas pastas vazias: `app/test/` e `app/api/test/`
  - Removidos arquivos SVG não utilizados: `next.svg` e `vercel.svg`

### Alterado
- ⚙️ **Simplificação do vercel.json** (commit: 5240438)
  - Configuração otimizada e mais limpa
  - Headers CORS configurados corretamente
- 🚀 **Removida configuração de export estático** (commit: 802b741)
  - Habilitadas rotas de API no Vercel
  - Corrigida incompatibilidade com Next.js serverless

---

## [0.1.0] - 2025-06-12 (Release de Produção Inicial)

### Adicionado
- 🎉 **Primeira versão completa do SRT-PT-AI** (commit: 294fb70)
- 💬 **Formatação inteligente de diálogos** (commit: a731c57)
  - Detecta automaticamente diálogos (linhas começando com "-")
  - Preserva formatação correta em português
  - Diferencia entre diálogos e palavras compostas (ex: "sub-20")
- 🌐 **Interface de usuário consistente em português brasileiro** (commit: 3d180e9)
  - Todos os textos da interface traduzidos
  - Crédito ao desenvolvedor no footer
- 🎨 **Sistema de tema claro/escuro** (commit: 1d69e61)
  - Toggle repositionado no canto superior direito
  - Persistência da preferência do usuário
- 📊 **Barra de progresso detalhada** com status em tempo real
  - Mostra chunk atual e total
  - Estimativa de tempo restante
  - Porcentagem de conclusão
- 🔄 **Sistema de retry automático para erros de API**
  - Detecta erros de quota/rate limit
  - Aguarda automaticamente antes de tentar novamente
  - Até 3 tentativas por chunk com backoff exponencial
- 📥 **Upload de arquivos SRT via drag & drop**
- 📤 **Download automático da legenda traduzida**
  - Nome do arquivo preservado com sufixo "-translated"
  - Formato SRT válido mantido
- 🔑 **Suporte para API key customizada**
  - Usuário pode usar sua própria chave do Google AI
  - API key armazenada localmente (não enviada para servidor)
- 🎯 **Processamento em chunks inteligente**
  - Divide legendas longas em grupos de ~400 tokens
  - Mantém integridade das legendas (não corta no meio)
  - Streaming de resultados chunk por chunk

### Melhorado
- 🧹 **Código de produção limpo** (commit: 72dea8c)
  - Removidos todos os console.log statements
  - Código otimizado e organizado
- 🔧 **Lógica de estado do botão de tradução** (commit: c13b7b3)
  - Previne múltiplos cliques durante tradução
  - Feedback visual claro do estado
- 🗑️ **Limpeza de estado ao iniciar nova tradução** (commit: 7a3be28)
  - Arquivo selecionado é limpo corretamente
  - Estado resetado para nova operação

### Técnico
- ⚙️ **Stack tecnológica:**
  - Next.js 14.0.4 (App Router)
  - React 18
  - TypeScript
  - Tailwind CSS
  - @ai-sdk/google para integração com Gemini
  - tiktoken para contagem de tokens
- 🌐 **Deploy:**
  - Vercel (produção)
  - Render (alternativo)
- 🤖 **IA:**
  - Google Gemini 1.5 Flash
  - Streaming de respostas (SSE)
  - Limite: 10 requisições/minuto

---

## [0.0.1] - 2025-06-06 (Primeira Versão)

### Adicionado
- 🎬 **Primeira versão funcional do tradutor de legendas** (commit: 3384955)
  - Tradução básica de SRT para português brasileiro
  - Interface web simples
  - Integração com Google Gemini API
- 📝 **Configuração inicial do projeto:**
  - Next.js com TypeScript
  - Tailwind CSS
  - Estrutura de pastas básica
- 🔒 **.gitignore abrangente** (commit: ab99e53, 3c13f8a)
  - Exclusões de build, IDE, OS
  - Proteção de variáveis de ambiente

---

## Roadmap (Futuro)

Veja [ROADMAP.md](./ROADMAP.md) para planos futuros e features planejadas.

### Próximas Versões Planejadas

#### [0.3.0] - Em Planejamento
- 🎬 **Integração com TMDb** para contexto de filmes/séries
- 🚦 **Rate limiting preventivo** (não mais reativo)
- 🔄 **Manutenção de contexto entre chunks**
- 🧩 **Refatoração do código** (dividir route.ts em módulos)

#### [0.4.0] - Em Planejamento
- 🌍 **Internacionalização do site** (inglês, espanhol)
- 🗣️ **Suporte a múltiplos idiomas** (não só PT-BR)
- 📦 **Upload múltiplo de arquivos**

#### [1.0.0] - Em Planejamento
- 💰 **Modelo freemium com pagamentos**
- 🔐 **Sistema de autenticação**
- 📱 **App mobile** (Android/iOS)
- 🎨 **Redesign completo da interface**

---

## Tipos de Mudanças

- `Adicionado` - novas funcionalidades
- `Alterado` - mudanças em funcionalidades existentes
- `Obsoleto` - funcionalidades que serão removidas
- `Removido` - funcionalidades removidas
- `Corrigido` - correções de bugs
- `Segurança` - vulnerabilidades corrigidas

---

**Data deste CHANGELOG:** 18 de dezembro de 2025
