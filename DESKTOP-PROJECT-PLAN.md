# LegendAI Desktop - Plano de Projeto Completo

## 📋 Visão Geral

**Nome do Projeto:** LegendAI Desktop  
**Objetivo:** Sistema automatizado de extração e tradução de legendas integrado com qBittorrent  
**Plataforma Alvo:** Windows 10/11 (64-bit)  
**Custo:** Zero (uso de múltiplas API keys gratuitas)

---

## 🎯 Funcionalidades Core

### 1. Monitoramento Automático

- [x] Monitora pasta de downloads do qBittorrent
- [x] Detecção automática de novos arquivos .mkv
- [x] Varredura recursiva em todas as subpastas
- [x] Detecção de conclusão de download (arquivo não está mais sendo escrito)

### 2. Extração de Legendas

- [x] Integração com FFmpeg/FFprobe
- [x] Detecção automática de legendas em inglês (eng/en)
- [x] Fallback para primeira legenda disponível se não houver inglês
- [x] Suporte para múltiplos formatos (SRT, ASS, SSA, VTT)
- [x] Conversão automática para SRT

### 3. Tradução Inteligente

- [x] Sistema de múltiplas API keys (rotação automática)
- [x] Rate limiting inteligente para evitar 429
- [x] Detecção de quota esgotada e rotação de keys
- [x] Cache de traduções (evita retraduzir mesmo arquivo)
- [x] Retry automático com backoff exponencial
- [x] Contexto de série/filme extraído do nome do arquivo

### 4. Interface e UX

- [x] System tray icon (minimizado na bandeja)
- [x] Interface gráfica para configuração
- [x] Dashboard mostrando:
  - Arquivos sendo processados
  - Progresso de cada tradução
  - Estatísticas (total traduzido, erros, etc)
  - Status das API keys
- [x] Notificações do sistema Windows
- [x] Logs detalhados com níveis (info, warning, error)

### 5. Configuração e Persistência

- [x] Wizard de primeira execução
- [x] Configuração de pasta(s) monitorada(s)
- [x] Gerenciamento de API keys
- [x] Seleção de idioma de origem/destino
- [x] Configurações de comportamento (auto-start, notificações, etc)
- [x] Banco de dados local (SQLite) para:
  - Histórico de traduções
  - Cache de resultados
  - Configurações
  - Estado da aplicação

### 6. Automação e Resiliência

- [x] Inicia automaticamente com Windows
- [x] Retoma trabalho interrompido após reinicialização
- [x] Fila de processamento persistente
- [x] Tratamento robusto de erros
- [x] Watchdog para auto-recovery
- [x] Limite de tentativas por arquivo

---

## 🏗️ Arquitetura Técnica

### Stack Tecnológica

**Framework:** Electron + React + TypeScript

- ✅ Cross-platform (facilita desenvolvimento no Mac)
- ✅ Reutiliza conhecimento do projeto web
- ✅ UI rica com React
- ✅ Acesso a APIs nativas do Node.js
- ✅ Fácil distribuição (electron-builder)

**Alternativas consideradas:**

- ❌ Tauri (menos maduro, menos recursos)
- ❌ .NET/WPF (não funciona no Mac para dev)
- ❌ Python + PyQt (empacotamento complexo)

### Bibliotecas Principais

```json
{
	"core": {
		"electron": "^28.0.0",
		"react": "^18.2.0",
		"typescript": "^5.3.0"
	},
	"ui": {
		"tailwindcss": "^3.4.0",
		"@headlessui/react": "^1.7.0",
		"lucide-react": "^0.300.0"
	},
	"backend": {
		"chokidar": "^3.5.3", // File watching
		"better-sqlite3": "^9.2.0", // Database
		"fluent-ffmpeg": "^2.1.2", // FFmpeg wrapper
		"@ai-sdk/google": "^0.0.x", // Gemini API
		"ai": "^3.x" // AI SDK
	},
	"utilities": {
		"date-fns": "^3.0.0",
		"zod": "^3.22.0", // Validation
		"winston": "^3.11.0" // Logging
	}
}
```

### Estrutura de Diretórios

```
legendai-desktop/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Entry point
│   │   ├── ipc/           # IPC handlers
│   │   ├── services/      # Core services
│   │   │   ├── FileWatcher.ts
│   │   │   ├── SubtitleExtractor.ts
│   │   │   ├── TranslationEngine.ts
│   │   │   ├── KeyManager.ts
│   │   │   └── Database.ts
│   │   ├── utils/
│   │   └── config/
│   │
│   ├── renderer/          # React app
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── History.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   │
│   ├── shared/            # Código compartilhado
│   │   ├── types.ts
│   │   └── constants.ts
│   │
│   └── preload/           # Preload script
│       └── index.ts
│
├── resources/            # Assets e binários
│   ├── icons/
│   └── ffmpeg/          # FFmpeg binaries (Windows)
│
├── docs/                # Documentação
│   ├── SETUP.md
│   ├── API.md
│   └── CONTRIBUTING.md
│
├── scripts/             # Build scripts
│   ├── build.js
│   └── package.js
│
└── tests/
    ├── unit/
    └── integration/
```

---

## 🔄 Fluxo de Funcionamento

### 1. Inicialização

```
Windows Start
    ↓
Auto-start registry entry
    ↓
Electron App Launch
    ↓
Load Config from DB
    ↓
Initialize Services:
    - File Watcher
    - Translation Engine
    - Database
    - Key Manager
    ↓
Show Tray Icon
    ↓
Start Monitoring
```

### 2. Detecção de Arquivo

```
File System Event (new .mkv)
    ↓
Wait for file stability (não está sendo escrito)
    ↓
Check DB: Already processed?
    ├─ Yes → Skip
    └─ No  → Add to queue
        ↓
    Notify user (Windows toast)
```

### 3. Processamento

```
Dequeue file
    ↓
Extract Subtitle:
    - Run ffprobe (detect streams)
    - Find English subtitle
    - Extract with ffmpeg
    - Convert to SRT if needed
    ↓
Check if extraction successful
    ├─ No  → Log error, notify, mark failed
    └─ Yes → Continue
        ↓
Translate:
    - Load available API keys
    - Group segments
    - Translate with rate limiting
    - Handle quota errors
    - Retry with next key
    ↓
Save translated SRT
    ↓
Update DB (mark complete)
    ↓
Notify user (success)
```

### 4. Gerenciamento de Keys

```
Before Translation Request:
    ↓
Check key availability
    ├─ Key in cooldown? → Skip
    └─ Key available? → Use
        ↓
    Apply rate limiting (wait if needed)
        ↓
    Make request
        ↓
    Handle response:
        ├─ 429 Error → Mark key, try next
        ├─ Quota Error → Cooldown 5min
        └─ Success → Update stats
```

---

## 🎨 Interface do Usuário

### System Tray Menu

```
🔥 LegendAI
├─ 📊 Dashboard
├─ ⚙️  Settings
├─ 📜 History
├─ ─────────────
├─ ▶️  Start Monitoring
├─ ⏸️  Pause Monitoring
├─ ─────────────
├─ ℹ️  About
└─ ❌ Quit
```

### Dashboard (Janela Principal)

```
┌─────────────────────────────────────────┐
│  🔥 LegendAI Desktop              [_][□][X]│
├─────────────────────────────────────────┤
│                                         │
│  Status: ● Monitoring                  │
│  Watching: C:\Downloads\Torrents       │
│                                         │
│  ┌─── Current Tasks ──────────────┐   │
│  │                                 │   │
│  │  📁 Breaking.Bad.S05E01.mkv    │   │
│  │  ├─ 🔍 Extracting subtitle...  │   │
│  │  └─ ▓▓▓▓▓░░░░░ 45%            │   │
│  │                                 │   │
│  │  📁 The.Office.S09E23.mkv      │   │
│  │  ├─ 🔄 Translating... (chunk 5/12)│
│  │  └─ ▓▓▓▓▓▓▓░░░ 65%            │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─── Statistics ──────────────────┐   │
│  │  Total Translated: 142          │   │
│  │  Success Rate: 98.5%            │   │
│  │  API Keys Active: 3/5           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [ ⚙️  Settings ] [ 📜 History ]        │
└─────────────────────────────────────────┘
```

### Settings Page

```
┌─ General ─────────────────────────────┐
│  [x] Start with Windows               │
│  [x] Start minimized                  │
│  [x] Show notifications               │
│  [x] Close to tray (don't quit)       │
└───────────────────────────────────────┘

┌─ Folders ─────────────────────────────┐
│  Monitored Folders:                   │
│  • C:\Downloads\Torrents  [Remove]    │
│  • D:\Media\Incoming      [Remove]    │
│  [ ➕ Add Folder ]                     │
└───────────────────────────────────────┘

┌─ API Keys ────────────────────────────┐
│  Google Gemini Keys:                  │
│  • AIzaSy...uvwx (✅ Active)          │
│  • AIzaSy...yz12 (⏸️  Cooldown 3min)  │
│  • AIzaSy...34ab (✅ Active)          │
│  [ ➕ Add Key ] [ 🗑️ Remove ]         │
└───────────────────────────────────────┘

┌─ Translation ──────────────────────────┐
│  Source Language: [ English      ▼ ]  │
│  Target Language: [ Portuguese BR▼ ]  │
│  [x] Auto-detect source                │
│  [x] Cache translations                │
│  [ ] Re-translate existing             │
└────────────────────────────────────────┘

┌─ Advanced ────────────────────────────┐
│  Max concurrent tasks: [2]             │
│  Max retries per file: [3]             │
│  File stability timeout: [10s]         │
│  Log level: [ Info ▼ ]                │
└────────────────────────────────────────┘
```

---

## 🛡️ Tratamento de Erros e Resiliência

### Estratégias

1. **Quota/Rate Limit**
   - Detecção automática de 429
   - Cooldown de 5 minutos por key
   - Rotação automática para próxima key
   - Notificação se todas as keys esgotarem

2. **Falhas de Rede**
   - Retry com exponential backoff
   - Máximo 3 tentativas por requisição
   - Timeout configurável

3. **Arquivos Corrompidos**
   - Validação de .mkv antes de processar
   - Skip automático se FFprobe falhar 3x
   - Log detalhado do erro

4. **Crash/Reinicialização**
   - Estado salvo em DB a cada mudança
   - Queue persistente
   - Retoma trabalho incompleto ao iniciar
   - Cleanup de arquivos temporários

5. **Disco Cheio**
   - Verificação de espaço antes de extrair
   - Notificação ao usuário
   - Pausa automática do monitoramento

### Base de Dados Schema

```sql
-- Tabela de configurações
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Tabela de API keys
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  provider TEXT DEFAULT 'gemini',
  is_active BOOLEAN DEFAULT 1,
  last_error_at INTEGER,
  cooldown_until INTEGER,
  total_requests INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Tabela de arquivos processados
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  file_hash TEXT,
  status TEXT CHECK(status IN ('pending', 'extracting', 'translating', 'completed', 'failed')) NOT NULL,
  subtitle_path TEXT,
  translated_path TEXT,
  progress INTEGER DEFAULT 0,
  total_segments INTEGER,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Tabela de traduções (cache)
CREATE TABLE translation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT DEFAULT 'en',
  target_lang TEXT DEFAULT 'pt-BR',
  created_at INTEGER NOT NULL,
  UNIQUE(source_text, source_lang, target_lang)
);

-- Tabela de logs
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT CHECK(level IN ('debug', 'info', 'warning', 'error')) NOT NULL,
  message TEXT NOT NULL,
  file_id INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(file_id) REFERENCES files(id)
);

-- Índices
CREATE INDEX idx_files_status ON files(status);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX idx_translation_cache_lookup ON translation_cache(source_text, source_lang, target_lang);
```

---

## 🚀 Build e Distribuição

### Desenvolvimento (Mac)

```bash
# Instalar dependências
npm install

# Modo desenvolvimento
npm run dev

# Build para teste local
npm run build

# Build para Windows (no Mac)
npm run build:win
```

### Electron Builder Config

```json
{
	"appId": "com.legendai.desktop",
	"productName": "LegendAI Desktop",
	"win": {
		"target": ["nsis", "portable"],
		"icon": "resources/icon.ico"
	},
	"nsis": {
		"oneClick": false,
		"allowToChangeInstallationDirectory": true,
		"createDesktopShortcut": true,
		"createStartMenuShortcut": true,
		"shortcutName": "LegendAI",
		"runAfterFinish": true
	},
	"extraResources": [
		{
			"from": "resources/ffmpeg/win",
			"to": "ffmpeg",
			"filter": ["**/*"]
		}
	],
	"files": ["dist/**/*", "node_modules/**/*", "package.json"]
}
```

### Instalador (Windows)

- **NSIS Installer** com wizard
- Auto-start registry entry opcional
- FFmpeg bundled no instalador
- Desinstalador completo (remove DB e config)

---

## 📊 Métricas e Monitoramento

### Logs

**Localização:** `%APPDATA%\LegendAI\logs\`

**Formato:**

```
[2026-03-03 14:32:15] [INFO] File watcher started: C:\Downloads\Torrents
[2026-03-03 14:35:42] [INFO] New file detected: Breaking.Bad.S05E01.mkv
[2026-03-03 14:35:52] [INFO] File stable, added to queue
[2026-03-03 14:36:01] [INFO] Starting extraction for: Breaking.Bad.S05E01.mkv
[2026-03-03 14:36:15] [INFO] Extracted subtitle: Breaking.Bad.S05E01_eng.srt (431 segments)
[2026-03-03 14:36:16] [INFO] Starting translation (12 chunks)
[2026-03-03 14:38:45] [INFO] Translation completed successfully
[2026-03-03 14:38:46] [INFO] Saved: Breaking.Bad.S05E01_pt-BR.srt
```

### Dashboard Stats

- Total files processed
- Success rate (%)
- Average processing time
- API key usage stats
- Error breakdown
- Disk space used by cache

---

## 🔐 Segurança e Privacidade

### API Keys

- Armazenadas criptografadas no DB (AES-256)
- Nunca aparecem em logs
- Apenas os últimos 4 caracteres visíveis na UI

### Dados do Usuário

- Tudo armazenado localmente
- Nenhuma telemetria ou analytics
- Opt-in para error reporting (futuro)

### Permissões Windows

- Acesso somente às pastas configuradas
- Não requer privilégios de admin
- Firewall: apenas conexões HTTPS para APIs

---

## 🎯 Roadmap de Desenvolvimento

### MVP (Fase 1) - 2 semanas

- [x] Setup básico do Electron + React
- [x] File watcher funcional
- [x] Extração de legendas com FFmpeg
- [x] Tradução básica (1 API key)
- [x] UI mínima (tray + configurações)
- [x] Salvamento de resultado

### Core Features (Fase 2) - 2 semanas

- [x] Sistema de múltiplas keys
- [x] Rate limiting inteligente
- [x] Database e persistência
- [x] Dashboard completo
- [x] Retry e error handling
- [x] Auto-start com Windows

### Polish (Fase 3) - 1 semana

- [x] Cache de traduções
- [x] Notificações Windows
- [x] Histórico e estatísticas
- [x] Logs estruturados
- [x] Testes unitários básicos

### Release (Fase 4) - 1 semana

- [x] Build para Windows
- [x] Instalador NSIS
- [x] Documentação completa
- [x] Beta testing
- [x] Release 1.0

### Futuro (Fase 5)

- [ ] Notificações mobile (Pushover/ntfy.sh)
- [ ] Suporte a mais idiomas
- [ ] API REST local (controle remoto)
- [ ] Integração direta com qBittorrent API
- [ ] Suporte a outras APIs (Claude, GPT-4)
- [ ] Auto-update

---

## 💰 Custo e Escalabilidade

### Custos

- **Desenvolvimento:** Zero (código aberto, ferramentas gratuitas)
- **APIs:** Zero (uso de keys gratuitas do Gemini)
- **Infraestrutura:** Zero (roda localmente)

### Limites do Gemini Free

- 15 RPM por key
- ~1500 traduções/dia por key
- Com 5 keys = ~7500 traduções/dia

**Para seu uso pessoal:** Mais que suficiente  
**Exemplo:** 10 episódios/dia × 500 legendas/ep = 5000 traduções/dia ✅

### Se precisar escalar

1. Adicionar mais keys (até 10)
2. Usar Groq (gratuito, rápido)
3. Cache inteligente (evita retraduzir)
4. Considerar Claude/GPT no futuro

---

## 📚 Próximos Passos

### 1. Decisão de Organização

**Opção A:** Monorepo (mesmo repositório)

```
legendai/
├── web/        # Projeto web atual
└── desktop/    # Novo projeto desktop
```

**Opção B:** Repositório separado

```
legendai-web/      # Repo atual
legendai-desktop/  # Novo repo
```

**Recomendação:** **Opção B** - Repositório separado

- Histórico de commits mais limpo
- CI/CD independente
- Releases separadas
- Menos confusão

### 2. Criar Documentos Técnicos

- [ ] ARCHITECTURE.md - Decisões arquiteturais
- [ ] DEVELOPMENT.md - Setup de desenvolvimento
- [ ] API.md - Documentação das APIs internas
- [ ] CONTRIBUTING.md - Guidelines para contribuir

### 3. Setup Inicial

- [ ] Criar novo repositório `legendai-desktop`
- [ ] Configurar Electron boilerplate
- [ ] Setup ESLint, Prettier, TypeScript
- [ ] Configurar electron-builder

### 4. Implementação

- [ ] Seguir roadmap fase por fase
- [ ] Testes em máquina virtual Windows
- [ ] Beta testing no seu PC Windows

---

## 🤝 Contribuindo

Este projeto será open-source (MIT License).

**Como contribuir:**

1. Fork o repositório
2. Crie uma branch (`feat/nova-funcionalidade`)
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

---

## 📞 Suporte

- **Issues:** GitHub Issues
- **Documentação:** `/docs` folder
- **Discussões:** GitHub Discussions

---

**Última atualização:** 3 de março de 2026  
**Versão:** 0.1.0-alpha  
**Status:** 📝 Planning Phase
