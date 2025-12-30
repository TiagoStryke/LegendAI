#!/usr/bin/env python3
"""
Script para criar GitHub Issues automaticamente a partir do ROADMAP.md
Uso: python3 .github/scripts/create-issues-from-roadmap.py
"""

import re
import subprocess
import sys
from pathlib import Path

ROADMAP_FILE = Path("docs/ROADMAP.md")
REPO = "TiagoStryke/LegendAI"

# Mapeamento de prioridade → label + milestone
PRIORITY_CONFIG = {
    "CRÍTICA": {
        "label": "🔥 crítico",
        "milestone": "SPRINT 1 - Crítico"
    },
    "ALTA": {
        "label": "🔴 alta prioridade",
        "milestone": "SPRINT 2 - Alta Prioridade"
    },
    "MÉDIA": {
        "label": "🟠 média prioridade",
        "milestone": "SPRINT 3 - Média Prioridade"
    },
    "BAIXA": {
        "label": "🟡 baixa prioridade",
        "milestone": "SPRINT 4 - Features Adicionais"
    },
}

def run_gh_command(args):
    """Executa comando gh e retorna output"""
    try:
        result = subprocess.run(
            ["gh"] + args,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"❌ Erro ao executar gh {' '.join(args)}: {e.stderr}")
        return None

def parse_roadmap():
    """Parser do ROADMAP.md para extrair tasks"""
    if not ROADMAP_FILE.exists():
        print(f"❌ Arquivo {ROADMAP_FILE} não encontrado!")
        sys.exit(1)
    
    content = ROADMAP_FILE.read_text()
    
    tasks = []
    current_priority = None
    current_section = None
    current_task = None
    
    lines = content.split('\n')
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Detectar seção de prioridade
        if "## 🔥 PRIORIDADE CRÍTICA" in line:
            current_priority = "CRÍTICA"
        elif "## 🔴 PRIORIDADE ALTA" in line:
            current_priority = "ALTA"
        elif "## 🟠 PRIORIDADE MÉDIA" in line:
            current_priority = "MÉDIA"
        elif "## 🟡 PRIORIDADE BAIXA" in line:
            current_priority = "BAIXA"
        
        # Detectar início de tarefa (### Título)
        if line.startswith("### ") and current_priority:
            # Salvar task anterior se existir
            if current_task:
                tasks.append(current_task)
            
            # Nova task
            title = line.replace("###", "").strip()
            title = re.sub(r'^\d+\.\s*', '', title)  # Remove numeração
            
            current_task = {
                "title": title,
                "priority": current_priority,
                "body": "",
                "checklist": []
            }
        
        # Coletar corpo da task
        elif current_task and line and not line.startswith("#"):
            # Detectar checklist
            if line.startswith("- [ ]"):
                checklist_item = line.replace("- [ ]", "").strip()
                current_task["checklist"].append(checklist_item)
            elif not line.startswith("**"):
                current_task["body"] += line + "\n"
        
        i += 1
    
    # Adicionar última task
    if current_task:
        tasks.append(current_task)
    
    return tasks

def create_issue(task):
    """Cria uma issue no GitHub"""
    config = PRIORITY_CONFIG.get(task["priority"])
    if not config:
        print(f"⚠️ Prioridade desconhecida: {task['priority']}")
        return
    
    # Montar corpo da issue
    body = task["body"].strip()
    
    if task["checklist"]:
        body += "\n\n## ✅ Checklist\n\n"
        for item in task["checklist"]:
            body += f"- [ ] {item}\n"
    
    body += f"\n\n---\n\n_Issue criada automaticamente a partir do [ROADMAP.md](../blob/main/docs/ROADMAP.md)_"
    
    # Criar issue
    print(f"📝 Criando issue: {task['title']}")
    
    cmd = [
        "issue", "create",
        "--repo", REPO,
        "--title", task["title"],
        "--body", body,
        "--label", config["label"],
        "--milestone", config["milestone"]
    ]
    
    result = run_gh_command(cmd)
    if result:
        print(f"✅ Issue criada: {result}")
    else:
        print(f"❌ Falha ao criar issue: {task['title']}")

def main():
    print("🚀 Criando issues a partir do ROADMAP.md...")
    print()
    
    # Verificar se gh está instalado e autenticado
    if not run_gh_command(["auth", "status"]):
        print("❌ GitHub CLI não está autenticado. Execute: gh auth login")
        sys.exit(1)
    
    # Parser ROADMAP
    print("📖 Lendo ROADMAP.md...")
    tasks = parse_roadmap()
    print(f"✅ Encontradas {len(tasks)} tarefas")
    print()
    
    # Perguntar confirmação
    print("📋 Tarefas que serão criadas:")
    for task in tasks[:10]:  # Mostrar apenas as 10 primeiras
        print(f"  - [{task['priority']}] {task['title']}")
    
    if len(tasks) > 10:
        print(f"  ... e mais {len(tasks) - 10} tarefas")
    
    print()
    response = input("🤔 Deseja criar todas essas issues? (s/N): ")
    
    if response.lower() != 's':
        print("❌ Operação cancelada")
        sys.exit(0)
    
    # Criar issues
    print()
    for task in tasks:
        create_issue(task)
        print()
    
    print("✅ Todas as issues foram criadas!")
    print(f"🔗 Ver issues: https://github.com/{REPO}/issues")

if __name__ == "__main__":
    main()
