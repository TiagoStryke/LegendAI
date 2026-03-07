# LegendAI Desktop - Skills & Knowledge Guide

> **Propósito:** Este documento serve como base de conhecimento para agentes AI e desenvolvedores que trabalharão no projeto LegendAI Desktop. Contém todas as skills, padrões, APIs e melhores práticas a serem seguidas.

---

## 📚 Contexto do Projeto

### Projeto Web Original (Base)

O LegendAI Desktop é uma evolução do projeto web **SRT PT AI** (atual LegendAI Web), que traduz legendas SRT usando Google Gemini API.

**Repositório Web:** `TiagoStryke/LegendAI` (branch: `feature/render-hosting`)

**Código reutilizável:**

- [x] Lógica de tradução (`app/api/route.ts`)
- [x] Sistema de múltiplas keys
- [x] Rate limiting inteligente
- [x] Parsing de SRT (`lib/client.ts`, `lib/srt.ts`)
- [x] Extração de contexto de arquivos
- [x] Formatação de diálogos

**Diferenças principais:**

- Web: Interface web Next.js, hospedado no Render
- Desktop: Aplicação Electron standalone, roda localmente

---

## 🛠️ Stack Tecnológica

### 1. Electron + React + TypeScript

**Por que Electron?**

- ✅ Cross-platform development (desenvolver no Mac, rodar no Windows)
- ✅ Acesso completo ao sistema de arquivos
- ✅ Pode executar binários nativos (FFmpeg)
- ✅ System tray support nativo
- ✅ Auto-updater integrado

**Por que React?**

- ✅ Já usado no projeto web
- ✅ Componentes reutilizáveis
- ✅ Grande ecossistema
- ✅ TypeScript first-class support

**Por que TypeScript?**

- ✅ Type safety (menos bugs)
- ✅ Melhor DX (autocomplete, refactoring)
- ✅ Documentação viva (tipos são documentação)

### 2. Bibliotecas Core

#### File System Watching

```typescript
// chokidar - Monitoramento de arquivos cross-platform
import chokidar from 'chokidar';

const watcher = chokidar.watch('/path/to/folder', {
	persistent: true,
	ignoreInitial: true,
	awaitWriteFinish: {
		stabilityThreshold: 5000, // Espera 5s sem mudanças
		pollInterval: 1000,
	},
});

watcher
	.on('add', (path) => console.log(`File ${path} added`))
	.on('change', (path) => console.log(`File ${path} changed`));
```

**Por que chokidar:**

- Native file watching (performático)
- Detecta quando arquivo terminou de ser escrito
- Cross-platform
- Suporta glob patterns

#### Database - Better SQLite3

```typescript
import Database from 'better-sqlite3';

const db = new Database('legendai.db');

// Prepared statements (seguro e rápido)
const insert = db.prepare(`
  INSERT INTO files (file_path, status, created_at)
  VALUES (?, ?, ?)
`);

insert.run('/path/to/file.mkv', 'pending', Date.now());

// Transactions (atomic operations)
const insertMany = db.transaction((files) => {
	for (const file of files) {
		insert.run(file.path, file.status, Date.now());
	}
});
```

**Por que better-sqlite3:**

- Síncrono (mais simples que async sqlite)
- Muito rápido
- Embedded (sem servidor separado)
- Transactions ACID

#### FFmpeg - Fluent FFmpeg

```typescript
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';

// Configurar paths dos binários
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Extrair subtitle
ffmpeg('/path/to/video.mkv')
	.outputOptions([
		'-map 0:s:0', // Primeira subtitle stream
		'-c:s srt', // Converter para SRT
	])
	.output('/path/to/output.srt')
	.on('end', () => console.log('Done'))
	.on('error', (err) => console.error(err))
	.run();

// Probe para detectar streams
ffmpeg.ffprobe('/path/to/video.mkv', (err, metadata) => {
	const subtitles = metadata.streams.filter((s) => s.codec_type === 'subtitle');
	console.log(subtitles);
});
```

**Bundling FFmpeg:**

- Incluir binários no instalador (`resources/ffmpeg/`)
- Detectar path em runtime
- Fallback para system FFmpeg se disponível

#### AI SDK - Google Gemini

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

const google = createGoogleGenerativeAI({
	apiKey: process.env.GEMINI_API_KEY,
});

const model = google('gemini-2.0-flash-exp');

const { text } = await generateText({
	model,
	messages: [{ role: 'user', content: 'Translate to Portuguese: Hello' }],
});
```

**Sistema de Múltiplas Keys:**

```typescript
class KeyManager {
	private keys: APIKey[] = [];
	private currentIndex = 0;

	getNextAvailableKey(): APIKey | null {
		const available = this.keys
			.filter((k) => k.isActive && !k.isInCooldown())
			.sort((a, b) => a.errorCount - b.errorCount);

		return available[0] || null;
	}

	markKeyAsFailed(key: APIKey, error: Error) {
		if (this.isQuotaError(error)) {
			key.cooldownUntil = Date.now() + 5 * 60 * 1000; // 5 min
		}
		key.errorCount++;
		this.saveToDatabase();
	}
}
```

#### Logging - Winston

```typescript
import winston from 'winston';

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json(),
	),
	transports: [
		new winston.transports.File({
			filename: 'error.log',
			level: 'error',
		}),
		new winston.transports.File({
			filename: 'combined.log',
		}),
	],
});

// Em desenvolvimento, log no console também
if (process.env.NODE_ENV !== 'production') {
	logger.add(
		new winston.transports.Console({
			format: winston.format.simple(),
		}),
	);
}

logger.info('File added to queue', { filePath: '/path/to/file.mkv' });
logger.error('Translation failed', { error: err.message, fileId: 123 });
```

---

## 🏗️ Arquitetura e Padrões

### IPC (Inter-Process Communication)

Electron tem 2 processos: **Main** (Node.js) e **Renderer** (Chromium/React).

```typescript
// src/main/ipc/handlers.ts
import { ipcMain } from 'electron';

ipcMain.handle('get-files', async (event, status?: string) => {
	const fileService = FileService.getInstance();
	return fileService.getFiles(status);
});

ipcMain.handle('add-api-key', async (event, key: string) => {
	const keyManager = KeyManager.getInstance();
	return keyManager.addKey(key);
});

// src/renderer/hooks/useFiles.ts
import { ipcRenderer } from 'electron';

export function useFiles() {
	const [files, setFiles] = useState([]);

	useEffect(() => {
		ipcRenderer.invoke('get-files').then(setFiles);

		// Listen for updates
		ipcRenderer.on('file-updated', (event, file) => {
			setFiles((prev) => [...prev, file]);
		});
	}, []);

	return { files };
}
```

**Padrões IPC:**

- `handle` para operações síncronas (request/response)
- `send` para eventos unidirecionais
- `on` para listeners de eventos
- Sempre validar dados do renderer (nunca confiar no usuário)

### Service Layer Pattern

```typescript
// src/main/services/FileWatcher.ts
export class FileWatcherService {
	private static instance: FileWatcherService;
	private watcher: chokidar.FSWatcher | null = null;
	private db: Database;

	private constructor() {
		this.db = Database.getInstance();
	}

	static getInstance(): FileWatcherService {
		if (!FileWatcherService.instance) {
			FileWatcherService.instance = new FileWatcherService();
		}
		return FileWatcherService.instance;
	}

	start(folders: string[]) {
		this.watcher = chokidar.watch(folders, {
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: 10000,
				pollInterval: 1000,
			},
		});

		this.watcher.on('add', this.handleFileAdded.bind(this));
	}

	private async handleFileAdded(path: string) {
		if (!path.endsWith('.mkv')) return;

		// Check if already processed
		const existing = this.db.getFileByPath(path);
		if (existing) return;

		// Add to queue
		const fileId = this.db.addFile({
			path,
			status: 'pending',
			createdAt: Date.now(),
		});

		// Notify renderer
		this.notify('file-added', { id: fileId, path });

		// Start processing
		ProcessorService.getInstance().processFile(fileId);
	}

	stop() {
		this.watcher?.close();
	}
}
```

**Padrões:**

- Singleton para services (1 instância por app)
- Dependency injection via getInstance()
- Event-driven architecture
- Separation of concerns

### Database Layer

```typescript
// src/main/services/Database.ts
export class DatabaseService {
	private db: Database.Database;

	constructor(dbPath: string) {
		this.db = new Database(dbPath);
		this.initialize();
	}

	private initialize() {
		// Create tables if not exist
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
	}

	// Prepared statements (reuse para performance)
	private stmts = {
		getFileById: this.db.prepare('SELECT * FROM files WHERE id = ?'),
		addFile: this.db.prepare(`
      INSERT INTO files (file_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `),
		updateStatus: this.db.prepare(`
      UPDATE files SET status = ?, updated_at = ? WHERE id = ?
    `),
	};

	getFileById(id: number): File | null {
		return this.stmts.getFileById.get(id) as File | null;
	}

	addFile(data: NewFile): number {
		const now = Date.now();
		const result = this.stmts.addFile.run(data.path, data.status, now, now);
		return result.lastInsertRowid as number;
	}
}
```

### Error Handling

```typescript
// src/main/utils/errors.ts
export class TranslationError extends Error {
	constructor(
		message: string,
		public code: string,
		public isRetryable: boolean = false,
	) {
		super(message);
		this.name = 'TranslationError';
	}
}

export class QuotaError extends TranslationError {
	constructor(message: string) {
		super(message, 'QUOTA_EXCEEDED', true);
	}
}

export class RateLimitError extends TranslationError {
	constructor(
		message: string,
		public retryAfter: number,
	) {
		super(message, 'RATE_LIMIT', true);
	}
}

// Usage
try {
	await translate(text, apiKey);
} catch (error) {
	if (error instanceof QuotaError) {
		logger.warn('Quota exceeded, rotating key');
		const nextKey = keyManager.getNextAvailableKey();
		// retry with next key
	} else if (error instanceof RateLimitError) {
		logger.warn(`Rate limited, waiting ${error.retryAfter}ms`);
		await sleep(error.retryAfter);
		// retry
	} else {
		logger.error('Unexpected error', { error });
		throw error;
	}
}
```

---

## 🎨 UI/UX Patterns

### React + TailwindCSS

```tsx
// src/renderer/components/FileCard.tsx
interface FileCardProps {
	file: ProcessingFile;
	onRetry?: () => void;
}

export function FileCard({ file, onRetry }: FileCardProps) {
	const statusColors = {
		pending: 'bg-gray-200',
		extracting: 'bg-blue-500',
		translating: 'bg-purple-500',
		completed: 'bg-green-500',
		failed: 'bg-red-500',
	};

	return (
		<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
			<div className="flex items-center justify-between">
				<div className="flex-1">
					<h3 className="font-medium text-gray-900 dark:text-gray-100">
						{file.name}
					</h3>
					<p className="text-sm text-gray-500 dark:text-gray-400">
						{file.status}
					</p>
				</div>

				{file.status === 'failed' && (
					<button
						onClick={onRetry}
						className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						Retry
					</button>
				)}
			</div>

			{file.progress && (
				<div className="mt-3">
					<div className="flex justify-between text-xs mb-1">
						<span>Progress</span>
						<span>{file.progress}%</span>
					</div>
					<div className="w-full bg-gray-200 rounded-full h-2">
						<div
							className={`h-2 rounded-full transition-all ${statusColors[file.status]}`}
							style={{ width: `${file.progress}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
```

### System Tray

```typescript
// src/main/tray.ts
import { app, Menu, Tray, nativeImage } from 'electron';
import path from 'path';

export function createTray(mainWindow: BrowserWindow) {
	const icon = nativeImage.createFromPath(
		path.join(__dirname, '../resources/icon.png'),
	);

	const tray = new Tray(icon);

	const contextMenu = Menu.buildFromTemplate([
		{
			label: 'Open Dashboard',
			click: () => {
				mainWindow.show();
			},
		},
		{ type: 'separator' },
		{
			label: 'Start Monitoring',
			click: () => {
				FileWatcherService.getInstance().start();
			},
		},
		{
			label: 'Pause Monitoring',
			click: () => {
				FileWatcherService.getInstance().stop();
			},
		},
		{ type: 'separator' },
		{
			label: 'Quit',
			click: () => {
				app.quit();
			},
		},
	]);

	tray.setContextMenu(contextMenu);
	tray.setToolTip('LegendAI Desktop');

	// Double click to show window
	tray.on('double-click', () => {
		mainWindow.show();
	});

	return tray;
}
```

### Notifications

```typescript
// src/main/utils/notifications.ts
import { Notification } from 'electron';

export function showNotification(
	title: string,
	body: string,
	options?: {
		icon?: string;
		silent?: boolean;
		urgency?: 'normal' | 'critical' | 'low';
	},
) {
	const notification = new Notification({
		title,
		body,
		icon: options?.icon,
		silent: options?.silent ?? false,
		urgency: options?.urgency ?? 'normal',
	});

	notification.show();

	return notification;
}

// Usage
showNotification(
	'Translation Complete',
	'Breaking.Bad.S05E01.mkv has been translated successfully!',
	{ urgency: 'normal' },
);
```

---

## 🔄 Core Workflows

### 1. File Processing Pipeline

```typescript
// src/main/services/Processor.ts
export class ProcessorService {
	async processFile(fileId: number) {
		try {
			const file = db.getFileById(fileId);
			if (!file) throw new Error('File not found');

			// Step 1: Extract subtitle
			this.updateStatus(fileId, 'extracting', 0);
			const subtitlePath = await this.extractSubtitle(file.path);

			// Step 2: Parse SRT
			this.updateStatus(fileId, 'translating', 0);
			const segments = await this.parseSRT(subtitlePath);

			// Step 3: Translate
			const translated = await this.translate(segments, {
				onProgress: (current, total) => {
					const progress = Math.round((current / total) * 100);
					this.updateStatus(fileId, 'translating', progress);
				},
			});

			// Step 4: Save
			const outputPath = this.generateOutputPath(file.path);
			await this.saveSRT(outputPath, translated);

			// Step 5: Complete
			this.updateStatus(fileId, 'completed', 100);

			showNotification(
				'Translation Complete',
				`${path.basename(file.path)} has been translated!`,
			);
		} catch (error) {
			logger.error('Processing failed', { fileId, error });
			this.updateStatus(fileId, 'failed', 0);

			if (error instanceof QuotaError) {
				showNotification(
					'All API keys exhausted',
					'Please wait or add more keys in settings',
				);
			}
		}
	}
}
```

### 2. Rate Limiting

Reutilizar do projeto web, mas adaptar:

```typescript
// src/main/services/RateLimiter.ts
interface RequestHistory {
	timestamps: number[];
	lastRequest: number;
}

export class RateLimiter {
	private history = new Map<string, RequestHistory>();
	private readonly maxRPM = 10;
	private readonly minDelay = 500;
	private readonly windowMs = 60000;

	async waitForRateLimit(keyId: string): Promise<void> {
		const now = Date.now();
		let history = this.history.get(keyId);

		if (!history) {
			history = { timestamps: [], lastRequest: 0 };
			this.history.set(keyId, history);
		}

		// Remove old timestamps
		history.timestamps = history.timestamps.filter(
			(ts) => now - ts < this.windowMs,
		);

		// Check if need to wait
		if (history.timestamps.length >= this.maxRPM) {
			const oldestRequest = history.timestamps[0];
			const waitTime = this.windowMs - (now - oldestRequest) + 100;

			if (waitTime > 0) {
				logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
				await sleep(waitTime);
			}
		}

		// Ensure minimum delay
		const timeSinceLast = now - history.lastRequest;
		if (timeSinceLast < this.minDelay) {
			await sleep(this.minDelay - timeSinceLast);
		}

		// Record request
		const requestTime = Date.now();
		history.timestamps.push(requestTime);
		history.lastRequest = requestTime;
	}
}
```

### 3. Cache de Traduções

```typescript
// src/main/services/TranslationCache.ts
export class TranslationCache {
	private db: DatabaseService;

	get(
		sourceText: string,
		sourceLang: string,
		targetLang: string,
	): string | null {
		const cached = this.db.query(
			`
      SELECT translated_text
      FROM translation_cache
      WHERE source_text = ? AND source_lang = ? AND target_lang = ?
    `,
			[sourceText, sourceLang, targetLang],
		);

		return cached?.translated_text || null;
	}

	set(
		sourceText: string,
		translatedText: string,
		sourceLang: string,
		targetLang: string,
	) {
		this.db.run(
			`
      INSERT INTO translation_cache (source_text, translated_text, source_lang, target_lang, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_text, source_lang, target_lang)
      DO UPDATE SET translated_text = excluded.translated_text
    `,
			[sourceText, translatedText, sourceLang, targetLang, Date.now()],
		);
	}

	async translateWithCache(segments: string[]): Promise<string[]> {
		const results: string[] = [];
		const toTranslate: string[] = [];
		const indices: number[] = [];

		// Check cache first
		for (let i = 0; i < segments.length; i++) {
			const cached = this.get(segments[i], 'en', 'pt-BR');
			if (cached) {
				results[i] = cached;
			} else {
				toTranslate.push(segments[i]);
				indices.push(i);
			}
		}

		// Translate uncached
		if (toTranslate.length > 0) {
			const translated = await this.translate(toTranslate);

			for (let i = 0; i < translated.length; i++) {
				const index = indices[i];
				results[index] = translated[i];

				// Save to cache
				this.set(toTranslate[i], translated[i], 'en', 'pt-BR');
			}
		}

		return results;
	}
}
```

---

## 🧪 Testing

### Unit Tests (Jest)

```typescript
// __tests__/services/RateLimiter.test.ts
import { RateLimiter } from '@/main/services/RateLimiter';

describe('RateLimiter', () => {
	let limiter: RateLimiter;

	beforeEach(() => {
		limiter = new RateLimiter();
	});

	it('should enforce rate limits', async () => {
		const start = Date.now();

		// Make 11 requests (exceeds 10 RPM limit)
		for (let i = 0; i < 11; i++) {
			await limiter.waitForRateLimit('test-key');
		}

		const elapsed = Date.now() - start;

		// Should have waited at least for rate limit window
		expect(elapsed).toBeGreaterThanOrEqual(60000);
	});

	it('should enforce minimum delay between requests', async () => {
		const start = Date.now();

		await limiter.waitForRateLimit('test-key');
		await limiter.waitForRateLimit('test-key');

		const elapsed = Date.now() - start;

		// Should have waited at least 500ms
		expect(elapsed).toBeGreaterThanOrEqual(500);
	});
});
```

### Integration Tests

```typescript
// __tests__/integration/file-processing.test.ts
describe('File Processing', () => {
	it('should process file end-to-end', async () => {
		const testFile = path.join(__dirname, 'fixtures/test.mkv');

		// Add file to database
		const fileId = db.addFile({
			path: testFile,
			status: 'pending',
		});

		// Process
		await processor.processFile(fileId);

		// Check result
		const file = db.getFileById(fileId);
		expect(file.status).toBe('completed');

		// Check output exists
		const outputPath = generateOutputPath(testFile);
		expect(fs.existsSync(outputPath)).toBe(true);
	});
});
```

---

## 📦 Build e Deploy

### Electron Builder

```json
// electron-builder.json
{
	"appId": "com.legendai.desktop",
	"productName": "LegendAI Desktop",
	"directories": {
		"output": "dist",
		"buildResources": "resources"
	},
	"files": ["build/**/*", "node_modules/**/*", "package.json"],
	"win": {
		"target": [
			{
				"target": "nsis",
				"arch": ["x64"]
			},
			{
				"target": "portable",
				"arch": ["x64"]
			}
		],
		"icon": "resources/icon.ico",
		"artifactName": "${productName}-${version}-${arch}.${ext}"
	},
	"nsis": {
		"oneClick": false,
		"allowToChangeInstallationDirectory": true,
		"allowElevation": true,
		"createDesktopShortcut": true,
		"createStartMenuShortcut": true,
		"shortcutName": "LegendAI",
		"perMachine": false,
		"runAfterFinish": true,
		"installerIcon": "resources/icon.ico",
		"uninstallerIcon": "resources/icon.ico",
		"license": "LICENSE"
	},
	"extraResources": [
		{
			"from": "resources/ffmpeg/win",
			"to": "ffmpeg",
			"filter": ["**/*"]
		}
	]
}
```

### Package Scripts

```json
{
	"scripts": {
		"dev": "concurrently \"npm run dev:main\" \"npm run dev:renderer\"",
		"dev:main": "tsc -p tsconfig.main.json && electron .",
		"dev:renderer": "vite",
		"build": "npm run build:main && npm run build:renderer",
		"build:main": "tsc -p tsconfig.main.json",
		"build:renderer": "vite build",
		"build:win": "electron-builder --win",
		"build:portable": "electron-builder --win portable",
		"test": "jest",
		"test:watch": "jest --watch",
		"lint": "eslint src --ext .ts,.tsx",
		"format": "prettier --write \"src/**/*.{ts,tsx}\""
	}
}
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-windows:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build:win

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: windows-installer
          path: dist/*.exe
```

---

## 🔐 Best Practices

### 1. Security

```typescript
// ❌ BAD - Exposes API keys in renderer
const apiKey = 'AIzaSy...';

// ✅ GOOD - Keep keys in main process only
// main/services/Config.ts
export class ConfigService {
	private keys: string[] = [];

	loadKeys() {
		// Load encrypted keys from database
		this.keys = db.getAPIKeys().map((k) => decrypt(k));
	}

	getKey(index: number): string {
		return this.keys[index];
	}
}

// renderer can only request translation, not access keys
ipcRenderer.invoke('translate', { text: 'Hello' });
```

### 2. Error Boundaries (React)

```tsx
// src/renderer/components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	{ hasError: boolean; error?: Error }
> {
	state = { hasError: false };

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		logger.error('React error boundary caught error', { error, errorInfo });
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="p-8 text-center">
					<h1 className="text-2xl font-bold text-red-600 mb-4">
						Something went wrong
					</h1>
					<p className="text-gray-600 mb-4">{this.state.error?.message}</p>
					<button
						onClick={() => this.setState({ hasError: false })}
						className="px-4 py-2 bg-blue-500 text-white rounded"
					>
						Try again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
```

### 3. Resource Cleanup

```typescript
// src/main/index.ts
app.on('before-quit', async (event) => {
	event.preventDefault();

	try {
		// Stop file watcher
		FileWatcherService.getInstance().stop();

		// Save state
		await StateManager.getInstance().saveState();

		// Close database
		DatabaseService.getInstance().close();

		// Release locks
		await releaseAllLocks();

		app.exit(0);
	} catch (error) {
		logger.error('Error during shutdown', { error });
		app.exit(1);
	}
});
```

### 4. Memory Management

```typescript
// Avoid memory leaks with WeakMap
const cache = new WeakMap<Object, CachedData>();

// Clear large data structures when not needed
function processLargeFile(path: string) {
	const data = readLargeFile(path);

	try {
		// ... process data
	} finally {
		// Explicitly clear to help GC
		data.length = 0;
	}
}

// Monitor memory usage
if (process.memoryUsage().heapUsed > 500 * 1024 * 1024) {
	logger.warn('High memory usage detected');
	// Maybe clear caches, pause processing, etc
}
```

---

## 🚀 Development Workflow

### 1. Setup

```bash
# Clone repository
git clone https://github.com/TiagoStryke/legendai-desktop.git
cd legendai-desktop

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run in development mode
npm run dev
```

### 2. Code Style

```typescript
// Use ES6+ features
const apiKeys = await db.getAPIKeys();

// Use optional chaining
const lang = file?.metadata?.language ?? 'en';

// Use nullish coalescing
const timeout = config.timeout ?? 10000;

// Use async/await (not callbacks)
async function translate(text: string) {
	try {
		const result = await api.translate(text);
		return result;
	} catch (error) {
		logger.error('Translation failed', { error });
		throw error;
	}
}

// Use array methods
const pending = files.filter((f) => f.status === 'pending');
const paths = files.map((f) => f.path);

// Use early returns
function processFile(file: File) {
	if (!file.path) return;
	if (file.status !== 'pending') return;

	// ... processing logic
}
```

### 3. Commit Convention

```
feat: add translation cache
fix: resolve memory leak in file watcher
docs: update installation guide
refactor: simplify rate limiter logic
test: add tests for key rotation
chore: update dependencies
```

### 4. PR Checklist

- [ ] Code follows style guide
- [ ] Tests pass locally
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] No console.log (use logger instead)
- [ ] TypeScript types are correct
- [ ] Tested on Windows (VM or native)

---

## 📈 Performance Optimization

### 1. Database

```typescript
// Use transactions for bulk operations
const insertMany = db.transaction((files: File[]) => {
	const stmt = db.prepare('INSERT INTO files ...');
	for (const file of files) {
		stmt.run(file);
	}
});

// Use EXPLAIN QUERY PLAN to optimize
db.pragma('EXPLAIN QUERY PLAN SELECT * FROM files WHERE status = ?');

// Add indexes for frequent queries
db.prepare('CREATE INDEX IF NOT EXISTS idx_status ON files(status)').run();
```

### 2. File Processing

```typescript
// Process files in queue (not all at once)
const queue = new PQueue({ concurrency: 2 }); // Max 2 concurrent

for (const file of files) {
	queue.add(() => processFile(file));
}

// Use streams for large files
import { createReadStream } from 'fs';

const stream = createReadStream('large.srt');
stream.on('data', (chunk) => {
	// Process chunk by chunk
});
```

### 3. React Optimization

```tsx
// Memoize expensive calculations
const sortedFiles = useMemo(() => {
	return files.sort((a, b) => b.createdAt - a.createdAt);
}, [files]);

// Avoid re-renders
const FileItem = React.memo(({ file }: { file: File }) => {
	return <div>{file.name}</div>;
});

// Use keys properly
{
	files.map((file) => <FileItem key={file.id} file={file} />);
}
```

---

## 🎓 Learning Resources

### Electron

- [Electron Docs](https://www.electronjs.org/docs)
- [Electron Fiddle](https://www.electronjs.org/fiddle) - Playground
- [electron-builder Docs](https://www.electron.build/)

### React + TypeScript

- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)

### FFmpeg

- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [fluent-ffmpeg API](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)

### AI SDK

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Google Gemini API](https://ai.google.dev/)

---

## ✅ Checklist de Implementação

### Setup Inicial

- [ ] Criar repositório `legendai-desktop`
- [ ] Setup Electron + React + TypeScript
- [ ] Configurar electron-builder
- [ ] Setup ESLint + Prettier + Husky

### Core Features

- [ ] File watcher (chokidar)
- [ ] SQLite database
- [ ] FFmpeg integration
- [ ] Translation engine (múltiplas keys)
- [ ] Rate limiter
- [ ] Cache de traduções

### UI

- [ ] System tray icon
- [ ] Dashboard page
- [ ] Settings page
- [ ] History page
- [ ] Progress indicators
- [ ] Notifications

### Polish

- [ ] Error handling robusto
- [ ] Logging estruturado
- [ ] Auto-start com Windows
- [ ] Retry logic
- [ ] Tests unitários

### Release

- [ ] Build para Windows
- [ ] Installer NSIS
- [ ] Documentação completa
- [ ] Beta testing

---

**Última atualização:** 3 de março de 2026  
**Versão do Guia:** 1.0.0

**Este documento deve ser atualizado conforme o projeto evolui.**
