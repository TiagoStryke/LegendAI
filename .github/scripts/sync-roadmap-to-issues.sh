#!/bin/bash
# Script para sincronizar ROADMAP.md com GitHub Issues
# Uso: ./sync-roadmap-to-issues.sh

set -e

ROADMAP_FILE="docs/ROADMAP.md"
REPO="TiagoStryke/LegendAI"

echo "🚀 Sincronizando ROADMAP com GitHub Issues..."

# Labels que usaremos
LABELS=(
  "🔥 crítico"
  "🔴 alta prioridade"
  "🟠 média prioridade"
  "🟡 baixa prioridade"
  "💰 monetização"
  "📱 expansão"
  "🔧 técnico"
  "📈 marketing"
)

# Criar labels se não existirem
echo "📋 Criando labels..."
for label in "${LABELS[@]}"; do
  gh label create "$label" --repo "$REPO" 2>/dev/null || true
done

# Criar milestones
echo "🎯 Criando milestones..."
gh api repos/$REPO/milestones -f title="SPRINT 1 - Crítico" -f description="Resolver timeout + validação + refatoração" -f due_on="2025-01-05T00:00:00Z" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="SPRINT 2 - Alta Prioridade" -f description="Rate limiting + TMDb" -f due_on="2025-01-12T00:00:00Z" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="SPRINT 3 - Média Prioridade" -f description="Múltiplos formatos + Upload múltiplo" -f due_on="2025-01-26T00:00:00Z" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="SPRINT 4 - Features Adicionais" -f description="i18n + Multi-idioma" -f due_on="2025-02-09T00:00:00Z" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="SPRINT 5+ - Monetização" -f description="Autenticação + Pagamentos" -f due_on="2025-03-23T00:00:00Z" 2>/dev/null || true

echo "✅ Setup completo!"
echo ""
echo "🎯 Próximos passos:"
echo "1. Criar issues manualmente com: gh issue create --title 'Título' --body 'Descrição' --label '🔥 crítico' --milestone 'SPRINT 1 - Crítico'"
echo "2. Ou usar extensão VSCode: GitHub Pull Requests and Issues"
echo "3. Ou acessar: https://github.com/$REPO/issues/new"
