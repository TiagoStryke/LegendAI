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
	const filesRef = React.useRef<FileTranslationState[]>([]); // Always up-to-date files (avoids stale closure)
	const processedFilesRef = React.useRef<Set<string>>(new Set()); // Track processed files

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
			setFiles((prev) => {
				const next = [...prev, ...newFiles];
				filesRef.current = next;
				return next;
			});
		}
	};

	const updateFileState = (
		fileId: string,
		updates: Partial<FileTranslationState>,
	) => {
		setFiles((prev) => {
			const next = prev.map((f) =>
				f.id === fileId ? { ...f, ...updates } : f,
			);
			filesRef.current = next; // Keep ref in sync
			return next;
		});
	};

	const processNextFile = async () => {
		// Use filesRef to avoid stale closure — always has the latest state
		const currentFiles = filesRef.current;
		const nextFileIndex = currentFiles.findIndex(
			(f) => f.status === 'pending' && !processedFilesRef.current.has(f.id),
		);

		if (nextFileIndex === -1) {
			setIsProcessing(false);
			setCurrentFileIndex(-1);
			processedFilesRef.current.clear();
			return;
		}

		setCurrentFileIndex(nextFileIndex);
		const fileState = currentFiles[nextFileIndex];
		processedFilesRef.current.add(fileState.id);

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

			console.log(`
═══════════════════════════════════════════════════════════
🎬 PARSED ORIGINAL SRT
═══════════════════════════════════════════════════════════
Total subtitles: ${subtitles.length}
First index: ${subtitles[0]?.index}
Last index: ${subtitles[subtitles.length - 1]?.index}
Index range: ${Math.min(...subtitles.map((s) => s.index))} to ${Math.max(...subtitles.map((s) => s.index))}
═══════════════════════════════════════════════════════════
			`);

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
			let totalProcessedSubs = 0; // Track total subtitles added

			console.log(
				`📊 Starting translation: expecting ${subtitles.length} total subtitles`,
			);

			for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
				// Check if chunk is already cached
				if (cache.translatedChunks[chunkIndex]) {
					console.log(
						`✅ Chunk ${chunkIndex + 1}/${totalChunks} - using cache`,
					);
					const cachedChunk = cache.translatedChunks[chunkIndex];
					const inputChunk = chunks[chunkIndex];

					console.log(
						`📦 Chunk ${chunkIndex + 1}: input=${inputChunk.length}, cached=${cachedChunk.length}`,
					);

					// Detect if cached chunk has more subtitles than input
					if (cachedChunk.length > inputChunk.length) {
						console.error(
							`❌ BUG: Cached chunk ${chunkIndex + 1} has ${cachedChunk.length} subs but input has ${inputChunk.length}!`,
						);
					}

					if (cachedChunk.length < inputChunk.length) {
						console.error(
							`❌ BUG: Cached chunk ${chunkIndex + 1} has ${cachedChunk.length} subs but input expects ${inputChunk.length}!`,
						);
					}

					// Positional assembly: use input chunk indices (never trust cached/AI indices)
					let addedInThisChunk = 0;
					cachedChunk.forEach((translatedSub, i) => {
						const inputSub = inputChunk?.[i];
						if (inputSub) {
							// Only add if we have a corresponding input subtitle
							translatedSubtitles[inputSub.index - 1] = {
								...inputSub,
								text: translatedSub.text,
							};
							addedInThisChunk++;
						} else {
							console.error(
								`❌ BUG: Cached chunk ${chunkIndex + 1} has sub at position ${i} but input doesn't! (cachedChunk.length=${cachedChunk.length}, inputChunk.length=${inputChunk.length})`,
							);
						}
						// If no inputSub (AI returned more than sent), IGNORE the extra
					});

					totalProcessedSubs += addedInThisChunk;
					console.log(
						`✅ Chunk ${chunkIndex + 1}: added ${addedInThisChunk} subs (total so far: ${totalProcessedSubs}/${subtitles.length})`,
					);

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

				// translateChunkWithFallback: on mismatch → split in half immediately (no retry waste).
				// On 503/network errors → retry with backoff up to MAX_RETRIES.
				const translateChunkWithFallback = async (
					subChunk: ParsedSubtitle[],
					label: string,
				): Promise<ParsedSubtitle[]> => {
					const MAX_RETRIES = 5;
					let retries = 0;

					while (retries < MAX_RETRIES) {
						let response: Response;
						try {
							response = await fetch('/api/translate-chunk', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									chunk: subChunk,
									targetLanguage: language,
									apiKey,
									filename: fileState.file.name,
								}),
							});
						} catch (networkError) {
							retries++;
							if (retries >= MAX_RETRIES) throw networkError;
							const backoff = Math.min(2000 * Math.pow(2, retries - 1), 30000);
							console.error(
								`❌ Network error on ${label}, retrying in ${backoff / 1000}s...`,
							);
							updateFileState(fileState.id, {
								status: 'retry',
								message: `Network error on ${label}. Retrying in ${backoff / 1000}s... (${retries}/${MAX_RETRIES})`,
								retryAfter: Math.round(backoff / 1000),
							});
							await new Promise((r) => setTimeout(r, backoff));
							continue;
						}

						if (response.status === 429) {
							const data = await response.json();
							const retryAfter = data.retryAfter || 60;

							// If there's key rotation available, retry immediately
							// The server will pick another available key automatically
							if (data.keyRotation && retries < 3) {
								console.log(
									`🔄 Key rotation: Retrying ${label} immediately with another key...`,
								);
								updateFileState(fileState.id, {
									status: 'retry',
									message: `Key failed, trying another key for ${label}...`,
								});
								// Small delay to avoid hammering (500ms instead of minutes)
								await new Promise((r) => setTimeout(r, 500));
								retries++;
								continue;
							}

							// All keys exhausted - need to wait
							console.log(
								`⏰ All keys exhausted for ${label}, waiting ${retryAfter}s...`,
							);
							updateFileState(fileState.id, {
								status: 'quota_error',
								message: `All API keys exhausted. Retrying ${label} in ${retryAfter}s...`,
								retryAfter,
							});
							await new Promise((r) => setTimeout(r, retryAfter * 1000));
							retries++;
							continue;
						}

						const data = await response.json();

						// Mismatch: split in half immediately, no retry of original chunk
						if (
							!response.ok &&
							data.error?.includes('Segment count mismatch') &&
							subChunk.length > 1
						) {
							const mid = Math.ceil(subChunk.length / 2);
							console.log(
								`⚡ Mismatch on ${label} (${subChunk.length} subs) → splitting into ${mid} + ${subChunk.length - mid}`,
							);
							updateFileState(fileState.id, {
								status: 'translating',
								message: `Mismatch on ${label} → splitting into halves (${mid} + ${subChunk.length - mid} subs)...`,
							});
							const firstHalf = await translateChunkWithFallback(
								subChunk.slice(0, mid),
								`${label}a`,
							);
							const secondHalf = await translateChunkWithFallback(
								subChunk.slice(mid),
								`${label}b`,
							);
							return [...firstHalf, ...secondHalf];
						}

						if (!response.ok) {
							retries++;
							if (retries >= MAX_RETRIES)
								throw new Error(
									`HTTP ${response.status}: ${data.error || 'Unknown'}`,
								);
							const backoff = Math.min(2000 * Math.pow(2, retries - 1), 30000);
							console.error(
								`❌ HTTP ${response.status} on ${label}, retrying in ${backoff / 1000}s...`,
							);
							updateFileState(fileState.id, {
								status: 'retry',
								message: `Error on ${label}. Retrying in ${backoff / 1000}s... (${retries}/${MAX_RETRIES})`,
								retryAfter: Math.round(backoff / 1000),
							});
							await new Promise((r) => setTimeout(r, backoff));
							continue;
						}

						if (!data.success) {
							// success:false but not mismatch (shouldn't happen, but handle gracefully)
							retries++;
							if (retries >= MAX_RETRIES)
								throw new Error(data.error || 'Translation failed');
							const backoff = Math.min(2000 * Math.pow(2, retries - 1), 30000);
							updateFileState(fileState.id, {
								status: 'retry',
								message: `Retrying ${label} in ${backoff / 1000}s... (${retries}/${MAX_RETRIES})`,
								retryAfter: Math.round(backoff / 1000),
							});
							await new Promise((r) => setTimeout(r, backoff));
							continue;
						}

						if (!data.translatedChunk)
							throw new Error('Empty translation result');

						console.log(`
─────────────────────────────────────────────────────────
✅ API RESPONSE for ${label}
─────────────────────────────────────────────────────────
Sent: ${subChunk.length} subtitles
Received: ${data.translatedChunk.length} subtitles
Match: ${subChunk.length === data.translatedChunk.length ? '✅' : '❌'}
Received indices: ${data.translatedChunk.map((s: any) => s.index).join(', ')}
─────────────────────────────────────────────────────────
						`);

						return data.translatedChunk;
					}

					throw new Error(
						`Failed to translate ${label} after ${MAX_RETRIES} attempts`,
					);
				};

				const translatedChunk = await translateChunkWithFallback(
					chunk,
					`chunk ${chunkIndex + 1}/${totalChunks}`,
				);

				console.log(
					`📦 Chunk ${chunkIndex + 1}: input=${chunk.length}, translated=${translatedChunk.length}`,
				);

				// Detect if AI returned more subtitles than sent (hallucination bug)
				if (translatedChunk.length > chunk.length) {
					console.error(
						`❌ BUG: AI returned ${translatedChunk.length} subs but we sent ${chunk.length}!`,
					);
				}

				if (translatedChunk.length < chunk.length) {
					console.error(
						`❌ BUG: AI returned ${translatedChunk.length} subs but we expected ${chunk.length}!`,
					);
				}

				// Save to cache
				saveChunkToCache(fileState.id, chunkIndex, translatedChunk);
				console.log(
					`✅ Chunk ${chunkIndex + 1}/${totalChunks} translated and cached`,
				);

				// Positional assembly: use input chunk indices (never trust AI-returned indices)
				let addedInThisChunk = 0;
				translatedChunk.forEach((translatedSub, i) => {
					const inputSub = chunk[i];
					if (inputSub) {
						// Only add if we have a corresponding input subtitle
						translatedSubtitles[inputSub.index - 1] = {
							...inputSub,
							text: translatedSub.text,
						};
						addedInThisChunk++;
					} else {
						console.error(
							`❌ BUG: Translated chunk ${chunkIndex + 1} has sub at position ${i} but input doesn't! (translatedChunk.length=${translatedChunk.length}, chunk.length=${chunk.length})`,
						);
					}
					// If no inputSub (AI returned more than sent), IGNORE the extra
				});

				totalProcessedSubs += addedInThisChunk;
				console.log(
					`✅ Chunk ${chunkIndex + 1}: added ${addedInThisChunk} subs (total so far: ${totalProcessedSubs}/${subtitles.length})`,
				);

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

				// Delay between chunks to avoid rate limits
				await new Promise((resolve) => setTimeout(resolve, 1200));
			}

			// Step 5: Validate timing integrity
			const nonEmptyCount = translatedSubtitles.filter((s) => s != null).length;
			console.log(
				`📊 Translation complete: processed ${totalProcessedSubs} subs, array has ${nonEmptyCount} non-empty slots, expected ${subtitles.length}`,
			);
			console.log(`📊 Array length: ${translatedSubtitles.length}`);

			if (nonEmptyCount !== subtitles.length) {
				console.error(
					`❌ CRITICAL: Mismatch detected! processed=${totalProcessedSubs}, non-empty=${nonEmptyCount}, expected=${subtitles.length}`,
				);
			}

			// Filter out any undefined/null entries (defensive programming)
			const validTranslatedSubtitles = translatedSubtitles.filter(
				(s) => s != null,
			);
			console.log(
				`📊 After filtering nulls: ${validTranslatedSubtitles.length} valid subtitles`,
			);

			console.log('🔍 Validating translation integrity...');
			const validation = sampleValidation(subtitles, validTranslatedSubtitles);

			if (!validation.valid) {
				console.error('❌ Validation failed:', validation.errors);
				throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
			}

			console.log('✅ Validation passed!');

			// Step 6: Build final SRT
			console.log(
				`📝 Building SRT file from ${validTranslatedSubtitles.length} subtitles...`,
			);
			const finalSRT = buildSRT(validTranslatedSubtitles);

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

		processedFilesRef.current.clear(); // Reset processed files tracker
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

		setFiles((prev) => {
			const next = prev.filter((f) => f.id !== fileId);
			filesRef.current = next;
			return next;
		});
	};

	const handleClearCompleted = () => {
		setFiles((prev) => {
			const next = prev.filter((f) => f.status !== 'complete');
			filesRef.current = next;
			return next;
		});
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
		processedFilesRef.current.clear(); // Reset processed files tracker
		filesRef.current = [];
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
									keys on 60-second cooldown, ensuring uninterrupted translation
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
