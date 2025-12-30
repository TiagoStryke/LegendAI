# 🔄 Plano de Atualização de Dependências

**Projeto:** LegendAI  
**Data:** 19 de dezembro de 2025  
**Status:** ANÁLISE - NÃO APLICAR AINDA

---

## 📊 Atualizações Disponíveis

### 🚨 Atualizações Críticas (Breaking Changes)

#### 1. Next.js: 14.0.4 → 16.1.0 (MAJOR)
- **Diferença:** 2 major versions (+)
- **Breaking Changes:**
  - Next.js 15 migrou para React 19
  - Turbopack agora é padrão (antes era Webpack)
  - Mudanças no sistema de cache
  - `next/image` teve alterações
  - Remoção de algumas APIs deprecated
- **Ação Recomendada:**
  - ⚠️ **NÃO ATUALIZAR IMEDIATAMENTE**
  - Testar em branch separada primeiro
  - Seguir guia oficial: https://nextjs.org/docs/app/building-your-application/upgrading
  - Possível necessidade de ajustes no código

#### 2. React + React-DOM: 18 → 19 (MAJOR)
- **Diferença:** 1 major version (+)
- **Breaking Changes:**
  - Novos React hooks
  - Mudanças no strict mode
  - Server Components melhorados
  - Possível incompatibilidade com algumas bibliotecas
- **Ação Recomendada:**
  - ⚠️ **ATUALIZAR JUNTO COM NEXT.JS 16**
  - Next.js 16 requer React 19
  - Testar todos os componentes após atualização

#### 3. @ai-sdk/google: 1.0.12 → 2.0.49 (MAJOR)
- **Diferença:** 1 major version (+)
- **Breaking Changes:**
  - Possíveis mudanças na API
  - Novos métodos/parâmetros
  - Compatibilidade com `ai` 5.x
- **Ação Recomendada:**
  - ⚠️ **VERIFICAR BREAKING CHANGES**
  - Ler changelog: https://www.npmjs.com/package/@ai-sdk/google
  - Atualizar junto com `ai` package

#### 4. ai: 4.0.22 → 5.0.115 (MAJOR)
- **Diferença:** 1 major version (+)
- **Breaking Changes:**
  - SDK do Vercel AI teve mudanças significativas
  - Novos métodos de streaming
  - Possível mudança na API de streaming
- **Ação Recomendada:**
  - ⚠️ **TESTAR CUIDADOSAMENTE**
  - Verificar se streaming SSE continua funcionando
  - Atualizar junto com @ai-sdk/google

#### 5. Tailwind CSS: 3.3.0 → 4.1.18 (MAJOR)
- **Diferença:** 1 major version (+)
- **Breaking Changes:**
  - Tailwind v4 reescrito em Rust (performance)
  - Mudanças na configuração (config unificado)
  - Algumas classes podem ter mudado
  - Possível necessidade de ajustar tailwind.config.ts
- **Ação Recomendada:**
  - ⚠️ **TESTAR TODOS OS ESTILOS**
  - Guia de migração: https://tailwindcss.com/docs/upgrade-guide
  - Verificar se tema claro/escuro continua funcionando

---

### ✅ Atualizações Menores (Safe)

#### 1. @types/node: 20 → 25
- **Tipo:** TypeScript definitions
- **Risco:** 🟢 BAIXO
- **Ação:** Pode atualizar

#### 2. @types/react: 18 → 19
- **Tipo:** TypeScript definitions
- **Risco:** 🟡 MÉDIO (aguardar atualizar React primeiro)
- **Ação:** Atualizar junto com React 19

#### 3. @types/react-dom: 18 → 19
- **Tipo:** TypeScript definitions
- **Risco:** 🟡 MÉDIO (aguardar atualizar React primeiro)
- **Ação:** Atualizar junto com React-DOM 19

#### 4. autoprefixer: 10.0.1 → 10.4.23
- **Tipo:** CSS PostCSS plugin
- **Risco:** 🟢 BAIXO
- **Ação:** ✅ PODE ATUALIZAR AGORA

#### 5. eventsource-parser: 1.1.1 → 3.0.6 (MAJOR)
- **Tipo:** SSE parsing
- **Risco:** 🟡 MÉDIO (usado para streaming)
- **Ação:** Testar se streaming continua funcionando

#### 6. tiktoken: 1.0.12 → 1.0.22
- **Tipo:** Token counting
- **Risco:** 🟢 BAIXO (patch version)
- **Ação:** ✅ PODE ATUALIZAR AGORA

#### 7. openai: 4.77.0 → 6.14.0 (MAJOR)
- **Tipo:** OpenAI SDK
- **Risco:** 🟢 BAIXO (não usado diretamente, apenas dependência)
- **Ação:** Verificar se @ai-sdk precisa

#### 8. humanloop: 0.5.36 → 0.8.20
- **Tipo:** AI observability
- **Risco:** 🟢 BAIXO (não usado diretamente?)
- **Ação:** Verificar se está sendo usado, se não, remover

---

## 🎯 Estratégia de Atualização Recomendada

### FASE 1: Atualizações Seguras (AGORA)
```bash
# Criar branch para atualizações
cd /Users/user/Documents/legendai
git checkout -b chore/update-dependencies-safe

# Atualizar apenas patches e minors seguros
npx npm-check-updates -u autoprefixer tiktoken

# Instalar e testar
npm install
npm run dev

# Se tudo funcionar:
git add package.json package-lock.json
git commit -m "chore: update safe dependencies (autoprefixer, tiktoken)"
```

### FASE 2: Verificar Dependências Não Utilizadas
```bash
# Verificar se humanloop é usado
grep -r "humanloop" app/ components/ lib/

# Se NÃO for usado, remover:
npm uninstall humanloop

# Commit
git commit -m "chore: remove unused dependency (humanloop)"
```

### FASE 3: Preparar para MAJOR updates (DEPOIS DA REFATORAÇÃO)
**⚠️ IMPORTANTE: Fazer isso APÓS refatorar route.ts em módulos**

1. **Criar branch de teste:**
```bash
git checkout -b test/next-16-react-19
```

2. **Backup do código:**
```bash
git tag v0.2.0-pre-upgrade
```

3. **Atualizar gradualmente:**
```bash
# Primeiro: Atualizar Next.js e React
npx npm-check-updates -u next react react-dom @types/react @types/react-dom @types/node

# Instalar
npm install

# Testar EXTENSIVAMENTE
npm run dev
npm run build
```

4. **Se funcionar, atualizar AI SDK:**
```bash
npx npm-check-updates -u @ai-sdk/google ai eventsource-parser

npm install
# Testar streaming
```

5. **Por último, Tailwind v4:**
```bash
npx npm-check-updates -u tailwindcss

npm install
# Testar TODOS os estilos
# Verificar tema claro/escuro
```

### FASE 4: Documentar e Merge
```bash
# Se tudo funcionar perfeitamente:
git add .
git commit -m "chore: upgrade to Next.js 16, React 19, Tailwind 4, and latest AI SDK

BREAKING CHANGES:
- Next.js 14 → 16
- React 18 → 19
- Tailwind 3 → 4
- @ai-sdk/google 1.x → 2.x
- ai 4.x → 5.x

All features tested and working correctly."

git checkout main
git merge test/next-16-react-19
git push
```

---

## ⚠️ AVISOS IMPORTANTES

### ❌ NÃO FAÇA AGORA:
1. **NÃO atualizar Next.js/React antes de refatorar** route.ts
   - Se algo quebrar, será MUITO mais difícil debugar
   - Refatore primeiro, depois atualize

2. **NÃO atualizar tudo de uma vez**
   - Atualizações graduais facilitam identificar problemas
   - Se algo quebrar, você saberá qual pacote causou

3. **NÃO pular testes**
   - Testar localmente com `npm run dev`
   - Testar build de produção com `npm run build`
   - Testar deploy no Vercel (preview branch)

### ✅ FAÇA:
1. **Criar tags/backups antes de atualizar**
2. **Ler changelogs dos pacotes MAJOR**
3. **Testar em branch separada**
4. **Deploy em preview do Vercel antes do prod**
5. **Manter README e CHANGELOG atualizados**

---

## 🔗 Links Úteis

### Documentação de Migração:
- [Next.js 14 → 15](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)
- [Next.js 15 → 16](https://nextjs.org/blog/next-16) (quando disponível)
- [React 19 Upgrade](https://react.dev/blog/2024/12/05/react-19)
- [Tailwind v4 Upgrade](https://tailwindcss.com/docs/upgrade-guide)
- [@ai-sdk Changelog](https://www.npmjs.com/package/@ai-sdk/google?activeTab=versions)

### Ferramentas de Teste:
```bash
# Verificar dependências não usadas
npx depcheck

# Verificar vulnerabilidades
npm audit

# Verificar licenças
npx license-checker
```

---

## 📦 Novas Dependências para Considerar

### Para Cache (Integração TMDb)
```bash
# LRU Cache (em memória)
npm install lru-cache

# OU Redis (produção/escalabilidade)
npm install @upstash/redis  # Serverless-friendly

# OU Supabase (se já usar para autenticação)
# Já vem com PostgreSQL para cache persistente
```

### Para Rate Limiting Distribuído
```bash
# Upstash Rate Limit (serverless)
npm install @upstash/ratelimit
```

### Decisão:
- **Início:** `lru-cache` (simples, funciona em serverless)
- **Produção (>100 usuários):** Migrar para `@upstash/redis`
- **Longo prazo:** Supabase PostgreSQL (cache + DB em um só)

---

## 📝 Checklist de Atualização

Quando for atualizar, siga este checklist:

- [ ] Backup do código (git tag)
- [ ] Criar branch de teste
- [ ] Ler changelogs de BREAKING CHANGES
- [ ] Atualizar package.json
- [ ] `npm install`
- [ ] `npm run dev` - Funciona?
- [ ] Testar upload de arquivo SRT
- [ ] Testar tradução completa
- [ ] Testar retry em erro de quota
- [ ] Testar tema claro/escuro
- [ ] Testar progresso em tempo real
- [ ] Testar download do arquivo traduzido
- [ ] `npm run build` - Build ok?
- [ ] Deploy preview no Vercel
- [ ] Testar em produção (preview)
- [ ] Verificar logs de erro (Vercel)
- [ ] Se tudo OK: merge para main
- [ ] Atualizar CHANGELOG.md
- [ ] Criar release tag (ex: v0.3.0)

---

**Próxima ação:** Aguardar refatoração de código antes de atualizar dependências MAJOR
