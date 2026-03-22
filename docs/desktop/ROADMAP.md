# LegendAI Desktop - Development Roadmap

> **Timeline:** 6 weeks (42 days)  
> **Start Date:** March 10, 2026  
> **Target Release:** April 21, 2026  
> **Approach:** Test-Driven Development (TDD)

---

## Overview

This roadmap breaks down the development of LegendAI Desktop into 7 phases, each with clear deliverables and acceptance criteria. Every feature starts with tests (Red), then implementation (Green), then refactoring (Refactor).

---

## Phase 1: Foundation (Week 1 - Days 1-7)

### Goal

Establish project structure, dependencies, and core domain entities with comprehensive testing.

### Tasks

#### Day 1-2: Project Setup

- [ ] Create .NET 8 solution with Clean Architecture layers
- [ ] Set up projects: Core, Application, Infrastructure, UI, Tests
- [ ] Configure NuGet packages:
  - [ ] Avalonia UI 11.x
  - [ ] Entity Framework Core 8.x
  - [ ] Dapper (for performance queries)
  - [ ] Serilog (logging)
  - [ ] Polly (resilience)
  - [ ] Refit (REST clients)
  - [ ] xUnit, FluentAssertions, Moq (testing)
  - [ ] FluentValidation (input validation)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Configure EditorConfig and .gitignore

#### Day 3-4: Domain Layer (TDD)

**Tests First:**

- [ ] Test Subtitle entity validation
- [ ] Test TimingInfo calculations
- [ ] Test FileName parsing
- [ ] Test SubtitleIndex behavior

**Implementation:**

- [ ] Implement `Subtitle` entity
- [ ] Implement `TimingInfo` value object
- [ ] Implement `FileName` value object
- [ ] Implement `SubtitleIndex` value object
- [ ] Create domain interfaces (`IAIProvider`, `INotificationService`, etc.)

#### Day 5-6: Database Setup

**Tests First:**

- [ ] Test entity configurations
- [ ] Test repository contract compliance

**Implementation:**

- [ ] Create `LegendAIDbContext`
- [ ] Define entity configurations (EF fluent API)
- [ ] Create initial migration
- [ ] Implement `TranslationRepository`
- [ ] Implement `MetadataRepository`

#### Day 7: Domain Services (TDD)

**Tests First:**

- [ ] Test `SubtitleValidator` rules
- [ ] Test `TimingCalculator` operations

**Implementation:**

- [ ] Implement `SubtitleValidator`
- [ ] Implement `TimingCalculator`

### Deliverables

- ✅ Solution structure with all projects
- ✅ Testable Core layer (80%+ coverage)
- ✅ Database schema and migrations
- ✅ CI/CD pipeline running tests

### Acceptance Criteria

- All Core tests pass
- Database migrations apply cleanly
- CI pipeline builds and tests successfully
- Code coverage ≥ 80% for Core layer

---

## Phase 2: File System & Parsing (Week 2 - Days 8-14)

### Goal

Implement SRT parsing, file system monitoring, and subtitle chunking logic.

### Tasks

#### Day 8-9: SRT Parser (Port from Web + TDD)

**Tests First:**

- [ ] Test parsing valid SRT files
- [ ] Test parsing malformed SRT files
- [ ] Test empty files, missing indices
- [ ] Test special characters and encoding

**Implementation:**

- [ ] Port `parseSRT` from web (lib/srt.ts → SRTParser.cs)
- [ ] Port `buildSRT` from web (SRTBuilder.cs)
- [ ] Port `chunkSubtitles` (ChunkingService.cs)
- [ ] Port `sampleValidation` (SubtitleValidator.cs)

#### Day 10-11: File Name Parser (TDD)

**Tests First:**

- [ ] Test various filename patterns:
  - [ ] `Movie.Title.2024.1080p.eng.srt`
  - [ ] `Show.S01E05.Episode.Name.eng.srt`
  - [ ] `Series.2024.S03E10.eng.srt`
- [ ] Test edge cases (no year, no quality, etc.)

**Implementation:**

- [ ] Implement `FileNameParser.cs`
- [ ] Extract title, year, season, episode
- [ ] Create `FileMetadata` DTO

#### Day 12-13: File System Watcher (TDD)

**Tests First:**

- [ ] Test file detection on creation
- [ ] Test file stability detection (not currently writing)
- [ ] Test debouncing duplicate events
- [ ] Test recursive directory scanning

**Implementation:**

- [ ] Implement `FileWatcherService.cs`
- [ ] File stability check (wait for 3 seconds of no modifications)
- [ ] Debouncing logic (500ms)
- [ ] Event publishing to application layer

#### Day 14: Initial Scan (TDD)

**Tests First:**

- [ ] Test scanning directory recursively
- [ ] Test filtering .eng.srt files
- [ ] Test skipping already-translated files

**Implementation:**

- [ ] Implement `DirectoryScanService.cs`
- [ ] Async enumeration of files
- [ ] Database lookup for existing translations

### Deliverables

- ✅ SRT parser with 100% parity with web version
- ✅ File name parser (extracts metadata)
- ✅ File system watcher (detects new files)
- ✅ Initial directory scanner

### Acceptance Criteria

- All parsing tests (from web) pass
- FileSystemWatcher detects new .eng.srt files
- No duplicate events for same file
- Skips already-translated files correctly

---

## Phase 3: AI Integration (Week 3 - Days 15-21)

### Goal

Implement AI providers with fallback chain, rate limiting, and chunk-based translation.

### Tasks

#### Day 15-16: Gemini Provider (Port from Web + TDD)

**Tests First:**

- [ ] Test successful translation
- [ ] Test API error handling
- [ ] Test quota exceeded scenarios
- [ ] Test rate limiting

**Implementation:**

- [ ] Implement `GeminiProvider.cs`
- [ ] Port translation logic from web (`app/api/route.ts`)
- [ ] Same prompt structure as web
- [ ] Same validation rules (count matches, timings preserved)

#### Day 17: Fallback Providers (TDD)

**Tests First:**

- [ ] Test each provider independently
- [ ] Mock HTTP responses

**Implementation:**

- [ ] Implement `GroqProvider.cs`
- [ ] Implement `TogetherAIProvider.cs`
- [ ] Implement `CohereProvider.cs`
- [ ] All implement `IAIProvider` interface

#### Day 18: Fallback Chain (TDD)

**Tests First:**

- [ ] Test primary provider success (no fallback)
- [ ] Test primary fails, fallback 1 succeeds
- [ ] Test all fail, queue for retry
- [ ] Test quota tracking

**Implementation:**

- [ ] Implement `FallbackChain.cs`
- [ ] Implement `AIProviderFactory.cs`
- [ ] Implement quota tracking in database
- [ ] Cooldown logic (60s for first failure, 2min for repeated)

#### Day 19-20: Rate Limiting (TDD)

**Tests First:**

- [ ] Test 10 RPM limit enforced
- [ ] Test requests spread evenly within minute
- [ ] Test multiple concurrent requests

**Implementation:**

- [ ] Implement `RateLimiter.cs` using Polly
- [ ] Track requests per minute per provider
- [ ] Automatic delays to respect limits

#### Day 21: Translation Orchestration (TDD)

**Tests First:**

- [ ] Test full translation flow end-to-end
- [ ] Test chunking logic (100 per chunk)
- [ ] Test chunk validation (count matches)
- [ ] Test timing preservation

**Implementation:**

- [ ] Implement `TranslateSubtitleHandler.cs`
- [ ] Orchestrate: parse → chunk → translate → validate → build
- [ ] Same positional assembly logic as web
- [ ] Handle errors and retries

### Deliverables

- ✅ 4 AI providers implemented
- ✅ Fallback chain with quota management
- ✅ Rate limiting per provider
- ✅ End-to-end translation working

### Acceptance Criteria

- Can translate subtitle file using Gemini
- Fallback works when primary fails
- Rate limits respected (no 429 errors)
- Output .pt.srt has exact same count and timings as input

---

## Phase 4: Metadata & Context (Week 3-4 - Days 22-28)

### Goal

Integrate OMDB API, cache metadata, and enhance translation prompts with rich context.

### Tasks

#### Day 22-23: OMDB Client (TDD)

**Tests First:**

- [ ] Test search by title and year
- [ ] Test response parsing
- [ ] Test API errors
- [ ] Test missing/invalid data

**Implementation:**

- [ ] Implement `OMDBClient.cs` using Refit
- [ ] Search movies/series by title
- [ ] Fetch synopsis, genre, year
- [ ] Error handling and retries

#### Day 24: Metadata Cache (TDD)

**Tests First:**

- [ ] Test cache hit (don't call API)
- [ ] Test cache miss (call API, then cache)
- [ ] Test cache expiration

**Implementation:**

- [ ] Implement `MetadataCache.cs`
- [ ] Database table for cached metadata
- [ ] TTL: 30 days

#### Day 25-26: Enhanced Translation Context (TDD)

**Tests First:**

- [ ] Test prompt includes title
- [ ] Test prompt includes synopsis
- [ ] Test prompt includes genre
- [ ] Test fallback if no metadata found

**Implementation:**

- [ ] Modify `TranslateSubtitleHandler` to fetch metadata
- [ ] Build prompt with context:

  ```
  You are translating subtitles for: [Title] ([Year])
  Genre: [Genre]
  Synopsis: [Synopsis]

  Please translate the following subtitles to Brazilian Portuguese...
  ```

#### Day 27-28: Filename → Metadata Pipeline (TDD)

**Tests First:**

- [ ] Test extraction from filename
- [ ] Test OMDB query
- [ ] Test caching after first query
- [ ] Integration test: filename → OMDB → cache → translation

**Implementation:**

- [ ] Complete integration in `TranslateSubtitleHandler`
- [ ] Log metadata fetching
- [ ] Handle missing metadata gracefully (use filename only)

### Deliverables

- ✅ OMDB API integration
- ✅ Metadata caching
- ✅ Enhanced translation prompts with rich context

### Acceptance Criteria

- OMDB data fetched for detected files
- Metadata cached (no duplicate API calls)
- Translation prompts include title, synopsis, genre
- Translation quality improved with context

---

## Phase 5: qBittorrent & Monitoring (Week 4 - Days 29-35)

### Goal

Integrate qBittorrent WebUI API, detect completed downloads, and implement efficient monitoring.

### Tasks

#### Day 29-30: qBittorrent Client (TDD)

**Tests First:**

- [ ] Test authentication
- [ ] Test fetching torrent list
- [ ] Test filtering completed torrents
- [ ] Test getting torrent content path
- [ ] Mock WebUI responses

**Implementation:**

- [ ] Implement `QBittorrentClient.cs` using Refit
- [ ] Authenticate with WebUI
- [ ] Query completed torrents
- [ ] Get file paths from torrent

#### Day 31-32: Torrent Monitor (TDD)

**Tests First:**

- [ ] Test polling every 30 seconds
- [ ] Test detecting new completed torrents
- [ ] Test triggering scan on completion

**Implementation:**

- [ ] Implement `TorrentMonitor.cs`
- [ ] Background polling service
- [ ] Track last check timestamp
- [ ] Trigger `DirectoryScanService` for completed torrent paths

#### Day 33-34: Integrated Monitoring (TDD)

**Tests First:**

- [ ] Test startup scan
- [ ] Test FileSystemWatcher events
- [ ] Test qBittorrent events
- [ ] Test no duplicate processing

**Implementation:**

- [ ] Implement `FileMonitorService.cs`
- [ ] Coordinates 3 sources:
  1. Startup scan
  2. FileSystemWatcher
  3. qBittorrent polling
- [ ] De-duplicate file events
- [ ] Queue translation jobs

#### Day 35: Performance Optimization

- [ ] Profile file system operations
- [ ] Optimize database queries
- [ ] Benchmark SRT parsing
- [ ] Optimize memory usage

### Deliverables

- ✅ qBittorrent WebUI integration
- ✅ Multi-source file monitoring
- ✅ De-duplication logic
- ✅ Performance benchmarks

### Acceptance Criteria

- Detects files on startup scan
- Detects files created while running (FileSystemWatcher)
- Detects files from completed torrents (qBittorrent)
- No duplicate translations for same file
- CPU usage < 5% when idle

---

## Phase 6: UI & Notifications (Week 5 - Days 36-42)

### Goal

Build Avalonia UI with MVVM, real-time logs, and WhatsApp notifications.

### Tasks

#### Day 36-37: UI Foundation (MVVM)

**Tests First:**

- [ ] Test ViewModel bindings
- [ ] Test commands
- [ ] Test observable properties

**Implementation:**

- [ ] Create `MainWindowViewModel.cs`
- [ ] Create `MainWindow.axaml`
- [ ] Status display (running, pending, completed counts)
- [ ] Application entry point (`App.axaml.cs`)
- [ ] Dependency injection setup

#### Day 38: Active Translations View

**Implementation:**

- [ ] Display current translation jobs
- [ ] Progress bars per file
- [ ] Real-time updates (chunk progress)
- [ ] Show AI provider being used

#### Day 39: Logs View

**Implementation:**

- [ ] Create `LogsViewModel.cs`
- [ ] Create `LogViewer.axaml` custom control
- [ ] Display logs in real-time
- [ ] Log levels with color coding
- [ ] Filter by level (Info, Warning, Error)
- [ ] Export logs to file

#### Day 40: Settings Dialog

**Implementation:**

- [ ] Create `SettingsViewModel.cs`
- [ ] Create `SettingsWindow.axaml`
- [ ] Configure root directories, API keys
- [ ] Test AI providers (send test request)
- [ ] qBittorrent settings
- [ ] Auto-start with Windows toggle

#### Day 41: WhatsApp Notifications (TDD)

**Tests First:**

- [ ] Test message formatting
- [ ] Test send success/failure

**Implementation Option 1 (Baileys):**

- [ ] Create Node.js bridge for Baileys
- [ ] Implement `BaileysWhatsAppService.cs`
- [ ] QR code display for pairing
- [ ] Send notifications on translation complete

**Implementation Option 2 (Twilio):**

- [ ] Implement `TwilioWhatsAppService.cs`
- [ ] Twilio API integration
- [ ] Send notifications (500/month free limit)

#### Day 42: System Integration

**Implementation:**

- [ ] System tray icon (minimize to tray)
- [ ] Auto-start with Windows (Registry key)
- [ ] Toast notifications (Windows 10/11)
- [ ] Installer setup (Inno Setup)

### Deliverables

- ✅ Functional Avalonia UI
- ✅ Real-time logs display
- ✅ Settings management
- ✅ WhatsApp notifications
- ✅ Windows installer

### Acceptance Criteria

- UI displays all translation jobs
- Logs update in real-time
- Can configure all settings via UI
- WhatsApp notifications sent on completion
- App starts with Windows (if enabled)
- Installer creates shortcuts and registry keys

---

## Phase 7: Polish & Documentation (Week 6 - Days 43-49)

### Goal

Finalize documentation, optimize performance, handle edge cases, and prepare for release.

### Tasks

#### Day 43-44: Documentation

- [ ] Complete `.copilot/DESKTOP-SKILL.MD`
- [ ] Create `.github/instructions/desktop-*.instructions.md`:
  - [ ] `desktop-architecture.instructions.md`
  - [ ] `desktop-ai-providers.instructions.md`
  - [ ] `desktop-file-monitoring.instructions.md`
  - [ ] `desktop-ui.instructions.md`
- [ ] Update `docs/desktop/ARCHITECTURE.md`
- [ ] Update `docs/desktop/ROADMAP.md` (mark completed phases)
- [ ] Create `docs/desktop/USER-GUIDE.md`
- [ ] Create `docs/desktop/API-KEYS-SETUP.md`

#### Day 45: Error Handling & Edge Cases

- [ ] Test and handle all exceptions
- [ ] Graceful degradation for missing dependencies
- [ ] Handle qBittorrent not running
- [ ] Handle network outages
- [ ] Handle disk full scenarios
- [ ] Handle corrupted subtitle files

#### Day 46: Performance Optimization

- [ ] Profile with BenchmarkDotNet
- [ ] Optimize hot paths (SRT parsing, chunking)
- [ ] Memory profiling (find leaks)
- [ ] Reduce startup time
- [ ] Optimize database queries (add missing indexes)

#### Day 47: Final Testing

- [ ] End-to-end testing with real subtitle files
- [ ] Test all AI providers
- [ ] Test qBittorrent integration
- [ ] Test WhatsApp notifications
- [ ] Test auto-start
- [ ] Test installer/uninstaller

#### Day 48: Code Quality

- [ ] Code review checklist:
  - [ ] All SOLID principles followed
  - [ ] No code smells (duplicated code, long methods)
  - [ ] All tests passing
  - [ ] Code coverage ≥ 80%
  - [ ] No compiler warnings
  - [ ] XML documentation comments on public APIs
- [ ] Run static analysis (SonarQube or Roslyn analyzers)

#### Day 49: Release Preparation

- [ ] Version bump to 1.0.0
- [ ] Create GitHub release
- [ ] Build installer (Inno Setup)
- [ ] Write release notes
- [ ] Create video demo (optional)

### Deliverables

- ✅ Complete documentation (Skill.MD, instruction files, user guide)
- ✅ Production-ready v1.0.0
- ✅ Windows installer
- ✅ Release on GitHub

### Acceptance Criteria

- All documentation complete
- Code coverage ≥ 80%
- No critical bugs
- All tests passing
- Installer works on clean Windows machine
- Release notes published

---

## Milestones & Checkpoints

### Week 1 Checkpoint

**Deliverable:** Core domain + database foundation  
**Review:** Domain model correct? Tests comprehensive?

### Week 2 Checkpoint

**Deliverable:** SRT parsing + file monitoring working  
**Review:** Can detect and parse .eng.srt files? Performance acceptable?

### Week 3 Checkpoint

**Deliverable:** Translation working with fallback chain  
**Review:** All AI providers working? Fallback logic correct? Rate limits respected?

### Week 4 Checkpoint

**Deliverable:** Metadata integration + qBittorrent monitoring  
**Review:** OMDB data enhances translations? qBittorrent detection working?

### Week 5 Checkpoint

**Deliverable:** Functional UI + notifications  
**Review:** UI usable? Notifications working? Ready for alpha testing?

### Week 6 Checkpoint

**Deliverable:** v1.0.0 release  
**Review:** All acceptance criteria met? Documentation complete?

---

## Risk Management

| Risk                                     | Probability | Impact | Mitigation                                        |
| ---------------------------------------- | ----------- | ------ | ------------------------------------------------- |
| **API rate limits hit during testing**   | Medium      | Medium | Use mock HTTP responses for most tests            |
| **WhatsApp Baileys blocked by WhatsApp** | Low         | High   | Have Twilio fallback ready                        |
| **qBittorrent API changes**              | Low         | Medium | Version check, graceful degradation               |
| **Performance below expectations**       | Low         | High   | Profile early, optimize incrementally             |
| **Scope creep**                          | Medium      | High   | Strict scope: defer non-critical features to v2.0 |

---

## Success Metrics

### Code Quality

- Code coverage ≥ 80% (Core, Application layers)
- All SOLID principles applied
- Zero compiler warnings
- Static analysis score ≥ 90%

### Performance

- Startup time < 3 seconds
- CPU usage < 5% when idle
- Memory usage < 150MB when idle
- Translate 1000 subtitles in < 5 minutes (with rate limits)

### Reliability

- Zero crashes in 24-hour stress test
- All AI providers fallback working
- File system watcher 100% reliable (no missed files)

### User Experience

- UI responsive (no freezing)
- Logs useful for debugging
- Settings intuitive
- Notifications timely

---

## Post-Release Roadmap (v2.0)

**Future features (not in v1.0):**

- [ ] Support for ASS/SSA subtitle formats
- [ ] Style preservation in translations
- [ ] Batch translation queue management
- [ ] Translation memory (reuse previous translations)
- [ ] Cloud sync (backup translations)
- [ ] Web dashboard (monitor remotely)
- [ ] Multi-language support (not just pt-BR)
- [ ] Custom AI provider plugins
- [ ] Advanced filtering rules (skip certain files)
- [ ] Translation review/editing UI

---

## Development Team

**Role:** Solo developer (You + AI assistants)  
**Time commitment:** ~6 hours/day × 49 days = ~300 hours total  
**Approach:** TDD all the way, no shortcuts

---

## Conclusion

This roadmap provides a clear, achievable path to a production-ready desktop app in 6 weeks. Every phase has concrete deliverables and acceptance criteria. The TDD approach ensures quality from day one, and the Clean Architecture ensures maintainability for the future.

**Next Step:** Get approval on technology stack and begin Phase 1.
