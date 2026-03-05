import type { Segment } from '@/types';
import {
    type ParsedEvent,
    type ReconnectInterval,
    createParser,
} from 'eventsource-parser';
import { encoding_for_model } from 'tiktoken';

/**
 * Parsed subtitle entry with timing information
 */
export interface ParsedSubtitle {
	index: number;
	startTime: string;
	endTime: string;
	text: string;
}

/**
 * Parse SRT content into structured subtitle entries
 */
export function parseSRT(content: string): ParsedSubtitle[] {
	const subtitles: ParsedSubtitle[] = [];
	const blocks = content.trim().split(/\n\s*\n/);

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		if (lines.length < 3) continue;

		const index = parseInt(lines[0]);
		const timeLine = lines[1];
		const text = lines.slice(2).join('\n');

		// Parse timing: "00:00:20,000 --> 00:00:24,400"
		const timeMatch = timeLine.match(/(\S+)\s+-->\s+(\S+)/);
		if (!timeMatch) continue;

		subtitles.push({
			index,
			startTime: timeMatch[1],
			endTime: timeMatch[2],
			text: text.trim(),
		});
	}

	return subtitles;
}

/**
 * Build SRT content from parsed subtitles
 */
export function buildSRT(subtitles: ParsedSubtitle[]): string {
	return subtitles
		.map((sub) => {
			return `${sub.index}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}\n`;
		})
		.join('\n');
}

/**
 * Chunk subtitles into smaller groups for incremental translation
 */
export function chunkSubtitles(
	subtitles: ParsedSubtitle[],
	chunkSize: number = 15,
): ParsedSubtitle[][] {
	const chunks: ParsedSubtitle[][] = [];
	for (let i = 0; i < subtitles.length; i += chunkSize) {
		chunks.push(subtitles.slice(i, i + chunkSize));
	}
	return chunks;
}

/**
 * Validate that timings match between original and translated subtitle
 */
export function validateTimings(
	original: ParsedSubtitle,
	translated: ParsedSubtitle,
): boolean {
	return (
		original.startTime === translated.startTime &&
		original.endTime === translated.endTime &&
		original.index === translated.index
	);
}

/**
 * Sample-based validation: check timing integrity on 5 random subtitles
 * (first, last, 25%, 50%, 75%)
 */
export function sampleValidation(
	original: ParsedSubtitle[],
	translated: ParsedSubtitle[],
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (original.length !== translated.length) {
		errors.push(
			`Length mismatch: original has ${original.length}, translated has ${translated.length}`,
		);
		return { valid: false, errors };
	}

	if (original.length === 0) {
		errors.push('Empty subtitle arrays');
		return { valid: false, errors };
	}

	// Sample indices: first, last, and 3 points in the middle
	const indices = [
		0, // First
		original.length - 1, // Last
		Math.floor(original.length * 0.25), // 25%
		Math.floor(original.length * 0.5), // 50%
		Math.floor(original.length * 0.75), // 75%
	];

	for (const i of indices) {
		if (i >= original.length || i >= translated.length) continue;

		if (!validateTimings(original[i], translated[i])) {
			errors.push(
				`Timing mismatch at index ${i}: ` +
					`original [${original[i].startTime} --> ${original[i].endTime}], ` +
					`translated [${translated[i].startTime} --> ${translated[i].endTime}]`,
			);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Groups segments into groups of length `length` or less.
 */
export function groupSegmentsByTokenLength(
	segments: Segment[],
	length: number,
) {
	const groups: Segment[][] = [];
	let currentGroup: Segment[] = [];
	let currentGroupTokenCount = 0;
	const encoder = encoding_for_model('gpt-4o-mini');

	function numTokens(text: string) {
		const tokens = encoder.encode(text);
		return tokens.length;
	}

	for (const segment of segments) {
		const segmentTokenCount = numTokens(segment.text);

		if (currentGroupTokenCount + segmentTokenCount <= length) {
			currentGroup.push(segment);
			currentGroupTokenCount += segmentTokenCount + 1; // include size of the "|" delimeter
		} else {
			groups.push(currentGroup);
			currentGroup = [segment];
			currentGroupTokenCount = segmentTokenCount;
		}
	}

	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	encoder.free(); // clear encoder from memory
	return groups;
}

export function parseStreamedResponse(response: any): ReadableStream {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let buffer = '';

	return new ReadableStream({
		async start(controller) {
			const onParse = (event: ParsedEvent | ReconnectInterval) => {
				if (event.type !== 'event') return;

				const data = event.data;

				if (data === '[DONE]') {
					controller.close();
					return;
				}

				try {
					const json = JSON.parse(data);
					const text = json.choices[0]?.delta?.content;
					if (!text) return;
					buffer += text;

					// If there's a "|" in the buffer, we can enqueue a segment
					if (buffer.includes('|')) {
						const segments = buffer.split('|');
						for (const segment of segments.slice(0, -1)) {
							controller.enqueue(encoder.encode(segment));
						}
						buffer = segments[segments.length - 1]; // Keep the remaining text
					}
				} catch (e) {
					controller.error(e);
				}
			};

			const parser = createParser(onParse);

			for await (const chunk of response.body as any) {
				const decodedChunk = decoder.decode(chunk);
				parser.feed(decodedChunk); // Feed the chunk into the parser
			}

			// Process any remaining buffer content
			if (buffer.length > 0) {
				controller.enqueue(encoder.encode(buffer));
			}

			controller.close();
		},
	});
}
