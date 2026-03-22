# LegendAI Desktop - Complete Project Guide (Skill.MD)

> **Master reference for LegendAI Desktop Windows application**  
> **Last Updated:** March 9, 2026  
> **Status:** Design Phase → Development Starting  
> **Version:** v1.0.0 (Target: April 21, 2026)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Development Principles](#development-principles)
5. [MCP Tools Usage](#mcp-tools-usage)
6. [Project Structure](#project-structure)
7. [Key Features](#key-features)
8. [Translation Rules](#translation-rules)
9. [AI Provider Strategy](#ai-provider-strategy)
10. [File System Monitoring](#file-system-monitoring)
11. [Database Schema](#database-schema)
12. [UI Design](#ui-design)
13. [Testing Strategy](#testing-strategy)
14. [Performance Optimization](#performance-optimization)
15. [Deployment](#deployment)
16. [Common Tasks](#common-tasks)
17. [Troubleshooting](#troubleshooting)

---

## Project Overview

**LegendAI Desktop** is a high-performance Windows desktop application that automatically translates English subtitles (.eng.srt) to Brazilian Portuguese (.pt.srt). It monitors directories for new subtitle files, integrates with qBittorrent to detect completed downloads, fetches rich metadata from IMDB, and sends WhatsApp notifications when translations complete.

### Key Differentiators from Web Version

- **Automatic:** No manual file upload, monitors directories 24/7
- **Integrated:** Detects qBittorrent completed downloads
- **Resilient:** 4 AI providers with automatic fallback
- **Rich Context:** IMDB metadata for higher quality translations
- **Notifications:** WhatsApp alerts on completion
- **Desktop-Class:** Native performance, auto-start with Windows

### Core Requirements

1. ✅ Follow same translation rules as web version (timing preservation, validation)
2. ✅ SOLID principles throughout
3. ✅ Test-Driven Development (TDD) with 80%+ coverage
4. ✅ High performance (async/await, parallel processing, efficient file monitoring)
5. ✅ Clean UI with detailed logs
6. ✅ Professional code quality ("not cagado")

---

## Technology Stack

### Core Platform

- **.NET 8 (C# 12)** - Latest LTS, excellent Windows performance, mature ecosystem
- **Avalonia UI 11.x** - Modern cross-platform XAML framework (better than WPF)

### Architecture & Patterns

- **Clean Architecture** (Domain → Application → Infrastructure → UI)
- **MVVM** (Model-View-ViewModel) for UI
- **Repository Pattern** for data access
- **Factory Pattern** for AI provider creation
- **Chain of Responsibility** for AI provider fallback

### Key Libraries

- **Entity Framework Core 8** - ORM for complex queries
- **Dapper** - Micro-ORM for high-performance reads
- **SQLite** - Embedded database (no server)
- **Serilog** - Structured logging (JSON)
- **Polly** - Resilience (retry, circuit breaker, rate limiting)
- **Refit** - Type-safe REST client
- **FluentValidation** - Input validation
- **MediatR** - CQRS pattern (optional)

### Testing

- **xUnit** - Test framework
- **FluentAssertions** - Readable assertions
- **Moq** - Mocking framework
- **BenchmarkDotNet** - Performance benchmarking

### External Services (All Free)

- **Google Gemini 2.0 Flash** - Primary AI provider
- **Groq API** - Fallback 1 (14,400 requests/day free)
- **Together AI** - Fallback 2 ($25 free credit)
- **Cohere** - Fallback 3 (5 requests/minute free)
- **OMDB API** - Metadata (1,000 requests/day free)
- **Baileys** - WhatsApp (unlimited, free, needs Node.js bridge)
- **Twilio** - WhatsApp fallback (500 messages/month free)
- **qBittorrent WebUI** - Built-in API (no cost)

---

## Architecture

### Clean Architecture Layers

```
┌───────────────────────────────────────────┐
│  UI Layer (Avalonia MVVM)                │  ← Presentation
│  - ViewModels, Views, Controls           │
├───────────────────────────────────────────┤
│  Application Layer (Use Cases)           │  ← Business Logic
│  - Handlers, Services, DTOs              │
├───────────────────────────────────────────┤
│  Infrastructure Layer (External)         │  ← I/O, APIs, Database
│  - Repositories, API Clients, FileSystem │
├───────────────────────────────────────────┤
│  Core Layer (Domain)                     │  ← Pure Logic
│  - Entities, Value Objects, Interfaces   │  ← NO DEPENDENCIES
└───────────────────────────────────────────┘
```

**Dependency Rule:** Dependencies point inward. Core has zero external dependencies.

### SOLID Principles Applied

**Single Responsibility Principle:**

- Each class has one reason to change
- `TranslationService` only translates, `FileWatcherService` only watches files

**Open/Closed Principle:**

- `IAIProvider` interface allows adding providers without modifying existing code
- Strategy pattern for provider selection

**Liskov Substitution Principle:**

- Any `IAIProvider` can replace another
- All repository implementations honor `IRepository<T>` contract

**Interface Segregation Principle:**

- Separate interfaces: `IAIProvider`, `IMetadataProvider`, `INotificationService`
- No fat interfaces

**Dependency Inversion Principle:**

- High-level modules (Use Cases) depend on abstractions
- Low-level modules (Infrastructure) implement abstractions
- All dependencies injected via constructor

### Design Patterns Used

- **Repository Pattern** - Data access abstraction
- **Factory Pattern** - `AIProviderFactory` creates providers
- **Strategy Pattern** - Different AI providers with same interface
- **Chain of Responsibility** - AI provider fallback chain
- **Observer Pattern** - FileSystemWatcher notifies subscribers
- **Command Pattern** - Translation jobs as commands
- **MVVM** - UI separation in Avalonia

---

## Development Principles

### 1. Test-Driven Development (TDD)

**Always follow Red-Green-Refactor:**

```
1. Write failing test (Red)
   ↓
2. Write minimum code to pass (Green)
   ↓
3. Refactor for quality
   ↓
4. Commit
```

**Example:**

```csharp
// 1. RED: Write test first
[Fact]
public void ParseSRT_ValidFile_ReturnsCorrectCount()
{
    // Arrange
    var srtContent = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";

    // Act
    var result = SRTParser.Parse(srtContent);

    // Assert
    result.Should().HaveCount(1);
}

// 2. GREEN: Implement minimum code
public static List<Subtitle> Parse(string content)
{
    return new List<Subtitle>(); // Fails test
}

// Fix to pass:
public static List<Subtitle> Parse(string content)
{
    // Implementation that makes test pass
}

// 3. REFACTOR: Clean up code, keep tests green
```

### 2. Code Quality Standards

**Naming Conventions:**

- **Classes:** `PascalCase` (noun: `TranslationService`, `SubtitleEntity`)
- **Interfaces:** `IPascalCase` (`IAIProvider`, `IRepository`)
- **Methods:** `PascalCase` (verb-first: `TranslateAsync`, `ParseFile`)
- **Variables:** `camelCase` (`aiProvider`, `subtitleCount`)
- **Constants:** `SCREAMING_SNAKE_CASE` (`MAX_CHUNK_SIZE`, `DEFAULT_TIMEOUT`)
- **Private Fields:** `_camelCase` (`_logger`, `_dbContext`)

**File Naming:**

- One class per file
- Filename matches class name: `TranslationService.cs`
- Test files: `TranslationServiceTests.cs`

**Documentation:**

- XML comments on all public APIs
- Explain "why" in comments, not "what" (code should be self-documenting)

### 3. Error Handling

**Never swallow exceptions:**

```csharp
// ❌ BAD
try {
    DoSomething();
} catch { }

// ✅ GOOD
try {
    DoSomething();
} catch (Exception ex) {
    _logger.Error(ex, "Failed to do something with {Context}", context);
    throw; // or handle appropriately
}
```

**Use Result<T> pattern in Application layer:**

```csharp
// Instead of throwing
public class TranslateSubtitleResult
{
    public bool Success { get; init; }
    public Subtitle? Subtitle { get; init; }
    public string? ErrorMessage { get; init; }
}
```

### 4. Async/Await Best Practices

**All I/O operations must be async:**

```csharp
// ✅ GOOD
public async Task<string> ReadFileAsync(string path)
{
    return await File.ReadAllTextAsync(path);
}

// ❌ BAD (blocking)
public string ReadFile(string path)
{
    return File.ReadAllText(path);
}
```

**Use ConfigureAwait(false) in library code:**

```csharp
await httpClient.GetAsync(url).ConfigureAwait(false);
```

### 5. Dependency Injection

**Constructor injection only:**

```csharp
public class TranslationService
{
    private readonly IAIProvider _aiProvider;
    private readonly ILogger<TranslationService> _logger;

    public TranslationService(
        IAIProvider aiProvider,
        ILogger<TranslationService> logger)
    {
        _aiProvider = aiProvider ?? throw new ArgumentNullException(nameof(aiProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }
}
```

**Register in DI container:**

```csharp
services.AddSingleton<IAIProvider, GeminiProvider>();
services.AddScoped<ITranslationService, TranslationService>();
```

---

## MCP Tools Usage

### Mandatory Order Before Coding

```
1. sequential-thinking  → Plan approach for non-trivial features
2. memory               → Read /memories/ for past learnings
3. jcodemunch           → Index repo, search symbols (never read whole files)
4. github               → Find real implementations (if needed)
5. context7             → Fetch current API docs (if using new library)
6. Write code           → Implement following TDD and SOLID
7. memory               → Save decisions and learnings
```

### jcodemunch - How to Use

**Never read entire files. Use jcodemunch to retrieve only needed symbols:**

```bash
# 1. Index the repo (once per session)
mcp_jcodemunch_index_repo(path="/path/to/desktop")

# 2. Search for symbols
mcp_jcodemunch_search_symbols(query="TranslationService parseSRT")

# 3. Get specific symbols
mcp_jcodemunch_get_symbols(symbol_ids=[
    "LegendAI.Application/Services/TranslationService.cs::TranslationService#class",
    "LegendAI.Infrastructure/FileSystem/SRTParser.cs::Parse#method"
])

# 4. Get file outline (see all symbols in file)
mcp_jcodemunch_get_file_outline(file_path="Services/TranslationService.cs")
```

### sequential-thinking - When to Use

**Use before implementing:**

- Any new feature
- Complex refactoring
- Debugging non-trivial issues
- Architecture decisions

**Example:**

```
Problem: Need to implement fallback chain for AI providers

1. Load sequential-thinking tool
2. Describe: "Implement AI provider fallback chain that tries 4 providers in order, tracks quota, handles cooldowns"
3. Get step-by-step plan
4. Follow plan with TDD
```

### memory - What to Save

**User Memory (`/memories/`):**

- Recurring patterns: "Always validate subtitle count matches input"
- API quirks: "Gemini truncates after 400 tokens per chunk"
- Performance learnings: "Dapper 3x faster than EF for bulk reads"

**Session Memory (`/memories/session/`):**

- Current task progress
- Decisions made during session
- Things to remember for next steps

---

## Project Structure

```
LegendAI.Desktop/
│
├── LegendAI.Core/                    # Domain Layer - NO DEPENDENCIES
│   ├── Entities/
│   │   ├── Subtitle.cs              # Individual subtitle with timing
│   │   ├── Translation.cs           # Translation with metadata
│   │   └── TranslationJob.cs        # Job status tracking
│   ├── ValueObjects/
│   │   ├── FileName.cs              # Parsed filename (title, season, episode)
│   │   ├── TimingInfo.cs            # Start/end timestamps
│   │   └── SubtitleIndex.cs         # Position in sequence
│   ├── Interfaces/
│   │   ├── IAIProvider.cs           # Contract for AI providers
│   │   ├── IMetadataService.cs      # Contract for metadata fetching
│   │   ├── INotificationService.cs  # Contract for notifications
│   │   └── IRepository.cs           # Generic repository contract
│   ├── DomainServices/
│   │   ├── SubtitleValidator.cs     # Validation rules (count, timing)
│   │   └── TimingCalculator.cs      # Timing operations
│   └── Exceptions/
│       ├── InvalidSubtitleException.cs
│       └── TimingMismatchException.cs
│
├── LegendAI.Application/             # Application Layer (Use Cases)
│   ├── UseCases/
│   │   ├── TranslateSubtitle/
│   │   │   ├── TranslateSubtitleCommand.cs
│   │   │   ├── TranslateSubtitleHandler.cs
│   │   │   └── TranslateSubtitleValidator.cs
│   │   ├── ScanDirectory/
│   │   ├── MonitorFileSystem/
│   │   └── NotifyCompletion/
│   ├── Services/
│   │   ├── TranslationService.cs    # Translation orchestration
│   │   ├── FileMonitorService.cs    # File monitoring coordination
│   │   └── QueueService.cs          # Translation queue management
│   ├── DTOs/
│   │   ├── TranslationRequest.cs
│   │   ├── TranslationResponse.cs
│   │   └── FileMetadata.cs
│   └── Interfaces/
│       └── IApplicationService.cs
│
├── LegendAI.Infrastructure/          # Infrastructure Layer (External)
│   ├── FileSystem/
│   │   ├── FileWatcherService.cs    # Monitors directories (FileSystemWatcher)
│   │   ├── SRTParser.cs             # Parses .srt files (ported from web)
│   │   └── SRTBuilder.cs            # Builds .srt output
│   ├── AI/
│   │   ├── Providers/
│   │   │   ├── GeminiProvider.cs    # Google Gemini implementation
│   │   │   ├── GroqProvider.cs      # Groq API implementation
│   │   │   ├── TogetherAIProvider.cs
│   │   │   └── CohereProvider.cs
│   │   ├── AIProviderFactory.cs     # Creates providers based on config
│   │   ├── FallbackChain.cs         # Manages fallback logic
│   │   └── RateLimiter.cs           # Rate limiting per provider
│   ├── Metadata/
│   │   ├── OMDBClient.cs            # OMDB API client (Refit)
│   │   ├── FileNameParser.cs        # Extracts title/season/episode from filename
│   │   └── MetadataCache.cs         # Caches IMDB data in database
│   ├── Notifications/
│   │   ├── BaileysWhatsAppService.cs # WhatsApp via Baileys (Node.js bridge)
│   │   ├── TwilioWhatsAppService.cs  # WhatsApp via Twilio API
│   │   └── NotificationFactory.cs
│   ├── QBittorrent/
│   │   ├── QBittorrentClient.cs     # WebUI API client (Refit)
│   │   └── TorrentMonitor.cs        # Polls for completed torrents
│   ├── Persistence/
│   │   ├── LegendAIDbContext.cs     # EF Core DbContext
│   │   ├── Repositories/
│   │   │   ├── TranslationRepository.cs
│   │   │   └── MetadataRepository.cs
│   │   └── Migrations/
│   └── Configuration/
│       ├── DependencyInjection.cs   # IoC container setup
│       └── AppSettings.cs           # Configuration models
│
├── LegendAI.UI/                      # Presentation Layer (Avalonia)
│   ├── ViewModels/
│   │   ├── MainWindowViewModel.cs   # Main window state
│   │   ├── SettingsViewModel.cs     # Settings management
│   │   ├── LogsViewModel.cs         # Logs display
│   │   └── StatusViewModel.cs       # Status bar
│   ├── Views/
│   │   ├── MainWindow.axaml         # Main window XAML
│   │   ├── SettingsWindow.axaml     # Settings dialog
│   │   └── AboutWindow.axaml        # About dialog
│   ├── Services/
│   │   ├── DialogService.cs         # Handles dialogs
│   │   └── ThemeService.cs          # Dark/light theme switching
│   ├── Controls/
│   │   ├── LogViewer.axaml          # Custom log display control
│   │   └── ProgressCard.axaml       # Translation progress card
│   ├── Converters/
│   │   └── StatusToColorConverter.cs # XAML value converter
│   └── App.axaml.cs                 # Application entry point
│
└── LegendAI.Tests/                   # Test Projects
    ├── Core.Tests/
    │   ├── Entities/
    │   └── DomainServices/
    ├── Application.Tests/
    │   └── UseCases/
    └── Infrastructure.Tests/
        ├── FileSystem/
        ├── AI/
        └── Persistence/
```

---

## Key Features

### 1. Automatic File Detection (Multi-Source)

**Three monitoring sources:**

1. **Startup Scan**
   - Scans configured directories recursively on app start
   - Finds all .eng.srt files
   - Checks database for already-translated files (skip them)
   - Queues new files for translation

2. **FileSystemWatcher**
   - Monitors directories in real-time
   - Triggers on file creation
   - Debounces events (500ms) to avoid duplicates
   - Checks file stability (waits 3 seconds with no modifications)

3. **qBittorrent Polling**
   - Polls qBittorrent WebUI API every 30 seconds
   - Gets list of completed torrents since last check
   - Scans those specific directories for .eng.srt files
   - More efficient than monitoring entire file system

**De-duplication:** All three sources feed into `FileMonitorService` which ensures no file is processed twice.

### 2. AI Provider Fallback Chain

**Primary:** Google Gemini 2.0 Flash  
**Fallback 1:** Groq API (Llama 3.1, 14,400 req/day free)  
**Fallback 2:** Together AI ($25 free credit)  
**Fallback 3:** Cohere (5 req/min free)  
**Final:** Queue for retry after cooldown (1 hour)

**Quota Management:**

- Track API usage in database (`APIUsage` table)
- On quota exceeded (429/403): cooldown 60s (first failure) or 120s (repeated)
- Try next provider in chain immediately
- Log which provider was used for each translation

### 3. Rich Translation Context

**Context Pipeline:**

```
Filename: "The.Amazing.Race.S38E01.eng.srt"
   ↓
Parse filename → Title: "The Amazing Race", Season: 38, Episode: 1
   ↓
Query OMDB API → Synopsis: "...", Genre: "Reality-TV", Year: 2024
   ↓
Cache in database (avoid repeated API calls)
   ↓
Build enhanced prompt:
   "You are translating subtitles for: The Amazing Race (2024)
    Season 38, Episode 1
    Genre: Reality-TV
    Synopsis: [full synopsis]

    Please translate the following English subtitles to Brazilian Portuguese..."
```

**Benefits:** Better translation quality, context-aware idioms, proper terminology.

### 4. WhatsApp Notifications

**Option 1: Baileys (Recommended)**

- Direct WhatsApp Web protocol
- Completely free, unlimited messages
- Requires Node.js bridge (bridge runs in background)
- QR code scan once to pair
- Risk: Could be blocked by WhatsApp (rare)

**Option 2: Twilio (Fallback)**

- Official Twilio WhatsApp API
- Free sandbox: 500 messages/month
- More reliable, approved by WhatsApp
- Requires phone number verification

**Message Format:**

```
✅ LegendAI: Translation Complete!

File: The.Amazing.Race.S38E01.pt.srt
Subtitles: 1,234
Time: 4 min 32 sec
Provider: Gemini
```

### 5. Real-Time Logs UI

**Log Viewer Features:**

- Color-coded by level (Info=blue, Warning=yellow, Error=red)
- Filter by level
- Search/filter text
- Auto-scroll (toggleable)
- Export to file
- Shows timestamp, level, message, context

**Log Structure (Serilog):**

```csharp
Log.Information("Translation started for {FileName} with {ChunkCount} chunks",
    fileName, chunkCount);
// Output: [14:32:15 INFO] Translation started for Movie.eng.srt with 20 chunks
```

---

## Translation Rules

### Critical: Same Rules as Web Version

**These rules are SACRED and must match the web version exactly:**

1. **Never Modify Timestamps**
   - Input timing: `00:01:23,456 --> 00:01:25,789`
   - Output timing: `00:01:23,456 --> 00:01:25,789` (IDENTICAL)
   - If AI changes timing, REJECT the chunk

2. **Preserve Subtitle Count**
   - Input: 100 subtitles
   - Output: 100 subtitles
   - If counts don't match, REJECT and retry (or split chunk)

3. **Preserve Dialogue Formatting**
   - Input:
     ```
     -Hello!
     -Hi there!
     ```
   - Output:
     ```
     -Olá!
     -Oi!
     ```
   - Never concatenate dialogue lines

4. **Preserve Subtitle Indices**
   - Input subtitle #5 → Output subtitle #5
   - Positional mapping: `translatedSubtitles[inputSub.index - 1] = {...inputSub, text: translatedSub.text}`

5. **Sample Validation** (5 points)
   - Check timing integrity at: first, last, 25%, 50%, 75%
   - Validate count matches: `original.length === translated.length`
   - Log all discrepancies

### Validation Logic (Port from Web)

```csharp
public class SubtitleValidator
{
    public ValidationResult SampleValidation(
        List<Subtitle> original,
        List<Subtitle> translated)
    {
        // 1. Count validation
        if (original.Count != translated.Count)
        {
            _logger.Error(
                "Count mismatch: original={OriginalCount}, translated={TranslatedCount}",
                original.Count, translated.Count);
            return ValidationResult.Failed("Count mismatch");
        }

        // 2. Sample points (5)
        var indices = new[] { 0, original.Count - 1,
            original.Count / 4, original.Count / 2, 3 * original.Count / 4 };

        foreach (var i in indices)
        {
            if (original[i].Index != translated[i].Index)
                return ValidationResult.Failed($"Index mismatch at position {i}");

            if (original[i].StartTime != translated[i].StartTime ||
                original[i].EndTime != translated[i].EndTime)
                return ValidationResult.Failed($"Timing mismatch at position {i}");
        }

        return ValidationResult.Success();
    }
}
```

---

## AI Provider Strategy

### Implementation Pattern

**All providers implement:**

```csharp
public interface IAIProvider
{
    string Name { get; }

    Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken = default);

    bool IsAvailable();
}
```

### GeminiProvider (Primary)

**Port from web:** `app/api/route.ts`

```csharp
public class GeminiProvider : IAIProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<GeminiProvider> _logger;
    private const string MODEL = "gemini-2.0-flash-exp";

    public async Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        // Same prompt as web version
        var prompt = BuildPrompt(request);

        // Call Gemini API
        var response = await _httpClient.PostAsync(...);

        // Parse response
        var translated = ParseResponse(response);

        // Validate count matches
        if (translated.Count != request.Subtitles.Count)
            throw new ValidationException($"Count mismatch: expected {request.Subtitles.Count}, got {translated.Count}");

        return new TranslationResponse { Subtitles = translated };
    }

    private string BuildPrompt(TranslationRequest request)
    {
        // Include metadata context
        var context = request.Metadata != null
            ? $"Context: {request.Metadata.Title} ({request.Metadata.Year})\n" +
              $"Genre: {request.Metadata.Genre}\n" +
              $"Synopsis: {request.Metadata.Synopsis}\n\n"
            : "";

        return $"{context}Translate these English subtitles to Brazilian Portuguese:\n\n" +
               string.Join("\n\n", request.Subtitles.Select(FormatSubtitle));
    }
}
```

### Fallback Chain

```csharp
public class FallbackChain
{
    private readonly IAIProvider[] _providers;
    private readonly IAPIUsageRepository _usageRepo;

    public async Task<TranslationResponse> TranslateAsync(
        TranslationRequest request)
    {
        foreach (var provider in _providers)
        {
            // Check if provider is on cooldown
            if (await IsOnCooldown(provider))
            {
                _logger.Warning("Provider {Provider} on cooldown, skipping", provider.Name);
                continue;
            }

            try
            {
                _logger.Information("Trying provider: {Provider}", provider.Name);
                var response = await provider.TranslateAsync(request);

                // Success! Track usage and return
                await _usageRepo.RecordSuccessAsync(provider.Name);
                return response;
            }
            catch (QuotaExceededException ex)
            {
                _logger.Warning("Provider {Provider} quota exceeded", provider.Name);
                await _usageRepo.RecordQuotaExceededAsync(provider.Name);
                // Try next provider
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Provider {Provider} failed", provider.Name);
                // Try next provider
            }
        }

        // All providers failed
        throw new AllProvidersFailedException("All AI providers exhausted");
    }

    private async Task<bool> IsOnCooldown(IAIProvider provider)
    {
        var lastFailure = await _usageRepo.GetLastFailureAsync(provider.Name);
        if (lastFailure == null) return false;

        var cooldownMinutes = GetCooldownMinutes(lastFailure.ConsecutiveFailures);
        return DateTime.UtcNow < lastFailure.Timestamp.AddMinutes(cooldownMinutes);
    }

    private int GetCooldownMinutes(int consecutiveFailures)
    {
        return consecutiveFailures switch
        {
            1 => 1,    // 1 minute after first failure
            2 => 2,    // 2 minutes after second failure
            _ => 5     // 5 minutes after 3+ failures
        };
    }
}
```

### Rate Limiting

**Use Polly for rate limiting:**

```csharp
public class RateLimiter
{
    private readonly AsyncRateLimitPolicy _policy;

    public RateLimiter(int requestsPerMinute = 10)
    {
        _policy = Policy.RateLimitAsync(
            numberOfExecutions: requestsPerMinute,
            perTimeSpan: TimeSpan.FromMinutes(1));
    }

    public Task ExecuteAsync(Func<Task> action)
    {
        return _policy.ExecuteAsync(action);
    }
}
```

---

## File System Monitoring

### FileWatcherService

```csharp
public class FileWatcherService : IFileWatcherService
{
    private readonly FileSystemWatcher _watcher;
    private readonly ILogger<FileWatcherService> _logger;
    private readonly ConcurrentDictionary<string, DateTime> _pendingFiles;

    public FileWatcherService(IOptions<MonitoringOptions> options)
    {
        _watcher = new FileSystemWatcher
        {
            Path = options.Value.RootDirectory,
            Filter = "*.eng.srt",
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite
        };

        _watcher.Created += OnFileCreated;
        _watcher.Changed += OnFileChanged;

        // Large buffer for high-volume scenarios
        _watcher.InternalBufferSize = 64 * 1024; // 64KB
    }

    private void OnFileCreated(object sender, FileSystemEventArgs e)
    {
        _logger.Information("File detected: {FilePath}", e.FullPath);

        // Debounce: wait for file stability
        _pendingFiles[e.FullPath] = DateTime.UtcNow;

        // Check stability after 3 seconds
        Task.Delay(3000).ContinueWith(_ => CheckFileStability(e.FullPath));
    }

    private async Task CheckFileStability(string filePath)
    {
        if (!_pendingFiles.TryGetValue(filePath, out var lastModified))
            return;

        // Check if file hasn't been modified for 3 seconds
        if (DateTime.UtcNow - lastModified < TimeSpan.FromSeconds(3))
        {
            _logger.Debug("File {FilePath} still being written, waiting...", filePath);
            await Task.Delay(1000);
            await CheckFileStability(filePath); // Retry
            return;
        }

        // File is stable, check if it's locked
        if (IsFileLocked(filePath))
        {
            _logger.Warning("File {FilePath} is locked, waiting...", filePath);
            await Task.Delay(2000);
            await CheckFileStability(filePath); // Retry
            return;
        }

        // File is ready!
        _pendingFiles.TryRemove(filePath, out _);
        OnFileReady?.Invoke(this, new FileReadyEventArgs(filePath));
    }

    private bool IsFileLocked(string filePath)
    {
        try
        {
            using var stream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            return false; // Not locked
        }
        catch (IOException)
        {
            return true; // Locked
        }
    }

    public void Start()
    {
        _watcher.EnableRaisingEvents = true;
        _logger.Information("FileWatcher started monitoring: {Path}", _watcher.Path);
    }

    public void Stop()
    {
        _watcher.EnableRaisingEvents = false;
        _logger.Information("FileWatcher stopped");
    }

    public event EventHandler<FileReadyEventArgs>? OnFileReady;
}
```

### QBittorrent Integration

```csharp
public interface IQBittorrentClient
{
    [Post("/api/v2/auth/login")]
    Task<HttpResponseMessage> LoginAsync([Body(BodySerializationMethod.UrlEncoded)] LoginRequest request);

    [Get("/api/v2/torrents/info")]
    Task<List<Torrent>> GetTorrentsAsync([Query] string filter = "completed");
}

public class TorrentMonitor : BackgroundService
{
    private readonly IQBittorrentClient _client;
    private readonly ILogger<TorrentMonitor> _logger;
    private DateTime _lastCheck = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Login once
        await _client.LoginAsync(new LoginRequest { ... });

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var completed = await _client.GetTorrentsAsync("completed");

                // Filter: only torrents completed since last check
                var newCompletions = completed
                    .Where(t => t.CompletedOn > _lastCheck)
                    .ToList();

                if (newCompletions.Any())
                {
                    _logger.Information("Found {Count} newly completed torrents", newCompletions.Count);

                    foreach (var torrent in newCompletions)
                    {
                        // Trigger scan of this torrent's directory
                        OnTorrentCompleted?.Invoke(this, new TorrentCompletedEventArgs(torrent.ContentPath));
                    }

                    _lastCheck = DateTime.UtcNow;
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to poll qBittorrent");
            }

            // Poll every 30 seconds
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    public event EventHandler<TorrentCompletedEventArgs>? OnTorrentCompleted;
}
```

---

## Database Schema

**SQLite schema:**

```sql
-- Configuration
CREATE TABLE Config (
    Key TEXT PRIMARY KEY,
    Value TEXT NOT NULL
);

-- Translation jobs
CREATE TABLE TranslationJobs (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    FilePath TEXT NOT NULL UNIQUE,
    FileName TEXT NOT NULL,
    Status TEXT NOT NULL, -- Pending, InProgress, Completed, Failed
    SubtitleCount INTEGER,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    StartedAt DATETIME,
    CompletedAt DATETIME,
    ErrorMessage TEXT,
    AIProvider TEXT,
    RetryCount INTEGER DEFAULT 0
);
CREATE INDEX idx_status ON TranslationJobs(Status);
CREATE INDEX idx_filepath ON TranslationJobs(FilePath);

-- Metadata cache (IMDB)
CREATE TABLE MetadataCache (
    Title TEXT NOT NULL,
    Year INTEGER,
    ImdbId TEXT PRIMARY KEY,
    Synopsis TEXT,
    Genre TEXT,
    CachedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API usage tracking
CREATE TABLE APIUsage (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Provider TEXT NOT NULL,
    RequestTimestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    Success BOOLEAN,
    ErrorMessage TEXT
);
CREATE INDEX idx_provider_timestamp ON APIUsage(Provider, RequestTimestamp);

-- Logs
CREATE TABLE Logs (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Level TEXT NOT NULL,
    Message TEXT NOT NULL,
    StackTrace TEXT,
    Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_timestamp ON Logs(Timestamp DESC);
```

**Entity Framework migrations:**

```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```

---

## UI Design

### Main Window Layout

```
┌─────────────────────────────────────────────────────┐
│ [LegendAI Desktop]                          [- □ X] │
├─────────────────────────────────────────────────────┤
│ ┌─ Status ────────────────────────────────────────┐ │
│ │ ● Running - Monitoring: C:\Downloads\Media      │ │
│ │ Pending: 3 | In Progress: 1 | Completed: 127   │ │
│ │ Last Translation: S01E05 (2 min ago)           │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─ Active Translations ───────────────────────────┐ │
│ │ [ProgressCard]                                  │ │
│ │   File: Show.S01E06.eng.srt                    │ │
│ │   Progress: [████████████░░░] 75% (15/20)     │ │
│ │   Provider: Gemini | Time: 00:02:34           │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─ Logs (Live) ──────────────────────────[Filter]┐ │
│ │ [14:32:15 INFO ] New file detected: ...        │ │
│ │ [14:32:16 INFO ] IMDB: The Movie (2024)       │ │
│ │ [14:32:17 SUCCESS] Chunk 1/10 translated      │ │
│ │ [14:32:18 WARNING] Rate limit - waiting       │ │
│ │            ↓ Auto-scroll ↓                     │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─ API Status ────────────────────────────────────┐ │
│ │ Gemini: ✓ (1234/day) | Groq: ✓ | OMDB: ✓ 45   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ [Settings] [Export Logs] [Test WhatsApp] [About]  │
└─────────────────────────────────────────────────────┘
```

### MVVM Pattern

**ViewModel example:**

```csharp
public class MainWindowViewModel : ViewModelBase
{
    private readonly ITranslationService _translationService;
    private readonly ILogger<MainWindowViewModel> _logger;

    public ObservableCollection<TranslationJobViewModel> ActiveJobs { get; }
    public ObservableCollection<LogEntryViewModel> Logs { get; }

    private string _statusText;
    public string StatusText
    {
        get => _statusText;
        set => this.RaiseAndSetIfChanged(ref _statusText, value);
    }

    public ReactiveCommand<Unit, Unit> OpenSettingsCommand { get; }

    public MainWindowViewModel(ITranslationService translationService)
    {
        _translationService = translationService;

        OpenSettingsCommand = ReactiveCommand.Create(OpenSettings);

        // Subscribe to translation events
        _translationService.OnTranslationStarted += OnTranslationStarted;
        _translationService.OnProgressUpdated += OnProgressUpdated;
        _translationService.OnTranslationCompleted += OnTranslationCompleted;
    }

    private void OnProgressUpdated(object? sender, TranslationProgressEventArgs e)
    {
        var job = ActiveJobs.FirstOrDefault(j => j.Id == e.JobId);
        if (job != null)
        {
            job.Progress = e.Percentage;
            job.CurrentChunk = e.ChunkIndex;
            job.TotalChunks = e.TotalChunks;
        }
    }
}
```

---

## Testing Strategy

### Test Coverage Goals

| Layer          | Target Coverage       |
| -------------- | --------------------- |
| Core (Domain)  | 100%                  |
| Application    | 80%                   |
| Infrastructure | 60%                   |
| UI             | 40% (ViewModels only) |

### Testing Approaches

#### 1. Unit Tests (Fast, Isolated)

**Example: Domain entity test**

```csharp
public class SubtitleTests
{
    [Fact]
    public void Constructor_WithValidData_CreatesSubtitle()
    {
        // Arrange
        var index = 1;
        var startTime = TimeSpan.FromSeconds(1);
        var endTime = TimeSpan.FromSeconds(3);
        var text = "Hello";

        // Act
        var subtitle = new Subtitle(index, startTime, endTime, text);

        // Assert
        subtitle.Index.Should().Be(index);
        subtitle.StartTime.Should().Be(startTime);
        subtitle.EndTime.Should().Be(endTime);
        subtitle.Text.Should().Be(text);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Constructor_WithInvalidIndex_ThrowsException(int invalidIndex)
    {
        // Act
        Action act = () => new Subtitle(invalidIndex, TimeSpan.Zero, TimeSpan.Zero, "Text");

        // Assert
        act.Should().Throw<ArgumentException>();
    }
}
```

#### 2. Integration Tests (With Real Dependencies)

**Example: SRT parser integration test**

```csharp
public class SRTParserIntegrationTests
{
    [Fact]
    public async Task Parse_WithRealSRTFile_ReturnsCorrectSubtitles()
    {
        // Arrange
        var srtContent = await File.ReadAllTextAsync("TestData/sample.eng.srt");
        var parser = new SRTParser();

        // Act
        var subtitles = parser.Parse(srtContent);

        // Assert
        subtitles.Should().HaveCount(100); // Verify expected count
        subtitles[0].Index.Should().Be(1);
        subtitles[0].Text.Should().NotBeNullOrEmpty();
    }
}
```

#### 3. Mocking External Services

**Example: Mock AI provider**

```csharp
public class TranslationServiceTests
{
    [Fact]
    public async Task TranslateAsync_WhenProviderSucceeds_ReturnsTranslation()
    {
        // Arrange
        var mockProvider = new Mock<IAIProvider>();
        mockProvider
            .Setup(x => x.TranslateAsync(It.IsAny<TranslationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TranslationResponse
            {
                Subtitles = new List<Subtitle> { new Subtitle(1, TimeSpan.Zero, TimeSpan.FromSeconds(2), "Olá") }
            });

        var service = new TranslationService(mockProvider.Object);

        // Act
        var result = await service.TranslateAsync(new TranslationRequest { ... });

        // Assert
        result.Should().NotBeNull();
        result.Subtitles.Should().HaveCount(1);
        mockProvider.Verify(x => x.TranslateAsync(It.IsAny<TranslationRequest>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

---

## Performance Optimization

### Key Optimizations

1. **Async/Await Throughout**
   - All I/O operations fully async
   - No blocking calls
2. **Parallel Chunk Translation**
   - Translate multiple chunks in parallel (with rate limiting)
   - `Task.WhenAll(chunks.Select(chunk => TranslateChunkAsync(chunk)))`

3. **Database Batching**
   - Batch insert logs (buffer 100 entries)
   - Use Dapper for read-heavy queries (3x faster than EF)

4. **File System Optimization**
   - Single FileSystemWatcher (not one per folder)
   - Debounce events (500ms)
   - Large buffer (64KB)

5. **Memory Management**
   - Dispose `HttpClient`, `FileStream`, `DbContext` properly
   - Limit concurrent translations (max 3)
   - Clear old logs from memory

6. **Benchmarking**
   - Use BenchmarkDotNet for critical paths
   - Profile with dotMemory/dotTrace

### Benchmark Example

```csharp
[MemoryDiagnoser]
public class SRTParserBenchmarks
{
    private string _srtContent;

    [GlobalSetup]
    public void Setup()
    {
        _srtContent = File.ReadAllText("large-file.srt");
    }

    [Benchmark]
    public List<Subtitle> ParseSRT()
    {
        return SRTParser.Parse(_srtContent);
    }
}
```

---

## Deployment

### Build & Publish

```bash
# Self-contained build (includes .NET runtime)
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true

# Output: bin/Release/net8.0/win-x64/publish/LegendAI.exe
```

### Installer (Inno Setup)

**Script:** `installer.iss`

```ini
[Setup]
AppName=LegendAI Desktop
AppVersion=1.0.0
DefaultDirName={pf}\LegendAI
DefaultGroupName=LegendAI
OutputDir=installer
OutputBaseFilename=LegendAI-Setup-v1.0.0

[Files]
Source: "bin\Release\net8.0\win-x64\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\LegendAI Desktop"; Filename: "{app}\LegendAI.exe"
Name: "{commondesktop}\LegendAI Desktop"; Filename: "{app}\LegendAI.exe"

[Run]
Filename: "{app}\LegendAI.exe"; Description: "Launch LegendAI Desktop"; Flags: nowait postinstall skipifsilent

[Registry]
; Auto-start with Windows (optional)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "LegendAI"; ValueData: "{app}\LegendAI.exe --minimized"; Flags: uninsdeletevalue
```

### Configuration Files

**appsettings.json** (ships with app):

```json
{
	"App": {
		"Name": "LegendAI Desktop",
		"Version": "1.0.0"
	},
	"Monitoring": {
		"RootDirectories": [],
		"FileStabilityWaitSeconds": 3,
		"ScanOnStartup": true
	},
	"Translation": {
		"ChunkSize": 100,
		"MaxConcurrentTranslations": 3
	},
	"AI": {
		"PrimaryProvider": "Gemini",
		"FallbackChain": ["Groq", "TogetherAI", "Cohere"]
	}
}
```

**User settings** (in `%APPDATA%\LegendAI\config.json` - encrypted):

```json
{
	"ApiKeys": {
		"Gemini": "...",
		"Groq": "...",
		"OMDB": "..."
	},
	"QBittorrent": {
		"Enabled": true,
		"Url": "http://localhost:8080",
		"Username": "...",
		"Password": "..." // Encrypted
	}
}
```

---

## Common Tasks

### Add New AI Provider

1. **Create provider class:**

```csharp
public class NewAIProvider : IAIProvider
{
    public string Name => "NewProvider";

    public async Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        // Implementation
    }

    public bool IsAvailable() => true;
}
```

2. **Register in DI:**

```csharp
services.AddSingleton<IAIProvider, NewAIProvider>();
```

3. **Add to fallback chain:**

```json
{
	"AI": {
		"FallbackChain": ["Gemini", "Groq", "NewProvider"]
	}
}
```

4. **Write tests:**

```csharp
public class NewAIProviderTests
{
    [Fact]
    public async Task TranslateAsync_WithValidInput_ReturnsTranslation()
    {
        // Test implementation
    }
}
```

### Debug Translation Issue

1. **Check logs:** UI → Logs tab → Filter by Error
2. **Check database:** Query `TranslationJobs` table for error messages
3. **Review API usage:** Query `APIUsage` table for provider failures
4. **Test individual components:**
   - SRT parser: Unit test with problematic file
   - AI provider: Mock HTTP response, test parsing logic
   - Validation: Test with known-good input

### Optimize Performance

1. **Profile with dotTrace:** Identify hot paths
2. **Benchmark critical methods:** Use BenchmarkDotNet
3. **Check database queries:** Enable EF logging, look for N+1 queries
4. **Monitor memory:** Use dotMemory to find leaks

---

## Troubleshooting

### Issue: FileSystemWatcher Missing Files

**Symptoms:** Files created but not detected  
**Causes:**

- Buffer overflow (too many files at once)
- Event fired before file is fully written

**Solutions:**

- Increase buffer size: `_watcher.InternalBufferSize = 64 * 1024;`
- Check file stability (wait for no modifications)
- Use qBittorrent integration as backup detection

### Issue: AI Provider Quota Exceeded

**Symptoms:** All providers failing, translations stuck  
**Causes:**

- Hit daily limits on all providers
- Cooldown times not respected

**Solutions:**

- Check `APIUsage` table for request counts
- Verify cooldown logic in `FallbackChain`
- Add more API keys (multiple Gemini keys)
- Increase cooldown times

### Issue: WhatsApp Notifications Not Sending

**Symptoms:** Translations complete but no notifications  
**Causes:**

- Baileys not connected (QR code expired)
- Twilio credentials invalid
- Network issues

**Solutions:**

- Baileys: Re-scan QR code in settings
- Twilio: Verify credentials, check sandbox approval
- Test notification: UI → "Test WhatsApp" button
- Check logs for error messages

### Issue: High CPU Usage

**Symptoms:** CPU > 20% when idle  
**Causes:**

- FileSystemWatcher polling too aggressively
- Too many concurrent translations
- Inefficient database queries

**Solutions:**

- Review FileSystemWatcher settings
- Reduce `MaxConcurrentTranslations` to 1-2
- Add database indexes
- Profile with dotTrace, identify hot loops

---

## Documentation Files

**Always keep these updated:**

- `.copilot/DESKTOP-SKILL.MD` (this file) - Master guide
- `docs/desktop/ARCHITECTURE.md` - Architecture details
- `docs/desktop/ROADMAP.md` - Development phases
- `.github/instructions/desktop-*.instructions.md` - Domain-specific rules
- `docs/desktop/USER-GUIDE.md` - End-user documentation
- `docs/desktop/API-KEYS-SETUP.md` - How to get API keys

---

## Success Criteria

### Must Have (v1.0)

- ✅ Automatic file detection (3 sources)
- ✅ Translation with 4 AI providers + fallback
- ✅ Same validation rules as web version
- ✅ IMDB metadata integration
- ✅ WhatsApp notifications
- ✅ qBittorrent integration
- ✅ Real-time logs UI
- ✅ Auto-start with Windows
- ✅ 80%+ code coverage
- ✅ SOLID principles throughout

### Nice to Have (v2.0)

- ASS/SSA subtitle support
- Translation memory (reuse translations)
- Cloud sync
- Web dashboard
- Multi-language support

---

## Next Steps

1. **User Approvals:**
   - [ ] Approve .NET 8 + Avalonia stack
   - [ ] Provide API keys (Groq, Together AI, Cohere, OMDB)
   - [ ] Choose WhatsApp method (Baileys vs Twilio)
   - [ ] Enable qBittorrent WebUI

2. **Begin Development:**
   - [ ] Phase 1: Foundation (Week 1)
   - [ ] Set up solution structure
   - [ ] Implement Core domain entities with tests
   - [ ] Set up database with EF migrations

**Target:** Production-ready v1.0.0 by April 21, 2026

---

**Remember:** Always use MCPs (sequential-thinking, jcodemunch, memory) before coding. Always follow TDD. Always apply SOLID principles. Code quality is non-negotiable.
