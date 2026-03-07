---
applyTo: '**/*.{ts,tsx,js,jsx}'
---

# Coding Standards — LegendAI

> These rules apply to all TypeScript/JavaScript files in the project.

---

## TypeScript

### Strict Mode

**Always use strict TypeScript settings.**

```json
// tsconfig.json
{
	"compilerOptions": {
		"strict": true,
		"noImplicitAny": true,
		"strictNullChecks": true,
		"strictFunctionTypes": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true
	}
}
```

**Never use `any`** unless absolutely necessary. Prefer `unknown`.

```typescript
// ❌ Bad
function process(data: any) { ... }

// ✅ Good
function process(data: unknown) {
  if (typeof data === 'string') {
    // Type narrowing
  }
}
```

---

### Type Definitions

**Define types for all function parameters and return values.**

```typescript
// ❌ Bad
function parseSRT(content) {
	return content.split('\n\n');
}

// ✅ Good
function parseSRT(content: string): ParsedSubtitle[] {
	return content.split('\n\n').map(parseEntry);
}
```

**Use interfaces for object shapes, types for unions/aliases.**

```typescript
// Interfaces for objects
interface ParsedSubtitle {
	index: number;
	startTime: string;
	endTime: string;
	text: string;
}

// Types for unions
type ProgressType = 'progress' | 'complete' | 'error' | 'quota_error';

// Types for aliases
type SubtitleChunk = ParsedSubtitle[];
```

---

### Null Safety

**Always handle null/undefined explicitly.**

```typescript
// ❌ Bad
function getFirstSubtitle(subs: ParsedSubtitle[]) {
	return subs[0].text; // Might crash if empty array
}

// ✅ Good
function getFirstSubtitle(subs: ParsedSubtitle[]): string | null {
	return subs.length > 0 ? subs[0].text : null;
}

// ✅ Also good with optional chaining
function getFirstSubtitle(subs: ParsedSubtitle[]): string | undefined {
	return subs[0]?.text;
}
```

**Use nullish coalescing for defaults.**

```typescript
// ❌ Bad
const chunkSize = options.chunkSize || 15;

// ✅ Good (handles 0 correctly)
const chunkSize = options.chunkSize ?? 15;
```

---

## React

### Component Structure

**Functional components with TypeScript.**

```typescript
// ❌ Bad
function MyComponent(props) {
  return <div>{props.title}</div>;
}

// ✅ Good
interface MyComponentProps {
  title: string;
  onClose?: () => void;
}

function MyComponent({ title, onClose }: MyComponentProps) {
  return (
    <div>
      <h1>{title}</h1>
      {onClose && <button onClick={onClose}>Close</button>}
    </div>
  );
}

export default MyComponent;
```

---

### Hooks

**Always declare hooks at the top level, never in conditions.**

```typescript
// ❌ Bad
function MyComponent({ showData }: Props) {
  if (showData) {
    const [data, setData] = useState(null); // Conditional hook!
  }
}

// ✅ Good
function MyComponent({ showData }: Props) {
  const [data, setData] = useState<Data | null>(null);

  if (!showData) return null;

  return <div>{data}</div>;
}
```

**Always specify useState type if initial value is null/undefined.**

```typescript
// ❌ Bad (type inferred as undefined, won't accept strings)
const [text, setText] = useState();

// ✅ Good
const [text, setText] = useState<string | undefined>();

// ✅ Also good if default is provided
const [text, setText] = useState('');
```

---

### Event Handlers

**Define event handler types explicitly.**

```typescript
// ❌ Bad
function handleChange(e) {
	console.log(e.target.value);
}

// ✅ Good
function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
	console.log(e.target.value);
}

// ✅ Also good for button clicks
function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
	e.preventDefault();
}
```

---

## Async/Await

**Always use async/await over raw Promises.**

```typescript
// ❌ Bad
function fetchData() {
	return fetch('/api/data')
		.then((res) => res.json())
		.then((data) => processData(data))
		.catch((err) => console.error(err));
}

// ✅ Good
async function fetchData(): Promise<Data> {
	try {
		const res = await fetch('/api/data');
		const data = await res.json();
		return processData(data);
	} catch (err) {
		console.error('Failed to fetch data:', err);
		throw err;
	}
}
```

**Never swallow errors silently.**

```typescript
// ❌ Bad
try {
	await riskyOperation();
} catch (err) {
	// Silent failure
}

// ✅ Good - at minimum, log the error
try {
	await riskyOperation();
} catch (err) {
	console.error('Operation failed:', err);
	throw err; // or handle appropriately
}
```

---

## Error Handling

**Use typed errors when possible.**

```typescript
class SubtitleParseError extends Error {
	constructor(
		message: string,
		public readonly line: number,
		public readonly content: string,
	) {
		super(message);
		this.name = 'SubtitleParseError';
	}
}

function parseEntry(content: string, lineNumber: number): ParsedSubtitle {
	if (!isValidFormat(content)) {
		throw new SubtitleParseError(
			'Invalid subtitle format',
			lineNumber,
			content,
		);
	}
	// ...
}
```

**Validate inputs at API boundaries.**

```typescript
// app/api/route.ts
export async function POST(req: Request) {
	const body = await req.json();

	// ❌ Bad - assume valid input
	const { srtContent, apiKeys } = body;

	// ✅ Good - validate explicitly
	if (!body.srtContent || typeof body.srtContent !== 'string') {
		return Response.json(
			{ error: 'Invalid srtContent: must be a non-empty string' },
			{ status: 400 },
		);
	}

	if (!Array.isArray(body.apiKeys) || body.apiKeys.length === 0) {
		return Response.json(
			{ error: 'Invalid apiKeys: must be a non-empty array' },
			{ status: 400 },
		);
	}

	// Now safe to use
	const { srtContent, apiKeys } = body;
}
```

---

## Naming Conventions

### Files

- **Components:** PascalCase — `Form.tsx`, `TranslationProgress.tsx`
- **Utilities:** camelCase — `srt.ts`, `client.ts`
- **Types:** camelCase — `types.ts`
- **Tests:** `*.test.ts` or `test-*.js`

### Variables

- **Constants:** SCREAMING_SNAKE_CASE

```typescript
const MAX_TOKENS_PER_CHUNK = 400;
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000;
```

- **Regular variables:** camelCase

```typescript
const apiKey = 'xyz';
const translatedContent = await translate(content);
```

- **Boolean variables:** Use `is`, `has`, `should` prefix

```typescript
const isValid = validateSRT(content);
const hasQuota = checkQuota(apiKey);
const shouldRetry = attempt < MAX_RETRIES;
```

### Functions

- **camelCase for all functions**

```typescript
function parseSRT(content: string): ParsedSubtitle[] { ... }
async function translateChunk(chunk: SubtitleChunk): Promise<SubtitleChunk> { ... }
```

- **Verb-first naming**

```typescript
// ✅ Good
function getFirstSubtitle() { ... }
function validateTimings() { ... }
function buildSRT() { ... }

// ❌ Bad
function firstSubtitle() { ... }
function timingsValid() { ... }
function srtBuilder() { ... }
```

---

## Code Organization

### Import Order

1. External dependencies (React, Next.js, etc.)
2. Internal utilities (`@/lib`)
3. Internal components (`@/components`)
4. Types (`@/types`, local types)
5. Styles (CSS imports)

```typescript
// 1. External
import { useState, useEffect } from 'react';
import { generateText } from 'ai';

// 2. Utilities
import { parseSRT, buildSRT } from '@/lib/srt';

// 3. Components
import Form from '@/components/Form';
import ThemeToggle from '@/components/ThemeToggle';

// 4. Types
import type { ParsedSubtitle, TranslationProgress } from '@/types';

// 5. Styles
import '@/app/globals.css';
```

---

### File Structure

**Order within a file:**

1. Imports
2. Type definitions (interfaces, types)
3. Constants
4. Helper functions (not exported)
5. Main logic / component
6. Exports

```typescript
// 1. Imports
import { generateText } from 'ai';

// 2. Types
interface ChunkResult {
	chunk: ParsedSubtitle[];
	translated: ParsedSubtitle[];
}

// 3. Constants
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// 4. Helpers
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// 5. Main logic
async function translateWithRetry(
	chunk: ParsedSubtitle[],
): Promise<ParsedSubtitle[]> {
	// ...
}

// 6. Exports
export { translateWithRetry };
export type { ChunkResult };
```

---

## Comments

### When to Comment

**Do comment:**

- Complex algorithms (why, not what)
- Non-obvious business rules
- Workarounds for bugs in dependencies
- Performance optimizations

**Don't comment:**

- Obvious code (the code is the comment)
- Commented-out code (delete it, use git history)
- Redundant explanations

```typescript
// ❌ Bad - obvious
// Loop through subtitles
for (const sub of subtitles) {
	// ...
}

// ✅ Good - explains why
// Gemini truncates responses after ~400 tokens, so we pre-chunk
// to stay under the limit while maximizing throughput
const chunks = chunkSubtitles(subtitles, 15);
```

---

### JSDoc for Public APIs

**Use JSDoc for exported functions and types.**

```typescript
/**
 * Parse SRT content into structured subtitle entries
 *
 * @param content - Raw SRT file content
 * @returns Array of parsed subtitle entries
 * @throws {SubtitleParseError} If SRT format is invalid
 */
export function parseSRT(content: string): ParsedSubtitle[] {
	// ...
}
```

---

## Performance

### Avoid Unnecessary Re-renders

**Use `useMemo` for expensive computations.**

```typescript
function MyComponent({ subtitles }: Props) {
  // ❌ Bad - recalculates on every render
  const chunks = chunkSubtitles(subtitles, 15);

  // ✅ Good - only recalculates when subtitles change
  const chunks = useMemo(
    () => chunkSubtitles(subtitles, 15),
    [subtitles]
  );

  return <div>{chunks.length} chunks</div>;
}
```

**Use `useCallback` for event handlers passed to children.**

```typescript
function Parent() {
  // ❌ Bad - creates new function on every render
  const handleClick = () => console.log('clicked');

  // ✅ Good - stable reference
  const handleClick = useCallback(() => {
    console.log('clicked');
  }, []);

  return <Child onClick={handleClick} />;
}
```

---

### Avoid Large Inline Objects

```typescript
// ❌ Bad - creates new object on every render
function MyComponent() {
  return <div style={{ padding: 10, margin: 20 }}>Hello</div>;
}

// ✅ Good - stable reference
const styles = { padding: 10, margin: 20 };

function MyComponent() {
  return <div style={styles}>Hello</div>;
}
```

---

## Testing

### Test Pure Functions

**All utility functions should be testable without React.**

```typescript
// lib/srt.test.ts
import { describe, it, expect } from 'vitest';
import { parseSRT, buildSRT } from './srt';

describe('parseSRT', () => {
	it('should parse valid SRT content', () => {
		const content = '1\n00:00:01,000 --> 00:00:03,000\nHello\n';
		const result = parseSRT(content);

		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('Hello');
	});

	it('should throw on invalid format', () => {
		const content = 'invalid content';
		expect(() => parseSRT(content)).toThrow(SubtitleParseError);
	});
});
```

---

## Security

### Never Log Sensitive Data

```typescript
// ❌ Bad
console.log('API Key:', apiKey);

// ✅ Good
console.log('API Key:', apiKey.slice(0, 8) + '...');
```

### Validate All User Input

```typescript
// ❌ Bad - trust user input
function translate(srtContent: string, apiKey: string) {
	// Direct usage without validation
}

// ✅ Good - validate first
function translate(srtContent: string, apiKey: string) {
	if (!srtContent || srtContent.length > 10_000_000) {
		throw new Error('Invalid SRT content');
	}

	if (!apiKey || !apiKey.startsWith('AIza')) {
		throw new Error('Invalid API key format');
	}

	// Now safe to use
}
```

---

## Git Commit Messages

**Use conventional commits format:**

```
feat: add support for VTT format
fix: prevent dialogue line concatenation
docs: update architecture diagram
refactor: extract rate limiting logic
test: add chunking edge cases
chore: update dependencies
```

**Scope (optional):**

```
feat(api): add OpenAI provider
fix(parser): handle malformed timestamps
docs(readme): add installation instructions
```

---

## Never Do This

❌ **Mutate function parameters**

```typescript
// ❌ Bad
function processSubtitles(subs: ParsedSubtitle[]) {
	subs.sort((a, b) => a.index - b.index); // Mutates input!
	return subs;
}

// ✅ Good
function processSubtitles(subs: ParsedSubtitle[]): ParsedSubtitle[] {
	return [...subs].sort((a, b) => a.index - b.index);
}
```

❌ **Use magic numbers**

```typescript
// ❌ Bad
if (chunks.length > 50) { ... }

// ✅ Good
const MAX_CHUNKS_FOR_SINGLE_BATCH = 50;
if (chunks.length > MAX_CHUNKS_FOR_SINGLE_BATCH) { ... }
```

❌ **Ignore TypeScript errors**

```typescript
// ❌ Bad
// @ts-ignore
const result = riskyOperation();

// ✅ Good - fix the type issue
const result = riskyOperation() as ExpectedType;
// Or better: fix riskyOperation's type signature
```

---

## Summary

1. **TypeScript strict mode** — Always
2. **Explicit types** — No implicit any
3. **Null safety** — Handle null/undefined explicitly
4. **Async/await** — Over raw Promises
5. **Error handling** — Never swallow errors
6. **Naming** — Descriptive, consistent, verb-first for functions
7. **Comments** — Why, not what (except for complex algorithms)
8. **Performance** — useMemo, useCallback for expensive operations
9. **Testing** — Pure functions are testable
10. **Security** — Validate inputs, never log secrets
