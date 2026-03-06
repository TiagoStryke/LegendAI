'use client';

import {
	clearTranslationCache,
	getCacheProgress,
	initializeCache,
	saveChunkToCache,
} from '@/lib/cache';
import type { ParsedSubtitle } from '@/lib/srt';
import {
	buildSRT,
	chunkSubtitles,
	parseSRT,
	sampleValidation,
} from '@/lib/srt';
import React, { FormEvent, useEffect, useState } from 'react';

interface FileTranslationState {
	id: string;
	file: File;
	status:
		| 'pending'
		| 'translating'
		| 'quota_error'
		| 'retry'
		| 'complete'
		| 'error'
		| 'keep_alive';
	translated: number;
	total: number;
	percentage: number;
	currentChunk?: number;
	totalChunks?: number;
	message: string;
	retryAfter?: number;
	result?: string;
}

interface TranslationState {
	status:
		| 'idle'
		| 'translating'
		| 'quota_error'
		| 'retry'
		| 'complete'
		| 'error'
		| 'keep_alive';
	translated: number;
	total: number;
	percentage: number;
	currentChunk?: number;
	totalChunks?: number;
	message: string;
	retryAfter?: number;
	result?: string;
}

function classNames(...classes: any[]) {
	return classes.filter(Boolean).join(' ');
}

const LANGUAGES = ['Brazilian Portuguese'];

const SrtForm: React.FC = () => {
	const [files, setFiles] = useState<FileTranslationState[]>([]);
	const [language, setLanguage] = useState<string>('Brazilian Portuguese');
	const [apiKey, setApiKey] = useState<string>('');
	const [showApiKey, setShowApiKey] = useState<boolean>(false);
	const [dragging, setDragging] = useState<boolean>(false);
	const [isProcessing, setIsProcessing] = useState<boolean>(false);
	const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
	const [wakeLock, setWakeLock] = useState<any>(null); // WakeLockSentinel

	// ===== WAKE LOCK: Mantém PC acordado SEMPRE enquanto site estiver aberto =====
	useEffect(() => {
		const requestWakeLock = async () => {
			try {
				if ('wakeLock' in navigator && (navigator as any).wakeLock) {
					const lock = await (navigator as any).wakeLock.request('screen');
					setWakeLock(lock);
					console.log('💤 Wake Lock ATIVADO - PC não vai entrar em sleep');

					// Re-ativar automaticamente se for liberado (ex: aba perde foco e recupera)
					lock.addEventListener('release', () => {
						console.log(
							'💤 Wake Lock liberado (aba perdeu foco), tentando reativar...',
						);
						setWakeLock(null);
					});
				}
			} catch (err) {
				console.error('❌ Erro ao ativar Wake Lock:', err);
				// Tentar novamente em 5 segundos
				setTimeout(requestWakeLock, 5000);
			}
		};

		// Ativar Wake Lock assim que página carrega
		requestWakeLock();

		// Listener de visibilidade: reativa quando aba volta ao foco
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible' && !wakeLock) {
				console.log('👁️ Aba voltou ao foco, reativando Wake Lock...');
				requestWakeLock();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Cleanup: libera o lock quando o componente desmonta (página fecha)
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (wakeLock) {
				wakeLock.release().catch(() => {});
				console.log('💤 Wake Lock DESATIVADO - página fechada');
			}
		};
	}, []); // Executa apenas uma vez ao montar

	// Load API key from localStorage on mount
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const savedKey = localStorage.getItem('gemini_api_key');
			if (savedKey) {
				setApiKey(savedKey);
			}
		}
	}, []);

	// Save API key to localStorage when it changes
	const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newKey = e.target.value;
		setApiKey(newKey);
		if (typeof window !== 'undefined') {
			localStorage.setItem('gemini_api_key', newKey);
		}
	};

	const readFileContents = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result) {
					resolve(e.target.result as string);
				} else {
					reject(new Error('Failed to read file'));
				}
			};
			reader.onerror = reject;
			reader.readAsText(file);
		});
	};

	const handleFileSelect = (selectedFiles: FileList | null) => {
		if (!selectedFiles || selectedFiles.length === 0) return;

		const newFiles: FileTranslationState[] = [];

		for (let i = 0; i < selectedFiles.length; i++) {
			const file = selectedFiles[i];
			const fileExtension = file.name.split('.').pop()?.toLowerCase();

			if (fileExtension === 'srt') {
				// Verificar se arquivo já foi adicionado
				const alreadyExists = files.some(
					(f) => f.file.name === file.name && f.file.size === file.size,
				);

				if (!alreadyExists) {
					newFiles.push({
						id: `${Date.now()}-${i}`,
						file,
						status: 'pending',
						translated: 0,
						total: 0,
						percentage: 0,
						message: 'Waiting to translate...',
					});
				}
			} else {
				alert(`Skipped ${file.name}: Only .srt files are supported`);
			}
		}

		if (newFiles.length > 0) {
			setFiles((prev) => [...prev, ...newFiles]);
		}
	};

	const updateFileState = (
		fileId: string,
		updates: Partial<FileTranslationState>,
	) => {
		setFiles((prev) =>
			prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f)),
		);
	};

	const processNextFile = async () => {
		// Encontrar próximo arquivo pendente
		const nextFileIndex = files.findIndex((f) => f.status === 'pending');

		if (nextFileIndex === -1) {
			// Não há mais arquivos pendentes
			setIsProcessing(false);
			setCurrentFileIndex(-1);
			return;
		}

		setCurrentFileIndex(nextFileIndex);
		const fileState = files[nextFileIndex];

		await translateFile(fileState);

		// Processar próximo arquivo
		setTimeout(() => processNextFile(), 1000);
	};

	const translateFile = async (fileState: FileTranslationState) => {
		if (!apiKey.trim()) {
			updateFileState(fileState.id, {
				status: 'error',
				message: 'API key is required',
			});
			return;
		}

		try {
			// Step 1: Read and parse SRT file
			const content = await readFileContents(fileState.file);
			const subtitles = parseSRT(content);

			if (subtitles.length === 0) {
				throw new Error('No subtitles found in file');
			}

			// Step 2: Chunk subtitles into groups of 100 (REVOLUTIONARY IMPROVEMENT!)
			// SRT format + auto-correction = 100% reliability with 6.5x speed boost 🚀
			const CHUNK_SIZE = 100;
			const chunks = chunkSubtitles(subtitles, CHUNK_SIZE);
			const totalChunks = chunks.length;

			console.log(
				`📦 Chunked ${subtitles.length} subtitles into ${totalChunks} chunks`,
			);

			// Step 3: Initialize or get existing cache
			const cache = initializeCache(
				fileState.id,
				fileState.file.name,
				language,
				totalChunks,
				subtitles.length,
			);

			const cachedProgress = getCacheProgress(fileState.id);
			if (cachedProgress > 0) {
				console.log(
					`💾 Found cached progress: ${cachedProgress}% (${Object.keys(cache.translatedChunks).length}/${totalChunks} chunks)`,
				);
				updateFileState(fileState.id, {
					status: 'translating',
					message: `Resuming from ${cachedProgress}% (found ${Object.keys(cache.translatedChunks).length} cached chunks)`,
					percentage: cachedProgress,
					currentChunk: Object.keys(cache.translatedChunks).length,
					totalChunks,
				});
			}

			// Step 4: Translate missing chunks
			const translatedSubtitles: ParsedSubtitle[] = new Array(subtitles.length);

			for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
				// Check if chunk is already cached
				if (cache.translatedChunks[chunkIndex]) {
					console.log(
						`✅ Chunk ${chunkIndex + 1}/${totalChunks} - using cache`,
					);
					const cachedChunk = cache.translatedChunks[chunkIndex];
					// Copy cached chunk to result array
					cachedChunk.forEach((sub) => {
						translatedSubtitles[sub.index - 1] = sub;
					});

					// Update progress
					const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
					updateFileState(fileState.id, {
						status: 'translating',
						percentage: progress,
						currentChunk: chunkIndex + 1,
						totalChunks,
						translated: (chunkIndex + 1) * CHUNK_SIZE,
						total: subtitles.length,
						message: `Using cached chunk ${chunkIndex + 1}/${totalChunks}`,
					});
					continue;
				}

				// Translate this chunk
				console.log(`🔄 Translating chunk ${chunkIndex + 1}/${totalChunks}...`);

				updateFileState(fileState.id, {
					status: 'translating',
					message: `Translating chunk ${chunkIndex + 1}/${totalChunks}...`,
					currentChunk: chunkIndex + 1,
					totalChunks,
				});

				const chunk = chunks[chunkIndex];
				let retries = 0;
				const MAX_RETRIES = 5; // More retries for reliability
				let translatedChunk: ParsedSubtitle[] | null = null;

				while (retries < MAX_RETRIES && !translatedChunk) {
					try {
						const response = await fetch('/api/translate-chunk', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								chunk,
								targetLanguage: language,
								apiKey, // Can be multiple keys comma-separated
							filename: fileState.file.name, // For context extraction
								);
								updateFileState(fileState.id, {
									status: 'quota_error',
									message: `Rate limited. Retrying chunk ${chunkIndex + 1}/${totalChunks} in ${retryAfter}s...`,
									retryAfter,
								});
								await new Promise((resolve) =>
									setTimeout(resolve, retryAfter * 1000),
								);
								retries++;
								continue;
							}
							throw new Error(`HTTP ${response.status}`);
						}

						const data = await response.json();

						if (!data.success) {
							throw new Error(data.error || 'Translation failed');
						}

						translatedChunk = data.translatedChunk;

						if (!translatedChunk) {
							throw new Error('Empty translation result');
						}

						// Save to cache
						saveChunkToCache(fileState.id, chunkIndex, translatedChunk);
						console.log(
							`✅ Chunk ${chunkIndex + 1}/${totalChunks} translated and cached`,
						);

						// Copy to result array
						translatedChunk.forEach((sub) => {
							translatedSubtitles[sub.index - 1] = sub;
						});

						// Update progress
						const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
						updateFileState(fileState.id, {
							status: 'translating',
							percentage: progress,
							currentChunk: chunkIndex + 1,
							totalChunks,
							translated: (chunkIndex + 1) * CHUNK_SIZE,
							total: subtitles.length,
							message: `Translated chunk ${chunkIndex + 1}/${totalChunks}`,
						});

						// More conservative delay between chunks (1.2s)
						// This helps avoid hitting rate limits
						await new Promise((resolve) => setTimeout(resolve, 1200));
					} catch (error) {
						retries++;
						console.error(
							`❌ Chunk ${chunkIndex + 1} failed (attempt ${retries}/${MAX_RETRIES}):`,
							error,
						);

						if (retries >= MAX_RETRIES) {
							throw new Error(
								`Failed to translate chunk ${chunkIndex + 1} after ${MAX_RETRIES} attempts`,
							);
						}

						// More aggressive exponential backoff
						// 2s, 5s, 10s, 20s, 30s
						const backoff = Math.min(2000 * Math.pow(2, retries - 1), 30000);
						console.log(
							`⏰ Retrying chunk ${chunkIndex + 1} in ${backoff / 1000}s...`,
						);
						updateFileState(fileState.id, {
							status: 'retry',
							message: `Retrying chunk ${chunkIndex + 1}/${totalChunks} in ${backoff / 1000}s... (attempt ${retries}/${MAX_RETRIES})`,
							retryAfter: Math.round(backoff / 1000),
						});
						await new Promise((resolve) => setTimeout(resolve, backoff));
					}
				}
			}

			// Step 5: Validate timing integrity
			console.log('🔍 Validating translation integrity...');
			const validation = sampleValidation(subtitles, translatedSubtitles);

			if (!validation.valid) {
				console.error('❌ Validation failed:', validation.errors);
				throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
			}

			console.log('✅ Validation passed!');

			// Step 6: Build final SRT
			const finalSRT = buildSRT(translatedSubtitles);

			updateFileState(fileState.id, {
				status: 'complete',
				percentage: 100,
				currentChunk: totalChunks,
				totalChunks,
				translated: subtitles.length,
				total: subtitles.length,
				message: '✅ Translation complete and validated!',
				result: finalSRT,
			});

			// Clear cache after successful completion
			clearTranslationCache(fileState.id);
			console.log('🧹 Cleared cache for completed file');
		} catch (error) {
			console.error('❌ Translation error:', error);
			updateFileState(fileState.id, {
				status: 'error',
				message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			});
			// Keep cache for retry
		}
	};

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();

		if (files.length === 0) {
			alert('Please select at least one file');
			return;
		}

		if (!apiKey.trim()) {
			alert('Please enter your API key');
			return;
		}

		if (isProcessing) {
			return; // Already processing
		}

		setIsProcessing(true);
		processNextFile();
	};

	const handleDownload = (fileId: string) => {
		const fileState = files.find((f) => f.id === fileId);

		if (!fileState || !fileState.result || fileState.status !== 'complete') {
			alert('Translation result not available for this file.');
			return;
		}

		const blob = new Blob([fileState.result], {
			type: 'text/plain;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileState.file.name.replace('.srt', '.pt.srt');

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const handleRemoveFile = (fileId: string) => {
		if (isProcessing) {
			const fileState = files.find((f) => f.id === fileId);
			if (fileState && fileState.status === 'translating') {
				alert('Cannot remove file that is currently being translated');
				return;
			}
		}

		setFiles((prev) => prev.filter((f) => f.id !== fileId));
	};

	const handleClearCompleted = () => {
		setFiles((prev) => prev.filter((f) => f.status !== 'complete'));
	};

	const handleClearAll = () => {
		if (isProcessing) {
			if (
				!confirm(
					'Translation is in progress. Are you sure you want to clear all files?',
				)
			) {
				return;
			}
			setIsProcessing(false);
			setCurrentFileIndex(-1);
		}
		setFiles([]);
	};

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragging(false);

		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			handleFileSelect(e.dataTransfer.files);
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			handleFileSelect(e.target.files);
		}
	};

	return (
		<div className="flex flex-col px-4 mt-6 w-full md:px-0">
			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Step 1: File Selection */}
				<div>
					<label
						htmlFor="srt-file"
						className="block font-bold py-4 md:pl-8 text-lg text-[#444444] dark:text-gray-200"
					>
						{files.length > 0 ? '✅' : '👉'} Step 1: Select SRT Files
						<span className="block text-xs text-gray-500 dark:text-gray-400 font-normal mt-1">
							You can select multiple files at once
						</span>
					</label>
					<div
						id="srt-file"
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={handleDrop}
						className={`w-full border-2 ${
							dragging
								? 'border-blue-300 dark:border-blue-500'
								: 'border-transparent'
						} md:rounded-lg bg-[#EFEFEF] dark:bg-gray-800 px-12 relative`}
					>
						<div className="flex flex-col items-center justify-center py-12">
							<div className="text-6xl mb-4">📁</div>
							<p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
								Drag and drop your .srt files here or click to select
							</p>
							<input
								type="file"
								accept=".srt"
								multiple
								onChange={handleFileChange}
								className="hidden"
								id="file-input"
							/>
							<label
								htmlFor="file-input"
								className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded cursor-pointer transition-colors"
							>
								Select Files
							</label>
						</div>
					</div>

					{/* Files List */}
					{files.length > 0 && (
						<div className="mt-6 md:px-8">
							<div className="flex justify-between items-center mb-4">
								<h3 className="font-semibold text-gray-700 dark:text-gray-300 text-lg">
									Files ({files.length})
								</h3>
								<div className="space-x-3">
									<button
										type="button"
										onClick={handleClearCompleted}
										className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
									>
										Clear Completed
									</button>
									<button
										type="button"
										onClick={handleClearAll}
										className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors"
									>
										Clear All
									</button>
								</div>
							</div>

							<div className="space-y-3">
								{files.map((fileState) => (
									<div
										key={fileState.id}
										className={`p-4 rounded-lg border-2 transition-all ${
											fileState.status === 'complete'
												? 'border-green-400 bg-green-50 dark:bg-green-900/20'
												: fileState.status === 'translating'
													? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
													: fileState.status === 'error'
														? 'border-red-400 bg-red-50 dark:bg-red-900/20'
														: 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
										}`}
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-3 mb-2">
													{/* Status Icon */}
													{fileState.status === 'complete' && (
														<span className="text-2xl flex-shrink-0">✅</span>
													)}
													{fileState.status === 'translating' && (
														<span className="text-2xl flex-shrink-0 animate-spin">
															🔄
														</span>
													)}
													{fileState.status === 'error' && (
														<span className="text-2xl flex-shrink-0">❌</span>
													)}
													{fileState.status === 'pending' && (
														<span className="text-2xl flex-shrink-0">⏳</span>
													)}
													{(fileState.status === 'quota_error' ||
														fileState.status === 'retry') && (
														<span className="text-2xl flex-shrink-0">⏰</span>
													)}

													{/* Filename */}
													<div className="flex-1 min-w-0">
														<p className="font-medium text-gray-900 dark:text-gray-100 truncate">
															{fileState.file.name}
														</p>
														{fileState.message && (
															<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
																{fileState.message}
															</p>
														)}
													</div>
												</div>

												{/* Progress Bar */}
												{fileState.status === 'translating' && (
													<div className="mt-2">
														<div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
															<span>
																{fileState.currentChunk && fileState.totalChunks
																	? `${fileState.currentChunk}/${fileState.totalChunks} chunks`
																	: 'Processing...'}
															</span>
															<span>{fileState.percentage}%</span>
														</div>
														<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
															<div
																className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
																style={{
																	width: `${fileState.percentage}%`,
																}}
															/>
														</div>
													</div>
												)}
											</div>

											{/* Action Buttons */}
											<div className="flex items-center gap-2 flex-shrink-0">
												{fileState.status === 'complete' && (
													<button
														type="button"
														onClick={() => handleDownload(fileState.id)}
														className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded font-medium transition-colors whitespace-nowrap"
													>
														⬇️ Download
													</button>
												)}
												{fileState.status !== 'translating' && (
													<button
														type="button"
														onClick={() => handleRemoveFile(fileState.id)}
														className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
														title="Remove file"
													>
														🗑️
													</button>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Step 2: API Key */}
				<div>
					<label
						htmlFor="api-key"
						className="block font-bold py-4 md:pl-8 text-lg text-[#444444] dark:text-gray-200"
					>
						{apiKey ? '✅' : '👉'} Step 2: Enter your Google Gemini API Key(s)
						<span className="block text-xs text-gray-500 dark:text-gray-400 font-normal">
							You can enter multiple keys separated by comma:{' '}
							<code>key1,key2,key3</code>
						</span>
					</label>
					<div className="md:px-8">
						<div className="relative">
							<input
								type={showApiKey ? 'text' : 'password'}
								id="api-key"
								value={apiKey}
								onChange={handleApiKeyChange}
								placeholder="Enter one or more Gemini API keys, separated by comma..."
								className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
							<button
								type="button"
								onClick={() => setShowApiKey(!showApiKey)}
								className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
								aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
							>
								{showApiKey ? (
									// Eye slash icon (hide)
									<svg
										className="w-5 h-5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
										/>
									</svg>
								) : (
									// Eye icon (show)
									<svg
										className="w-5 h-5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
										/>
									</svg>
								)}
							</button>
						</div>

						{/* API Keys Counter */}
						{apiKey.trim() && apiKey.includes(',') && (
							<div className="mt-2 flex items-center gap-2 text-sm">
								<div className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium">
									🔑 {apiKey.split(',').filter((k) => k.trim()).length} API Keys
								</div>
								<span className="text-gray-500 dark:text-gray-400 text-xs">
									Multiple keys = better rate limits & automatic failover
								</span>
							</div>
						)}

						<p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
							Get your free API key from{' '}
							<a
								href="https://aistudio.google.com/app/apikey"
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-500 hover:text-blue-600 underline"
							>
								Google AI Studio
							</a>
							{' • '}
							<a
								href="https://aistudio.google.com/usage"
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-500 hover:text-blue-600 underline"
							>
								Check API usage
							</a>
						</p>

						{/* Multiple Keys Info */}
						<div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
							<p className="text-sm text-blue-800 dark:text-blue-200">
								<strong>💡 Pro Tip:</strong> Use multiple API keys for better
								reliability!
								<br />
								<span className="text-xs">
									The system automatically rotates between keys and puts failed
									keys on 5-minute cooldown, ensuring uninterrupted translation
									even with rate limits. Example:{' '}
									<code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">
										key1,key2,key3
									</code>
								</span>
							</p>
						</div>
					</div>
				</div>

				{/* Step 3: Language Selection */}
				<div>
					<label
						htmlFor="language"
						className="block font-bold py-4 md:pl-8 text-lg text-[#444444] dark:text-gray-200"
					>
						{language ? '✅' : '👉'} Step 3: Select Target Language
					</label>
					<div className="md:px-8">
						<select
							id="language"
							value={language}
							onChange={(e) => setLanguage(e.target.value)}
							className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						>
							{LANGUAGES.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
					</div>
				</div>

				{/* Submit Button */}
				<div className="md:px-8">
					<button
						type="submit"
						disabled={files.length === 0 || !apiKey.trim() || isProcessing}
						className={classNames(
							'w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200',
							files.length === 0 || !apiKey.trim() || isProcessing
								? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
								: 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5',
						)}
					>
						{isProcessing
							? '🔄 Processing Files...'
							: files.length === 0
								? '📁 Select Files to Translate'
								: `🚀 Translate ${files.length} File${files.length > 1 ? 's' : ''}`}
					</button>
				</div>
			</form>

			{/* Wake Lock Indicator - Show when active */}
			{wakeLock && !wakeLock.released && (
				<div className="mt-6 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
					<div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
						<span className="text-lg">💤</span>
						<span className="font-medium">
							Wake Lock active - your computer will not enter sleep mode
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

export default SrtForm;
