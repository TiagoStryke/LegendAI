# LegendAI Desktop - Advanced Integrations

> **Propósito:** Integrações avançadas para controle remoto via celular, notificações mobile e automação completa com qBittorrent.

---

## 🎯 Visão Geral

Transformar o app desktop em uma **solução completa de automação** controlável remotamente:

```
📱 Celular (você)
    ↓ adiciona torrent
🌐 Internet
    ↓
💻 PC Windows (casa)
    ├─ qBittorrent baixa
    ├─ LegendAI detecta
    ├─ Extrai legenda
    └─ Traduz
    ↓
📱 Notificação: "✅ Breaking Bad S05E16 pronto!"
```

---

## � 0. Detecção de Arquivos Completos (Evitar Downloads Incompletos)

### Problema

Quando o app monitora a pasta de downloads, pode detectar arquivos `.mkv` **ainda sendo baixados** e tentar extrair legendas de arquivos incompletos, causando erros.

### Soluções Recomendadas

#### ✅ Opção A: Integração com Sonarr/Radarr (RECOMENDADO)

**Usar Sonarr/Radarr para gerenciar downloads + LegendAI apenas para tradução**

```typescript
// Sonarr/Radarr tem webhook quando download completa
app.post('/api/sonarr/webhook', async (req, res) => {
	const { eventType, series, episodes, episodeFile } = req.body;

	if (eventType === 'Download') {
		// Arquivo 100% completo e movido para pasta final
		const videoPath = episodeFile.path;

		console.log('📥 Sonarr: Download completo', videoPath);

		// Processar automaticamente
		await fileProcessor.processVideo(videoPath);
	}

	res.json({ success: true });
});
```

**Vantagens:**

- ✅ Arquivos sempre 100% completos (Sonarr move após verificar)
- ✅ Organização automática de pastas
- ✅ Renomeação padronizada
- ✅ Metadata (IMDb, TMDb) integrado
- ✅ Sem falsos positivos

**Setup:**

1. Configurar Sonarr/Radarr
2. Ativar webhook em Settings → Connect
3. URL: `http://localhost:3030/api/sonarr/webhook`
4. Eventos: `On Download`

---

#### ✅ Opção B: Integração qBittorrent API (SEM SONARR)

**Monitorar torrents que completaram via API do qBittorrent**

```typescript
// src/main/services/QBittorrentWatcher.ts
export class QBittorrentWatcher {
	private qbitClient: QBittorrentClient;
	private knownCompleted = new Set<string>();

	async start() {
		// Polling a cada 10 segundos
		setInterval(async () => {
			const torrents = await this.qbitClient.getTorrents('completed');

			for (const torrent of torrents) {
				// Já processado?
				if (this.knownCompleted.has(torrent.hash)) continue;

				// Completou recentemente? (últimos 5 min)
				const completionTime = torrent.completion_on * 1000;
				const isRecent = Date.now() - completionTime < 300000;

				if (!isRecent) continue;

				// Marcar como conhecido
				this.knownCompleted.add(torrent.hash);

				console.log('✅ qBittorrent: Torrent completo', torrent.name);

				// Buscar arquivos .mkv no diretório
				const videoFiles = await this.findVideoFiles(torrent.content_path);

				// Processar cada arquivo
				for (const videoFile of videoFiles) {
					await fileProcessor.processVideo(videoFile);
				}
			}
		}, 10000);
	}

	async findVideoFiles(path: string): Promise<string[]> {
		// Implementação recursiva para encontrar .mkv/.mp4/.avi
		// ... (código no ADVANCED-INTEGRATIONS.md linha 520)
	}
}
```

**Vantagens:**

- ✅ Sem Sonarr/Radarr necessário
- ✅ Arquivos garantidamente completos (qBit verifica hash)
- ✅ API nativa do qBittorrent

**Desvantagens:**

- ⚠️ Sem organização automática de pastas
- ⚠️ Sem renomeação padronizada
- ⚠️ Precisa buscar recursivamente por vídeos

---

#### ✅ Opção C: Chokidar com `awaitWriteFinish` (SEM INTEGRAÇÕES)

**File watcher aguarda arquivo estabilizar antes de processar**

```typescript
// src/main/services/FileWatcher.ts
import chokidar from 'chokidar';

const watcher = chokidar.watch('D:/Downloads/Torrents/**/*.mkv', {
	persistent: true,
	ignoreInitial: false,
	awaitWriteFinish: {
		stabilityThreshold: 10000, // 10 segundos sem modificação
		pollInterval: 2000, // Verifica a cada 2 segundos
	},
});

watcher.on('add', async (filePath) => {
	console.log(`📁 Novo arquivo detectado (estável): ${filePath}`);

	// Arquivo já está completo (10s sem modificação)
	await fileProcessor.processVideo(filePath);
});
```

**Vantagens:**

- ✅ Sem dependências externas (qBit, Sonarr)
- ✅ Simples de implementar
- ✅ Funciona com qualquer fonte de download

**Desvantagens:**

- ⚠️ Delay de 10-30 segundos após download
- ⚠️ Não 100% confiável (arquivo pode ainda estar sendo escrito)
- ⚠️ Problemas com arquivos grandes (>10 GB)

---

#### ✅ Opção D: Verificação de Lock de Arquivo (MAIS ROBUSTO)

**Tentar abrir arquivo exclusivamente antes de processar**

```typescript
// src/main/utils/file-checker.ts
import fs from 'fs';

export async function isFileComplete(filePath: string): Promise<boolean> {
	try {
		// Tentar abrir com lock exclusivo
		const fd = fs.openSync(filePath, 'r+');
		fs.closeSync(fd);

		// Se conseguiu abrir, arquivo não está sendo escrito
		return true;
	} catch (error) {
		if (error.code === 'EBUSY' || error.code === 'EPERM') {
			// Arquivo ainda em uso (sendo escrito)
			return false;
		}
		throw error;
	}
}

export async function waitForFileComplete(
	filePath: string,
	maxWaitMinutes: number = 60,
): Promise<boolean> {
	const maxAttempts = maxWaitMinutes * 12; // Tenta a cada 5s

	for (let i = 0; i < maxAttempts; i++) {
		if (await isFileComplete(filePath)) {
			console.log(`✅ Arquivo completo: ${filePath}`);
			return true;
		}

		// Aguardar 5 segundos
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}

	console.warn(`⚠️ Timeout aguardando arquivo: ${filePath}`);
	return false;
}
```

**Uso:**

```typescript
watcher.on('add', async (filePath) => {
	console.log(`📁 Novo arquivo: ${filePath}`);

	// Aguardar arquivo estar completo
	const isComplete = await waitForFileComplete(filePath, 60);

	if (isComplete) {
		await fileProcessor.processVideo(filePath);
	} else {
		console.error(`❌ Arquivo não completou: ${filePath}`);
	}
});
```

**Vantagens:**

- ✅ Muito confiável (testa lock real)
- ✅ Funciona com qualquer fonte
- ✅ Sem delay fixo (assim que libera, processa)

**Desvantagens:**

- ⚠️ Mais complexo
- ⚠️ Pode ter problemas de permissão no Windows

---

#### ✅ Opção E: Verificação de Tamanho (COMBINADO)

**Monitorar tamanho do arquivo + sem modificação**

```typescript
// src/main/utils/file-stability-checker.ts
import fs from 'fs';

interface FileSizeCheck {
	path: string;
	size: number;
	timestamp: number;
}

const fileSizeCache = new Map<string, FileSizeCheck>();

export async function isFileStable(
	filePath: string,
	stabilitySeconds: number = 30,
): Promise<boolean> {
	const stats = fs.statSync(filePath);
	const currentSize = stats.size;
	const now = Date.now();

	const cached = fileSizeCache.get(filePath);

	if (!cached) {
		// Primeira verificação
		fileSizeCache.set(filePath, {
			path: filePath,
			size: currentSize,
			timestamp: now,
		});
		return false;
	}

	// Tamanho mudou?
	if (cached.size !== currentSize) {
		// Atualizar cache
		fileSizeCache.set(filePath, {
			path: filePath,
			size: currentSize,
			timestamp: now,
		});
		return false;
	}

	// Tamanho igual por X segundos?
	const secondsUnchanged = (now - cached.timestamp) / 1000;

	if (secondsUnchanged >= stabilitySeconds) {
		// Arquivo estável!
		fileSizeCache.delete(filePath); // Limpar cache
		return true;
	}

	return false;
}

// Uso:
setInterval(async () => {
	for (const file of detectedFiles) {
		if (await isFileStable(file, 30)) {
			console.log(`✅ Arquivo estável (30s): ${file}`);
			await fileProcessor.processVideo(file);
			detectedFiles.delete(file);
		}
	}
}, 5000); // Verifica a cada 5s
```

**Vantagens:**

- ✅ Muito confiável (sem lock issues)
- ✅ Simples de entender
- ✅ Funciona em qualquer OS

---

## 🎯 Recomendação Final

```
┌─────────────────────────────────────────────────┐
│ Você usa Sonarr/Radarr?                          │
│                                                  │
│ ✅ SIM  → Opção A: Webhook Sonarr/Radarr         │
│          (Melhor solução, 100% confiável)       │
│                                                  │
│ ❌ NÃO   → Combinação:                            │
│          • Opção B: qBittorrent API (primário)  │
│          • Opção D: File lock check (backup)    │
│          • Opção E: Size stability (fallback)   │
└─────────────────────────────────────────────────┘
```

**Implementação Híbrida Recomendada:**

```typescript
// src/main/services/FileDetector.ts
export class FileDetector {
	async isFileSafeToProcess(filePath: string): Promise<boolean> {
		// 1. Verificar se veio do qBittorrent (se integração ativa)
		if (this.qbitIntegration) {
			const torrent = await this.qbitClient.findTorrentByFile(filePath);
			if (torrent) {
				return torrent.state === 'complete'; // qBit garante hash OK
			}
		}

		// 2. Verificar lock de arquivo
		if (!(await isFileComplete(filePath))) {
			console.log(`⏳ Arquivo ainda sendo escrito: ${filePath}`);
			return false;
		}

		// 3. Verificar estabilidade de tamanho
		if (!(await isFileStable(filePath, 30))) {
			console.log(`⏳ Arquivo instável (tamanho mudando): ${filePath}`);
			return false;
		}

		// 4. Todas as verificações passaram
		console.log(`✅ Arquivo seguro para processar: ${filePath}`);
		return true;
	}
}
```

---

## �📱 1. Dashboard Remoto (Web Interface)

### Arquitetura

```
Electron App
├─ Main Process (Node.js)
│  └─ Express.js Server (porta 3030)
│     ├─ REST API
│     ├─ WebSocket (real-time)
│     └─ Static Files (React build)
└─ Renderer Process (interface desktop)

Celular/Tablet
└─ Browser (http://192.168.1.100:3030)
   └─ React Web App (mesma UI do desktop)
```

### Implementação

```typescript
// src/main/server/WebServer.ts
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import jwt from 'jsonwebtoken';

export class WebServer {
	private app: express.Application;
	private httpServer: any;
	private io: SocketIOServer;
	private port = 3030;

	constructor() {
		this.app = express();
		this.httpServer = createServer(this.app);
		this.io = new SocketIOServer(this.httpServer, {
			cors: {
				origin: '*', // Em produção, especificar domínios
				methods: ['GET', 'POST'],
			},
		});

		this.setupMiddleware();
		this.setupRoutes();
		this.setupWebSocket();
	}

	private setupMiddleware() {
		// Body parser
		this.app.use(express.json());

		// CORS
		this.app.use((req, res, next) => {
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
			res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			next();
		});

		// Autenticação JWT
		this.app.use('/api', this.authMiddleware);

		// Static files (React build)
		this.app.use(express.static(path.join(__dirname, '../../web-build')));
	}

	private authMiddleware(req: any, res: any, next: any) {
		// Permitir login sem auth
		if (req.path === '/auth/login') return next();

		const token = req.headers.authorization?.replace('Bearer ', '');
		if (!token) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		try {
			const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
			req.user = decoded;
			next();
		} catch (error) {
			return res.status(401).json({ error: 'Invalid token' });
		}
	}

	private setupRoutes() {
		// ============================================================
		// AUTH
		// ============================================================

		this.app.post('/api/auth/login', (req, res) => {
			const { password } = req.body;

			// Comparar com senha salva no database
			const savedPassword = db.get(
				'SELECT value FROM config WHERE key = ?',
				'web_password',
			);

			if (password === savedPassword?.value) {
				const token = jwt.sign(
					{ userId: 1 },
					process.env.JWT_SECRET || 'secret',
					{ expiresIn: '7d' },
				);

				res.json({ token });
			} else {
				res.status(401).json({ error: 'Invalid password' });
			}
		});

		// ============================================================
		// FILES
		// ============================================================

		// Listar arquivos
		this.app.get('/api/files', async (req, res) => {
			const files = db.all(`
        SELECT id, file_path, status, progress_percentage, 
               created_at, completed_at, error_message
        FROM files
        ORDER BY created_at DESC
        LIMIT 50
      `);

			res.json({ files });
		});

		// Detalhes de um arquivo
		this.app.get('/api/files/:id', async (req, res) => {
			const file = db.get('SELECT * FROM files WHERE id = ?', req.params.id);

			if (!file) {
				return res.status(404).json({ error: 'File not found' });
			}

			res.json({ file });
		});

		// Reprocessar arquivo manualmente
		this.app.post('/api/files/:id/retry', async (req, res) => {
			const fileId = req.params.id;

			// Adicionar arquivo de volta na fila
			await fileProcessor.retryFile(fileId);

			res.json({ success: true, message: 'File added to queue' });
		});

		// Deletar arquivo do histórico
		this.app.delete('/api/files/:id', async (req, res) => {
			db.run('DELETE FROM files WHERE id = ?', req.params.id);
			res.json({ success: true });
		});

		// ============================================================
		// STATS
		// ============================================================

		this.app.get('/api/stats', async (req, res) => {
			const stats = {
				total: db.get('SELECT COUNT(*) as count FROM files')?.count || 0,
				completed:
					db.get(
						'SELECT COUNT(*) as count FROM files WHERE status = "completed"',
					)?.count || 0,
				failed:
					db.get('SELECT COUNT(*) as count FROM files WHERE status = "failed"')
						?.count || 0,
				processing:
					db.get(
						'SELECT COUNT(*) as count FROM files WHERE status = "processing"',
					)?.count || 0,
				queue:
					db.get('SELECT COUNT(*) as count FROM files WHERE status = "pending"')
						?.count || 0,
			};

			// Taxa de sucesso
			stats.successRate =
				stats.total > 0
					? ((stats.completed / stats.total) * 100).toFixed(1)
					: 0;

			// Cache hit rate
			const cacheStats = db.get(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits
        FROM logs
        WHERE message LIKE '%translation%'
      `);

			stats.cacheHitRate =
				cacheStats?.total_requests > 0
					? ((cacheStats.cache_hits / cacheStats.total_requests) * 100).toFixed(
							1,
						)
					: 0;

			res.json(stats);
		});

		// ============================================================
		// SETTINGS
		// ============================================================

		this.app.get('/api/settings', async (req, res) => {
			const settings = db.all('SELECT key, value FROM config');
			const config = {};
			settings.forEach((s) => (config[s.key] = JSON.parse(s.value)));

			res.json({ settings: config });
		});

		this.app.put('/api/settings', async (req, res) => {
			const { settings } = req.body;

			for (const [key, value] of Object.entries(settings)) {
				db.run(
					`
          INSERT OR REPLACE INTO config (key, value)
          VALUES (?, ?)
        `,
					[key, JSON.stringify(value)],
				);
			}

			res.json({ success: true });
		});

		// ============================================================
		// LOGS
		// ============================================================

		this.app.get('/api/logs', async (req, res) => {
			const limit = parseInt(req.query.limit as string) || 100;
			const level = req.query.level as string;

			let query = 'SELECT * FROM logs';
			const params: any[] = [];

			if (level) {
				query += ' WHERE level = ?';
				params.push(level);
			}

			query += ' ORDER BY timestamp DESC LIMIT ?';
			params.push(limit);

			const logs = db.all(query, ...params);

			res.json({ logs });
		});

		// ============================================================
		// QBITTORRENT
		// ============================================================

		// Adicionar torrent
		this.app.post('/api/qbittorrent/add', async (req, res) => {
			const { magnetLink, savePath } = req.body;

			try {
				await qbittorrentClient.addTorrent(magnetLink, savePath);
				res.json({ success: true, message: 'Torrent added' });
			} catch (error) {
				res.status(500).json({ error: error.message });
			}
		});

		// Listar torrents
		this.app.get('/api/qbittorrent/torrents', async (req, res) => {
			try {
				const torrents = await qbittorrentClient.getTorrents();
				res.json({ torrents });
			} catch (error) {
				res.status(500).json({ error: error.message });
			}
		});

		// ============================================================
		// FALLBACK - Serve React app
		// ============================================================

		this.app.get('*', (req, res) => {
			res.sendFile(path.join(__dirname, '../../web-build/index.html'));
		});
	}

	private setupWebSocket() {
		this.io.on('connection', (socket) => {
			console.log('Client connected:', socket.id);

			// Enviar status inicial
			socket.emit('status', this.getStatus());

			// Desconexão
			socket.on('disconnect', () => {
				console.log('Client disconnected:', socket.id);
			});
		});

		// Broadcast de atualizações para todos os clientes conectados
		fileProcessor.on('progress', (data) => {
			this.io.emit('file:progress', data);
		});

		fileProcessor.on('complete', (data) => {
			this.io.emit('file:complete', data);
		});

		fileProcessor.on('error', (data) => {
			this.io.emit('file:error', data);
		});
	}

	private getStatus() {
		return {
			processing: fileProcessor.getCurrentFile(),
			queue: fileProcessor.getQueue(),
			stats: fileProcessor.getStats(),
		};
	}

	start() {
		this.httpServer.listen(this.port, () => {
			console.log(`🌐 Web server running on http://localhost:${this.port}`);
			console.log(
				`📱 Access from phone: http://${this.getLocalIP()}:${this.port}`,
			);
		});
	}

	private getLocalIP(): string {
		const { networkInterfaces } = require('os');
		const nets = networkInterfaces();

		for (const name of Object.keys(nets)) {
			for (const net of nets[name]) {
				// IPv4 não-loopback
				if (net.family === 'IPv4' && !net.internal) {
					return net.address;
				}
			}
		}

		return 'localhost';
	}

	broadcast(event: string, data: any) {
		this.io.emit(event, data);
	}
}
```

### Frontend (React Web App)

```tsx
// src/web/App.tsx
import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function App() {
	const [files, setFiles] = useState([]);
	const [stats, setStats] = useState({});
	const [socket, setSocket] = useState(null);

	useEffect(() => {
		// Conectar WebSocket
		const newSocket = io('http://192.168.1.100:3030', {
			auth: {
				token: localStorage.getItem('token'),
			},
		});

		newSocket.on('file:progress', (data) => {
			setFiles((prev) =>
				prev.map((f) =>
					f.id === data.id ? { ...f, progress: data.progress } : f,
				),
			);
		});

		newSocket.on('file:complete', (data) => {
			// Mostrar notificação
			showNotification('✅ Translation Complete', data.filename);
		});

		setSocket(newSocket);

		return () => newSocket.close();
	}, []);

	useEffect(() => {
		// Fetch inicial
		fetchFiles();
		fetchStats();

		// Atualizar a cada 30s
		const interval = setInterval(() => {
			fetchStats();
		}, 30000);

		return () => clearInterval(interval);
	}, []);

	async function fetchFiles() {
		const response = await fetch('http://192.168.1.100:3030/api/files', {
			headers: {
				Authorization: `Bearer ${localStorage.getItem('token')}`,
			},
		});
		const data = await response.json();
		setFiles(data.files);
	}

	async function fetchStats() {
		const response = await fetch('http://192.168.1.100:3030/api/stats', {
			headers: {
				Authorization: `Bearer ${localStorage.getItem('token')}`,
			},
		});
		const data = await response.json();
		setStats(data);
	}

	async function addTorrent(magnetLink: string) {
		await fetch('http://192.168.1.100:3030/api/qbittorrent/add', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${localStorage.getItem('token')}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ magnetLink }),
		});
	}

	return (
		<div className="p-4">
			{/* Stats Cards */}
			<div className="grid grid-cols-2 gap-4 mb-6">
				<div className="bg-white p-4 rounded shadow">
					<div className="text-sm text-gray-600">Total</div>
					<div className="text-3xl font-bold">{stats.total}</div>
				</div>
				<div className="bg-green-100 p-4 rounded shadow">
					<div className="text-sm text-gray-600">Completed</div>
					<div className="text-3xl font-bold text-green-600">
						{stats.completed}
					</div>
				</div>
			</div>

			{/* Processing */}
			{files
				.filter((f) => f.status === 'processing')
				.map((file) => (
					<div key={file.id} className="bg-blue-50 p-4 rounded mb-4">
						<div className="font-semibold">{file.file_path}</div>
						<div className="w-full bg-gray-200 rounded-full h-2 mt-2">
							<div
								className="bg-blue-600 h-2 rounded-full transition-all"
								style={{ width: `${file.progress_percentage}%` }}
							/>
						</div>
						<div className="text-sm text-gray-600 mt-1">
							{file.progress_percentage}%
						</div>
					</div>
				))}

			{/* Queue */}
			<div className="mt-6">
				<h3 className="font-bold mb-2">Queue</h3>
				{files
					.filter((f) => f.status === 'pending')
					.map((file) => (
						<div key={file.id} className="bg-gray-50 p-3 rounded mb-2">
							{file.file_path}
						</div>
					))}
			</div>

			{/* Add Torrent */}
			<div className="fixed bottom-4 right-4">
				<button
					className="bg-blue-600 text-white p-4 rounded-full shadow-lg"
					onClick={() => {
						const magnet = prompt('Magnet link:');
						if (magnet) addTorrent(magnet);
					}}
				>
					➕ Add Torrent
				</button>
			</div>
		</div>
	);
}
```

### Acesso Remoto pela Internet

**Opção 1: Cloudflare Tunnel (GRÁTIS e SEGURO)**

```bash
# Instalar cloudflared
npm install -g cloudflared

# Criar túnel
cloudflared tunnel --url http://localhost:3030

# Resultado: https://random-name.trycloudflare.com
# Acessível de qualquer lugar!
```

**Opção 2: Ngrok (GRÁTIS com limite)**

```typescript
// src/main/server/tunnel.ts
import ngrok from 'ngrok';

export async function createTunnel(port: number) {
	const url = await ngrok.connect({
		addr: port,
		authtoken: process.env.NGROK_TOKEN,
	});

	console.log(`🌍 Public URL: ${url}`);

	// Enviar URL via notificação mobile
	await sendPushNotification('LegendAI Online', `Access: ${url}`);

	return url;
}
```

**Opção 3: Tailscale (VPN privada, GRÁTIS)**

```bash
# Instalar Tailscale no PC e celular
# Criar rede privada virtual
# Acessar: http://100.64.x.x:3030
# Sem expor na internet pública!
```

---

## 📬 2. Notificações Mobile

### Opção A: Pushover (Recomendado)

**Custo:** $4.99 uma vez (vitalício)  
**Pros:** Apps nativos iOS/Android, prioridades, sons customizados  
**Cons:** Pago (mas barato)

```typescript
// src/main/services/PushoverNotifier.ts
import axios from 'axios';

export class PushoverNotifier {
	private apiToken = process.env.PUSHOVER_API_TOKEN;
	private userKey = process.env.PUSHOVER_USER_KEY;

	async send(
		title: string,
		message: string,
		options?: {
			priority?: number; // -2 a 2
			sound?: string; // pushover, bike, bugle, etc
			url?: string;
			url_title?: string;
		},
	) {
		try {
			await axios.post('https://api.pushover.net/1/messages.json', {
				token: this.apiToken,
				user: this.userKey,
				title,
				message,
				...options,
			});

			console.log(`📬 Pushover sent: ${title}`);
		} catch (error) {
			console.error('Pushover error:', error.message);
		}
	}

	async sendTranslationComplete(filename: string) {
		await this.send('✅ Translation Complete', filename, {
			priority: 0, // Normal
			sound: 'magic',
			url: `http://your-plex-url/`,
			url_title: 'Open Plex',
		});
	}

	async sendError(filename: string, error: string) {
		await this.send('❌ Translation Failed', `${filename}\n\nError: ${error}`, {
			priority: 1, // Alta prioridade
			sound: 'siren',
		});
	}
}
```

### Opção B: Telegram Bot (GRÁTIS)

```typescript
// src/main/services/TelegramNotifier.ts
import TelegramBot from 'node-telegram-bot-api';

export class TelegramNotifier {
	private bot: TelegramBot;
	private chatId = process.env.TELEGRAM_CHAT_ID;

	constructor() {
		this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
			polling: false,
		});
	}

	async send(message: string) {
		try {
			await this.bot.sendMessage(this.chatId, message, {
				parse_mode: 'Markdown',
			});
		} catch (error) {
			console.error('Telegram error:', error.message);
		}
	}

	async sendTranslationComplete(filename: string, duration: string) {
		await this.send(
			`
✅ *Translation Complete*

📁 ${filename}
⏱️ ${duration}
🎬 Ready to watch on Plex!
    `.trim(),
		);
	}

	async sendWithButtons(message: string, buttons: any[]) {
		await this.bot.sendMessage(this.chatId, message, {
			reply_markup: {
				inline_keyboard: buttons,
			},
		});
	}

	// Comandos interativos
	setupCommands() {
		this.bot.onText(/\/status/, async (msg) => {
			const stats = await getStats();
			await this.send(
				`
📊 *LegendAI Status*

Processing: ${stats.processing}
Queue: ${stats.queue}
Completed Today: ${stats.completedToday}
      `.trim(),
			);
		});

		this.bot.onText(/\/add (.+)/, async (msg, match) => {
			const magnetLink = match[1];
			await qbittorrentClient.addTorrent(magnetLink);
			await this.send('✅ Torrent added!');
		});
	}
}
```

### Opção C: Ntfy.sh (GRÁTIS e Open Source)

```typescript
// src/main/services/NtfyNotifier.ts
import axios from 'axios';

export class NtfyNotifier {
	private topic = 'legendai-' + process.env.USER_ID; // Tópico único

	async send(
		title: string,
		message: string,
		options?: {
			priority?: number; // 1-5
			tags?: string[]; // ['movie', 'white_check_mark']
			click?: string; // URL ao clicar
		},
	) {
		try {
			await axios.post(`https://ntfy.sh/${this.topic}`, message, {
				headers: {
					Title: title,
					Priority: options?.priority || 3,
					Tags: options?.tags?.join(',') || '',
					Click: options?.click || '',
				},
			});
		} catch (error) {
			console.error('Ntfy error:', error.message);
		}
	}

	async sendTranslationComplete(filename: string) {
		await this.send('Translation Complete', filename, {
			priority: 4,
			tags: ['white_check_mark', 'movie'],
			click: 'https://your-plex-url',
		});
	}
}

// No celular: instalar app Ntfy.sh e assinar tópico "legendai-USER_ID"
```

### Comparação de Notificações

| Solução      | Custo           | Pros                            | Cons                  |
| ------------ | --------------- | ------------------------------- | --------------------- |
| **Pushover** | $4.99 vitalício | Apps nativos, sons, prioridades | Pago                  |
| **Telegram** | Grátis          | Comandos interativos, mídia     | Precisa Telegram      |
| **Ntfy.sh**  | Grátis          | Open source, sem conta          | App menos polido      |
| **Discord**  | Grátis          | Já usa Discord                  | Menos mobile-friendly |

---

## 🌊 3. Integração qBittorrent

### API do qBittorrent

qBittorrent tem **Web API completa** (quando Web UI está ativado).

```typescript
// src/main/services/QBittorrentClient.ts
import axios from 'axios';
import { Cookie } from 'tough-cookie';

export class QBittorrentClient {
	private baseURL = 'http://localhost:8080'; // Porta padrão do qBit
	private username = 'admin';
	private password = 'adminadmin';
	private cookie: string | null = null;

	/**
	 * Login no qBittorrent
	 */
	async login() {
		try {
			const response = await axios.post(
				`${this.baseURL}/api/v2/auth/login`,
				new URLSearchParams({
					username: this.username,
					password: this.password,
				}),
				{
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				},
			);

			// Salvar cookie de sessão
			this.cookie = response.headers['set-cookie']?.[0].split(';')[0] || null;

			console.log('✅ qBittorrent authenticated');
			return true;
		} catch (error) {
			console.error('❌ qBittorrent login failed:', error.message);
			return false;
		}
	}

	/**
	 * Adicionar torrent (magnet ou .torrent file)
	 */
	async addTorrent(magnetOrFile: string, savePath?: string) {
		if (!this.cookie) await this.login();

		const formData = new URLSearchParams();
		formData.append('urls', magnetOrFile);
		if (savePath) formData.append('savepath', savePath);

		await axios.post(`${this.baseURL}/api/v2/torrents/add`, formData, {
			headers: {
				Cookie: this.cookie,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		console.log('✅ Torrent added:', magnetOrFile.substring(0, 50));
	}

	/**
	 * Listar todos os torrents
	 */
	async getTorrents(filter?: 'all' | 'downloading' | 'completed' | 'active') {
		if (!this.cookie) await this.login();

		const response = await axios.get(`${this.baseURL}/api/v2/torrents/info`, {
			headers: { Cookie: this.cookie },
			params: { filter: filter || 'all' },
		});

		return response.data;
	}

	/**
	 * Monitorar torrents que completaram
	 */
	async watchForCompletedTorrents(callback: (torrent: any) => void) {
		let knownTorrents = new Set();

		setInterval(async () => {
			try {
				const torrents = await this.getTorrents('completed');

				for (const torrent of torrents) {
					// Novo torrent completado
					if (!knownTorrents.has(torrent.hash)) {
						knownTorrents.add(torrent.hash);

						// Verificar se completou recentemente (últimos 5 min)
						const completionTime = torrent.completion_on * 1000; // Unix timestamp
						const now = Date.now();

						if (now - completionTime < 300000) {
							// 5 min
							console.log('🎉 Torrent completed:', torrent.name);
							callback(torrent);
						}
					}
				}
			} catch (error) {
				console.error('qBittorrent watch error:', error.message);
			}
		}, 10000); // Verifica a cada 10 segundos
	}

	/**
	 * Pausar torrent
	 */
	async pauseTorrent(hash: string) {
		if (!this.cookie) await this.login();

		await axios.post(
			`${this.baseURL}/api/v2/torrents/pause`,
			new URLSearchParams({ hashes: hash }),
			{ headers: { Cookie: this.cookie } },
		);
	}

	/**
	 * Retomar torrent
	 */
	async resumeTorrent(hash: string) {
		if (!this.cookie) await this.login();

		await axios.post(
			`${this.baseURL}/api/v2/torrents/resume`,
			new URLSearchParams({ hashes: hash }),
			{ headers: { Cookie: this.cookie } },
		);
	}

	/**
	 * Deletar torrent
	 */
	async deleteTorrent(hash: string, deleteFiles: boolean = false) {
		if (!this.cookie) await this.login();

		await axios.post(
			`${this.baseURL}/api/v2/torrents/delete`,
			new URLSearchParams({
				hashes: hash,
				deleteFiles: deleteFiles.toString(),
			}),
			{ headers: { Cookie: this.cookie } },
		);
	}

	/**
	 * Obter informações de um torrent específico
	 */
	async getTorrentInfo(hash: string) {
		if (!this.cookie) await this.login();

		const response = await axios.get(
			`${this.baseURL}/api/v2/torrents/properties`,
			{
				headers: { Cookie: this.cookie },
				params: { hash },
			},
		);

		return response.data;
	}
}
```

### Integração Completa

```typescript
// src/main/services/TorrentWatcher.ts
import { QBittorrentClient } from './QBittorrentClient';
import { FileProcessor } from './FileProcessor';
import { PushoverNotifier } from './PushoverNotifier';

export class TorrentWatcher {
	private qbitClient: QBittorrentClient;
	private fileProcessor: FileProcessor;
	private notifier: PushoverNotifier;

	constructor() {
		this.qbitClient = new QBittorrentClient();
		this.fileProcessor = new FileProcessor();
		this.notifier = new PushoverNotifier();
	}

	async start() {
		console.log('🌊 Starting torrent watcher...');

		// Autenticar no qBittorrent
		const authenticated = await this.qbitClient.login();
		if (!authenticated) {
			throw new Error('Failed to authenticate with qBittorrent');
		}

		// Monitorar torrents completados
		this.qbitClient.watchForCompletedTorrents(async (torrent) => {
			console.log(`📥 Torrent completed: ${torrent.name}`);

			// Notificar usuário
			await this.notifier.send('📥 Download Complete', torrent.name, {
				priority: 0,
				sound: 'incoming',
			});

			// Processar automaticamente
			await this.processTorrentFiles(torrent);
		});
	}

	async processTorrentFiles(torrent: any) {
		// Obter caminho salvo
		const info = await this.qbitClient.getTorrentInfo(torrent.hash);
		const savePath = info.save_path;

		// Buscar arquivos .mkv/.mp4/.avi no diretório
		const videoFiles = await this.findVideoFiles(savePath);

		for (const videoFile of videoFiles) {
			console.log(`🎬 Processing video: ${videoFile}`);

			try {
				// Extrair + traduzir
				await this.fileProcessor.processVideo(videoFile);

				// Notificar sucesso
				await this.notifier.send(
					'✅ Translation Complete',
					path.basename(videoFile),
					{
						priority: 0,
						sound: 'magic',
						url: 'http://your-plex-url',
						url_title: 'Open Plex',
					},
				);
			} catch (error) {
				console.error(`❌ Processing failed: ${error.message}`);

				await this.notifier.send(
					'❌ Translation Failed',
					`${path.basename(videoFile)}\n\nError: ${error.message}`,
					{ priority: 1, sound: 'siren' },
				);
			}
		}
	}

	async findVideoFiles(directory: string): Promise<string[]> {
		const fs = require('fs').promises;
		const path = require('path');

		const files: string[] = [];

		async function scan(dir: string) {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				if (entry.isDirectory()) {
					await scan(fullPath);
				} else if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase();
					if (['.mkv', '.mp4', '.avi', '.mov'].includes(ext)) {
						files.push(fullPath);
					}
				}
			}
		}

		await scan(directory);
		return files;
	}
}
```

---

## 🎯 Fluxo Completo Automatizado

```
1. 📱 VOCÊ (no trabalho)
   └─ Abre app Telegram/Pushover
   └─ Envia: /add magnet:?xt=urn:btih:...Breaking.Bad.S05E16

2. 🌐 INTERNET
   └─ Mensagem chega no bot

3. 💻 PC (em casa)
   └─ LegendAI recebe comando
   └─ Adiciona torrent no qBittorrent via API
   └─ Notifica: "📥 Torrent added: Breaking Bad S05E16"

4. 🌊 QBITTORRENT
   └─ Baixa torrent (1.2 GB)
   └─ Completa download em 15 minutos

5. 👁️ LEGENDAI (detecta via API polling)
   └─ Notifica: "📥 Download complete: Breaking Bad S05E16"
   └─ Inicia processamento automático

6. 🎬 EXTRAÇÃO
   └─ FFprobe detecta streams
   └─ Extrai legenda em inglês → .srt
   └─ Notifica: "📤 Subtitle extracted"

7. 🌐 TRADUÇÃO
   └─ 485 linhas → 50 chunks
   └─ Gemini API traduz (3 min)
   └─ Salva Breaking.Bad.S05E16_pt.srt
   └─ Notifica: "✅ Translation complete!"

8. 📺 PLEX
   └─ Detecta novo arquivo automaticamente
   └─ Atualiza metadata

9. 📱 VOCÊ (recebe notificação)
   └─ "✅ Breaking Bad S05E16 pronto!"
   └─ [Open Plex] ← clica no botão
   └─ Assiste com esposa 🎉
```

---

## 🔒 Segurança

### 1. Autenticação JWT

```typescript
// Usuário faz login uma vez
POST /api/auth/login
{ "password": "sua-senha-forte" }

// Recebe token
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }

// Usa token em todas as requisições
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. HTTPS com Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3030
# Retorna: https://random-name.trycloudflare.com
# Tráfego criptografado automaticamente!
```

### 3. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 min
	max: 100, // Max 100 requests
});

app.use('/api', limiter);
```

### 4. CORS Restritivo

```typescript
app.use(
	cors({
		origin: ['https://your-domain.com', 'https://random.trycloudflare.com'],
		credentials: true,
	}),
);
```

---

## 📊 Comparação de Soluções

### Acesso Remoto

| Solução               | Custo       | Segurança  | Setup       | Latência    |
| --------------------- | ----------- | ---------- | ----------- | ----------- |
| **Cloudflare Tunnel** | Grátis      | ⭐⭐⭐⭐⭐ | Fácil       | Baixa       |
| **Ngrok**             | Grátis/Pago | ⭐⭐⭐⭐   | Muito fácil | Baixa       |
| **Tailscale**         | Grátis      | ⭐⭐⭐⭐⭐ | Fácil       | Muito baixa |
| **Port Forward**      | Grátis      | ⭐⭐       | Difícil     | Muito baixa |

### Notificações

| Solução      | Custo  | Qualidade  | Interatividade |
| ------------ | ------ | ---------- | -------------- |
| **Pushover** | $4.99  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         |
| **Telegram** | Grátis | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐     |
| **Ntfy.sh**  | Grátis | ⭐⭐⭐     | ⭐⭐⭐         |
| **Discord**  | Grátis | ⭐⭐⭐⭐   | ⭐⭐⭐⭐       |

---

## 🗺️ Roadmap de Implementação

### Fase 3 (Semana 3) - Web Dashboard

- [ ] Express.js server no Electron
- [ ] REST API (files, stats, settings)
- [ ] WebSocket para updates em tempo real
- [ ] JWT authentication
- [ ] React web app (mesma UI do desktop)
- [ ] Build static do React incluído no instalador
- [ ] Testes no celular (WiFi local)

### Fase 4 (Semana 4) - Acesso Remoto

- [ ] Cloudflare Tunnel integration
- [ ] Ngrok como alternativa
- [ ] HTTPS automático
- [ ] QR Code no settings para acesso rápido

### Fase 5 (Semana 5) - Notificações Mobile

- [ ] Pushover integration
- [ ] Telegram bot
- [ ] Ntfy.sh como alternativa grátis
- [ ] Configuração de preferências (qual usar)
- [ ] Templates de mensagens customizáveis

### Fase 6 (Semana 6) - qBittorrent Integration

- [ ] QBittorrentClient completo
- [ ] Polling de torrents completados
- [ ] Adicionar torrents via API
- [ ] Dashboard mostrando torrents ativos
- [ ] Auto-processing ao completar download

### Fase 7 (Semana 7) - Comandos Remotos

- [ ] Telegram commands (/add, /status, /pause, /resume)
- [ ] Web interface para adicionar torrents
- [ ] Integração com Jackett/Prowlarr (busca de torrents)
- [ ] Push de magnet links do celular

---

## 💡 Extras: Integrações Avançadas

### Sonarr/Radarr Integration

```typescript
// Usar Sonarr/Radarr para gerenciar séries/filmes
// LegendAI apenas traduz as legendas
// Melhor dos dois mundos!

class SonarrClient {
	async getRecentlyDownloaded() {
		// Buscar episódios baixados recentemente
		// Processar legendas automaticamente
	}
}
```

### Plex Webhooks

```typescript
// Plex pode notificar quando adiciona novo item
app.post('/api/plex/webhook', (req, res) => {
	const { event, Metadata } = req.body;

	if (event === 'library.new') {
		// Novo item adicionado
		// Verificar se tem legenda, senão processar
	}
});
```

### Voice Commands (Google Home / Alexa)

```typescript
// IFTTT integration
// "Ok Google, adicionar Breaking Bad S05E16"
// → Webhook → LegendAI → qBittorrent
```

---

## ✅ Resumo

### É Possível? **SIM!** ✅

Todas as 3 integrações são **100% viáveis**:

1. ✅ **Dashboard remoto**: Express.js + React + WebSocket
2. ✅ **Notificações mobile**: Pushover/Telegram/Ntfy.sh
3. ✅ **qBittorrent**: API completa disponível

### Custo Total

```
Dashboard remoto: $0 (Cloudflare Tunnel grátis)
Notificações: $0 (Telegram/Ntfy) ou $4.99 (Pushover vitalício)
qBittorrent API: $0 (nativo)

TOTAL: $0 a $5 (uma vez)
```

### Esforço

| Feature             | Complexidade | Tempo Estimado |
| ------------------- | ------------ | -------------- |
| Web Dashboard       | Média        | 3-4 dias       |
| WebSocket real-time | Média        | 1 dia          |
| Acesso remoto       | Fácil        | 1 dia          |
| Notificações        | Fácil        | 1-2 dias       |
| qBittorrent API     | Média        | 2-3 dias       |
| **TOTAL**           | -            | **2 semanas**  |

### Vale a Pena?

**MUITO!** 🚀

Com essas integrações você terá:

- ✅ Controle total do celular
- ✅ Netflix pessoal 100% automatizada
- ✅ Notificações quando legendas ficarem prontas
- ✅ Adicionar torrents remotamente
- ✅ Esposa feliz assistindo em PT-BR 😊

---

**Próximo passo:** Implementar MVP desktop primeiro (Fases 1-2), depois adicionar web dashboard e integrações (Fases 3-6).

**Última atualização:** 3 de março de 2026  
**Status:** Totalmente viável e bem documentado ✅
