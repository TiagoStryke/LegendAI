import type { ParsedSubtitle } from './srt';

/**
 * Translation cache stored in localStorage
 */
export interface TranslationCache {
	fileId: string;
	fileName: string;
	language: string;
	translatedChunks: { [chunkIndex: number]: ParsedSubtitle[] };
	totalChunks: number;
	lastUpdated: number;
	originalLength: number; // number of subtitles in original file
}

const CACHE_PREFIX = 'translation_cache_';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get translation cache for a file
 */
export function getTranslationCache(fileId: string): TranslationCache | null {
	if (typeof window === 'undefined') return null;

	try {
		const key = `${CACHE_PREFIX}${fileId}`;
		const cached = localStorage.getItem(key);
		if (!cached) return null;

		const cache = JSON.parse(cached) as TranslationCache;

		// Check if cache is expired
		if (Date.now() - cache.lastUpdated > CACHE_EXPIRY_MS) {
			localStorage.removeItem(key);
			return null;
		}

		return cache;
	} catch (error) {
		console.error('Error reading cache:', error);
		return null;
	}
}

/**
 * Initialize or get existing cache for a file
 */
export function initializeCache(
	fileId: string,
	fileName: string,
	language: string,
	totalChunks: number,
	originalLength: number,
): TranslationCache {
	const existing = getTranslationCache(fileId);
	if (
		existing &&
		existing.language === language &&
		existing.totalChunks === totalChunks
	) {
		return existing;
	}

	const cache: TranslationCache = {
		fileId,
		fileName,
		language,
		translatedChunks: {},
		totalChunks,
		lastUpdated: Date.now(),
		originalLength,
	};

	saveCache(cache);
	return cache;
}

/**
 * Save a translated chunk to cache
 */
export function saveChunkToCache(
	fileId: string,
	chunkIndex: number,
	translatedChunk: ParsedSubtitle[],
): void {
	const cache = getTranslationCache(fileId);
	if (!cache) return;

	cache.translatedChunks[chunkIndex] = translatedChunk;
	cache.lastUpdated = Date.now();
	saveCache(cache);
}

/**
 * Save entire cache to localStorage
 */
function saveCache(cache: TranslationCache): void {
	if (typeof window === 'undefined') return;

	try {
		const key = `${CACHE_PREFIX}${cache.fileId}`;
		localStorage.setItem(key, JSON.stringify(cache));
	} catch (error) {
		console.error('Error saving cache:', error);
		// If localStorage is full, try to clear old caches
		clearOldCaches();
		try {
			const key = `${CACHE_PREFIX}${cache.fileId}`;
			localStorage.setItem(key, JSON.stringify(cache));
		} catch (retryError) {
			console.error('Failed to save cache even after cleanup:', retryError);
		}
	}
}

/**
 * Clear cache for a specific file
 */
export function clearTranslationCache(fileId: string): void {
	if (typeof window === 'undefined') return;

	try {
		const key = `${CACHE_PREFIX}${fileId}`;
		localStorage.removeItem(key);
	} catch (error) {
		console.error('Error clearing cache:', error);
	}
}

/**
 * Clear all expired caches
 */
export function clearOldCaches(): void {
	if (typeof window === 'undefined') return;

	try {
		const keysToRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(CACHE_PREFIX)) {
				const cached = localStorage.getItem(key);
				if (cached) {
					try {
						const cache = JSON.parse(cached) as TranslationCache;
						if (Date.now() - cache.lastUpdated > CACHE_EXPIRY_MS) {
							keysToRemove.push(key);
						}
					} catch {
						keysToRemove.push(key); // Remove corrupted cache
					}
				}
			}
		}

		keysToRemove.forEach((key) => localStorage.removeItem(key));
		console.log(`🧹 Cleared ${keysToRemove.length} expired caches`);
	} catch (error) {
		console.error('Error clearing old caches:', error);
	}
}

/**
 * Get cache progress percentage
 */
export function getCacheProgress(fileId: string): number {
	const cache = getTranslationCache(fileId);
	if (!cache) return 0;

	const completedChunks = Object.keys(cache.translatedChunks).length;
	return Math.round((completedChunks / cache.totalChunks) * 100);
}

/**
 * Check if all chunks are cached
 */
export function isFullyCached(fileId: string): boolean {
	const cache = getTranslationCache(fileId);
	if (!cache) return false;

	const completedChunks = Object.keys(cache.translatedChunks).length;
	return completedChunks === cache.totalChunks;
}

/**
 * Get list of missing chunk indices
 */
export function getMissingChunks(fileId: string): number[] {
	const cache = getTranslationCache(fileId);
	if (!cache) return [];

	const missing: number[] = [];
	for (let i = 0; i < cache.totalChunks; i++) {
		if (!cache.translatedChunks[i]) {
			missing.push(i);
		}
	}
	return missing;
}
