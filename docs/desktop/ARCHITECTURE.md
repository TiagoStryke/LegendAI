# LegendAI Desktop - Architecture

> **Last Updated:** March 9, 2026  
> **Status:** Design Phase  
> **Version:** v1.0.0 (planned)

---

## Overview

LegendAI Desktop is a high-performance Windows desktop application for automatic subtitle translation. Built with .NET 8 and Clean Architecture principles, it monitors directories for new English subtitle files, translates them to Brazilian Portuguese using multiple AI providers, and saves the translations automatically.

---

## Architecture Style

**Clean Architecture** (Onion Architecture) with clear separation of concerns:

```
┌─────────────────────────────────────┐
│          UI Layer (Avalonia)        │  ← Presentation
├─────────────────────────────────────┤
│     Application Layer (Use Cases)   │  ← Business Logic
├─────────────────────────────────────┤
│   Infrastructure Layer (External)   │  ← IO, APIs, DB
├─────────────────────────────────────┤
│      Core Layer (Domain Model)      │  ← Pure C# Logic
└─────────────────────────────────────┘
```

**Dependencies flow inward:** UI → Application → Infrastructure → Core  
**Core has zero dependencies** on external frameworks.

---

## Project Structure

```
LegendAI.Desktop/
│
├── LegendAI.Core/                    # Domain Layer
│   ├── Entities/                     # Core business entities
│   │   ├── Subtitle.cs              # Individual subtitle entry
│   │   ├── Translation.cs           # Translation job entity
│   │   └── TranslationJob.cs        # Job with status tracking
│   ├── ValueObjects/                # Immutable value types
│   │   ├── FileName.cs              # Parsed filename
│   │   ├── TimingInfo.cs            # Start/end timestamps
│   │   └── SubtitleIndex.cs         # Position in sequence
│   ├── Interfaces/                  # Contracts for outer layers
│   │   ├── Repositories/
│   │   │   ├── ITranslationRepository.cs
│   │   │   └── IMetadataRepository.cs
│   │   └── Services/
│   │       ├── IAIProvider.cs
│   │       ├── IMetadataService.cs
│   │       └── INotificationService.cs
│   ├── DomainServices/              # Pure business logic
│   │   ├── SubtitleValidator.cs     # Validation rules
│   │   └── TimingCalculator.cs      # Timing operations
│   └── Exceptions/                   # Domain exceptions
│       ├── InvalidSubtitleException.cs
│       └── TimingMismatchException.cs
│
├── LegendAI.Application/             # Application Layer
│   ├── UseCases/                     # Business use cases
│   │   ├── TranslateSubtitle/
│   │   │   ├── TranslateSubtitleCommand.cs
│   │   │   ├── TranslateSubtitleHandler.cs
│   │   │   └── TranslateSubtitleValidator.cs
│   │   ├── ScanDirectory/
│   │   │   ├── ScanDirectoryCommand.cs
│   │   │   └── ScanDirectoryHandler.cs
│   │   ├── MonitorFileSystem/
│   │   │   ├── MonitorFileSystemCommand.cs
│   │   │   └── MonitorFileSystemHandler.cs
│   │   └── NotifyCompletion/
│   │       ├── NotifyCompletionCommand.cs
│   │       └── NotifyCompletionHandler.cs
│   ├── Services/                     # Application services
│   │   ├── TranslationService.cs    # Orchestrates translation
│   │   ├── FileMonitorService.cs    # Manages file watching
│   │   └── QueueService.cs          # Translation queue
│   ├── DTOs/                         # Data transfer objects
│   │   ├── TranslationRequest.cs
│   │   ├── TranslationResponse.cs
│   │   └── FileMetadata.cs
│   └── Interfaces/
│       └── IApplicationService.cs
│
├── LegendAI.Infrastructure/          # Infrastructure Layer
│   ├── FileSystem/                   # File operations
│   │   ├── FileWatcherService.cs    # Monitors directories
│   │   ├── SRTParser.cs             # Parses .srt files (from web)
│   │   └── SRTBuilder.cs            # Builds .srt output
│   ├── AI/                           # AI provider implementations
│   │   ├── Providers/
│   │   │   ├── GeminiProvider.cs    # Google Gemini
│   │   │   ├── GroqProvider.cs      # Groq API
│   │   │   ├── TogetherAIProvider.cs
│   │   │   └── CohereProvider.cs
│   │   ├── AIProviderFactory.cs     # Creates providers
│   │   ├── FallbackChain.cs         # Manages fallback logic
│   │   └── RateLimiter.cs           # Rate limiting logic
│   ├── Metadata/                     # External metadata services
│   │   ├── OMDBClient.cs            # OMDB API client
│   │   ├── FileNameParser.cs        # Extracts title/season/episode
│   │   └── MetadataCache.cs         # Caches IMDB data
│   ├── Notifications/                # Notification providers
│   │   ├── BaileysWhatsAppService.cs # WhatsApp via Baileys
│   │   ├── TwilioWhatsAppService.cs  # WhatsApp via Twilio
│   │   └── NotificationFactory.cs
│   ├── QBittorrent/                  # qBittorrent integration
│   │   ├── QBittorrentClient.cs     # WebUI API client
│   │   └── TorrentMonitor.cs        # Polls for completed torrents
│   ├── Persistence/                  # Database access
│   │   ├── LegendAIDbContext.cs     # EF Core context
│   │   ├── Repositories/
│   │   │   ├── TranslationRepository.cs
│   │   │   └── MetadataRepository.cs
│   │   └── Migrations/              # EF migrations
│   └── Configuration/
│       ├── DependencyInjection.cs   # IoC container setup
│       └── AppSettings.cs           # Configuration models
│
├── LegendAI.UI/                      # Presentation Layer (Avalonia)
│   ├── ViewModels/                   # MVVM ViewModels
│   │   ├── MainWindowViewModel.cs
│   │   ├── SettingsViewModel.cs
│   │   ├── LogsViewModel.cs
│   │   └── StatusViewModel.cs
│   ├── Views/                        # XAML views
│   │   ├── MainWindow.axaml
│   │   ├── SettingsWindow.axaml
│   │   └── AboutWindow.axaml
│   ├── Services/                     # UI-specific services
│   │   ├── DialogService.cs
│   │   └── ThemeService.cs
│   ├── Controls/                     # Custom controls
│   │   ├── LogViewer.axaml
│   │   └── ProgressCard.axaml
│   ├── Converters/                   # Value converters
│   │   └── StatusToColorConverter.cs
│   └── App.axaml.cs                 # Application entry point
│
└── LegendAI.Tests/                   # Test Projects
    ├── Core.Tests/                   # Domain tests
    │   ├── Entities/
    │   └── DomainServices/
    ├── Application.Tests/            # Use case tests
    │   └── UseCases/
    └── Infrastructure.Tests/         # Integration tests
        ├── FileSystem/
        ├── AI/
        └── Persistence/
```

---

## Layer Responsibilities

### 1. Core Layer (Domain)

**Responsibility:** Pure business logic, entities, and domain rules.  
**Dependencies:** None (pure C#).  
**Examples:**

- `Subtitle` entity with validation
- `TimingInfo` value object
- `IAIProvider` interface contract

### 2. Application Layer (Use Cases)

**Responsibility:** Orchestrate business logic, coordinate between domain and infrastructure.  
**Dependencies:** Core only.  
**Examples:**

- `TranslateSubtitleHandler` - orchestrates translation process
- `ScanDirectoryHandler` - coordinates directory scanning
- `FileMonitorService` - manages file monitoring state

### 3. Infrastructure Layer (External Concerns)

**Responsibility:** Implement interfaces, interact with external systems.  
**Dependencies:** Core, Application, external libraries.  
**Examples:**

- `GeminiProvider` implements `IAIProvider`
- `FileWatcherService` monitors file system
- `TranslationRepository` implements `ITranslationRepository`

### 4. UI Layer (Presentation)

**Responsibility:** User interface, user interaction, display data.  
**Dependencies:** Application, Core (interfaces only).  
**Examples:**

- `MainWindowViewModel` - MVVM view model
- `MainWindow.axaml` - XAML UI definition
- `DialogService` - handles dialogs

---

## Data Flow

### Translation Flow

```
1. File Detected (FileSystemWatcher)
   ↓
2. FileMonitorService notifies Application
   ↓
3. ScanDirectoryHandler creates TranslateSubtitleCommand
   ↓
4. TranslateSubtitleHandler executes:
   a. Parse SRT (SRTParser)
   b. Extract metadata (FileNameParser + OMDBClient)
   c. Chunk subtitles (same logic as web: 100 per chunk)
   d. For each chunk:
      - Build translation prompt with metadata context
      - Call AI provider (GeminiProvider -> fallback chain)
      - Validate response (count matches, timings preserved)
   e. Assemble final SRT (SRTBuilder)
   f. Save to file (FileSystem)
   g. Log to database (TranslationRepository)
   h. Send notification (WhatsAppService)
   ↓
5. UI updates (via ViewModel observables)
```

### Startup Flow

```
1. App.axaml.cs loads
   ↓
2. DependencyInjection configures IoC
   ↓
3. Load configuration (appsettings.json + user settings)
   ↓
4. Initialize database (EF migrations)
   ↓
5. Start FileWatcherService
   ↓
6. Initial directory scan (ScanDirectoryHandler)
   ↓
7. Start qBittorrent polling (TorrentMonitor)
   ↓
8. Show MainWindow
```

---

## Key Design Decisions

### 1. Why Clean Architecture?

- **Testability:** Can test Core without any infrastructure
- **Maintainability:** Changes in UI don't affect business logic
- **Flexibility:** Easy to swap implementations (e.g., different AI providers)
- **Independence:** Core logic portable to other platforms

### 2. Why Avalonia over WPF?

- **Modern XAML:** Better tooling, hot reload
- **Cross-platform:** Future Linux/Mac support if needed
- **Dark mode:** Native support
- **Active development:** WPF is in maintenance mode

### 3. Why SQLite?

- **No server:** Embedded, no setup
- **Fast:** Sufficient for local app
- **Portable:** Single .db file
- **Reliable:** Battle-tested

### 4. Why Multiple AI Providers?

- **Resilience:** No single point of failure
- **Cost:** Free tiers across multiple services
- **Performance:** Fallback if one is slow/down

### 5. Why TDD?

- **Quality:** Catch bugs early
- **Design:** Forces good architecture
- **Confidence:** Refactor without fear
- **Documentation:** Tests as living docs

---

## Cross-Cutting Concerns

### Logging

- **Framework:** Serilog
- **Sinks:** File (daily rotation), Database, UI (in-memory buffer)
- **Structure:** JSON structured logs with context
- **Levels:** Verbose, Debug, Info, Warning, Error, Fatal

### Error Handling

- **Domain:** Throw domain exceptions
- **Application:** Catch and convert to Result<T>
- **Infrastructure:** Retry with Polly, log failures
- **UI:** Display user-friendly messages, never crash

### Configuration

- **appsettings.json:** Default configuration
- **User settings:** Encrypted in user profile
- **Environment variables:** Override for deployment

### Dependency Injection

- **Container:** Microsoft.Extensions.DependencyInjection
- **Lifetime:** Singleton for services, Transient for handlers, Scoped for DbContext

---

## Performance Considerations

### Async/Await Throughout

All I/O operations (file, network, database) are fully async to avoid blocking.

### Parallel Translation

Translate multiple chunks in parallel (with rate limiting) using `Task.WhenAll`.

### Database Optimization

- Indexed queries on `FilePath`, `Status`, `Provider`, `Timestamp`
- Batch inserts for logs
- Use Dapper for read-heavy operations (faster than EF)

### File System Optimization

- Single FileSystemWatcher for root directory (not one per subfolder)
- Debounce events (500ms) to avoid duplicate notifications
- Large buffer (64KB) for high-volume scenarios

### Memory Management

- Dispose resources properly (`using` statements)
- Limit concurrent translations (max 3 at once)
- Clear old logs/jobs from memory after N days

---

## Security Considerations

- **API Keys:** Encrypted in user profile, never in source code
- **Database:** Local SQLite, no network exposure
- **WhatsApp:** Session encrypted, QR code only shown once
- **File Access:** Only reads .srt files, writes .pt.srt (no system files)
- **Network:** HTTPS only for all API calls

---

## Future Extensibility

- **New AI Providers:** Implement `IAIProvider` interface
- **New Notification Channels:** Implement `INotificationService`
- **New Metadata Sources:** Implement `IMetadataService`
- **Cross-Platform:** Avalonia already supports Linux/Mac
- **Cloud Sync:** Add cloud repository implementation

---

## Comparison with Web Version

| Aspect                | Web (Next.js)      | Desktop (.NET)            |
| --------------------- | ------------------ | ------------------------- |
| **Platform**          | Browser            | Windows native            |
| **Performance**       | Good (serverless)  | Excellent (native)        |
| **File Access**       | Upload only        | Direct file system        |
| **Monitoring**        | Manual             | Automatic                 |
| **Offline**           | No                 | Partial (cached metadata) |
| **Architecture**      | Pages + API routes | Clean Architecture        |
| **Testing**           | Limited            | Full TDD                  |
| **AI Providers**      | Gemini only        | Gemini + 3 fallbacks      |
| **Notifications**     | None               | WhatsApp                  |
| **Translation Rules** | ✅ Same            | ✅ Same                   |

**Key:** Both maintain identical subtitle validation rules and timing preservation logic.

---

## Next Steps

See [ROADMAP.md](./ROADMAP.md) for detailed development phases.
