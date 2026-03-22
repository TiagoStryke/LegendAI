# Desktop File Monitoring Instructions

> **Applies to:** `LegendAI.Infrastructure/FileSystem/**/*.cs`, `LegendAI.Infrastructure/QBittorrent/**/*.cs`  
> **Purpose:** Efficient and reliable file system monitoring with qBittorrent integration

---

## File Monitoring Strategy (3-Tier)

### Tier 1: Startup Directory Scan

- **When:** App startup
- **Purpose:** Find existing .eng.srt files not yet translated
- **Pattern:** Recursive directory enumeration
- **Performance:** Async with progress reporting

### Tier 2: FileSystemWatcher

- **When:** Real-time during app runtime
- **Purpose:** Detect newly created/modified .eng.srt files
- **Pattern:** Single watcher with recursive monitoring
- **Performance:** Debouncing + stability check

### Tier 3: qBittorrent Polling

- **When:** Every 30 seconds if qBittorrent enabled
- **Purpose:** Detect torrent completion, scan specific directories
- **Pattern:** Poll completed torrents, enumerate save paths
- **Performance:** Only check new completions since last poll

---

## FileSystemWatcher Implementation

### Correct Pattern

```csharp
public class FileWatcherService : IFileWatcherService, IDisposable
{
    private readonly FileSystemWatcher _watcher;
    private readonly ILogger<FileWatcherService> _logger;
    private readonly IFileProcessor _processor;
    private readonly IOptions<FileMonitoringOptions> _options;
    private readonly ConcurrentDictionary<string, Timer> _debounceTimers = new();

    public FileWatcherService(
        ILogger<FileWatcherService> logger,
        IFileProcessor processor,
        IOptions<FileMonitoringOptions> options)
    {
        _logger = logger;
        _processor = processor;
        _options = options;

        _watcher = new FileSystemWatcher
        {
            Path = _options.Value.MonitoredDirectory,
            Filter = "*.eng.srt",
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
            IncludeSubdirectories = true,
            InternalBufferSize = 65536 // 64KB (default is 8KB, too small)
        };

        _watcher.Created += OnFileEvent;
        _watcher.Changed += OnFileEvent;
        _watcher.Renamed += OnFileRenamed;
        _watcher.Error += OnError;
    }

    public void Start()
    {
        _watcher.EnableRaisingEvents = true;
        _logger.Information("FileSystemWatcher started for {Path}", _watcher.Path);
    }

    public void Stop()
    {
        _watcher.EnableRaisingEvents = false;
        _logger.Information("FileSystemWatcher stopped");
    }

    private void OnFileEvent(object sender, FileSystemEventArgs e)
    {
        _logger.Debug("File event: {ChangeType} - {Path}", e.ChangeType, e.FullPath);

        // Debounce: Wait 500ms after last change
        if (_debounceTimers.TryGetValue(e.FullPath, out var existingTimer))
        {
            existingTimer.Change(500, Timeout.Infinite);
        }
        else
        {
            var timer = new Timer(_ => OnDebouncedFileReady(e.FullPath), null, 500, Timeout.Infinite);
            _debounceTimers.TryAdd(e.FullPath, timer);
        }
    }

    private void OnFileRenamed(object sender, RenamedEventArgs e)
    {
        _logger.Debug("File renamed: {OldPath} -> {NewPath}", e.OldFullPath, e.FullPath);

        // Only process if new name matches pattern
        if (e.FullPath.EndsWith(".eng.srt", StringComparison.OrdinalIgnoreCase))
        {
            OnFileEvent(sender, e);
        }
    }

    private async void OnDebouncedFileReady(string filePath)
    {
        try
        {
            // Remove timer
            if (_debounceTimers.TryRemove(filePath, out var timer))
            {
                timer.Dispose();
            }

            // Wait for file to be stable (not being written)
            if (!await WaitForFileStabilityAsync(filePath))
            {
                _logger.Warning("File {Path} failed stability check", filePath);
                return;
            }

            // Check if file is locked
            if (!IsFileAccessible(filePath))
            {
                _logger.Warning("File {Path} is locked by another process", filePath);
                return;
            }

            _logger.Information("Processing new file: {Path}", filePath);
            await _processor.ProcessFileAsync(filePath);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Error processing file {Path}", filePath);
        }
    }

    private async Task<bool> WaitForFileStabilityAsync(string filePath)
    {
        const int maxAttempts = 6; // 3 seconds total (6 x 500ms)
        long lastSize = -1;

        for (int i = 0; i < maxAttempts; i++)
        {
            try
            {
                var fileInfo = new FileInfo(filePath);
                if (!fileInfo.Exists) return false;

                var currentSize = fileInfo.Length;

                if (lastSize == currentSize)
                {
                    _logger.Debug("File {Path} is stable at {Size} bytes", filePath, currentSize);
                    return true;
                }

                lastSize = currentSize;
                await Task.Delay(500);
            }
            catch (IOException)
            {
                await Task.Delay(500);
            }
        }

        return false;
    }

    private bool IsFileAccessible(string filePath)
    {
        try
        {
            using var stream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            return true;
        }
        catch (IOException)
        {
            return false;
        }
    }

    private void OnError(object sender, ErrorEventArgs e)
    {
        _logger.Error(e.GetException(), "FileSystemWatcher error");

        // Restart watcher
        Stop();
        Start();
    }

    public void Dispose()
    {
        foreach (var timer in _debounceTimers.Values)
        {
            timer.Dispose();
        }
        _debounceTimers.Clear();

        _watcher?.Dispose();
    }
}
```

### Critical Rules for FileSystemWatcher

1. **Single Watcher:**
   - ONE FileSystemWatcher per monitored directory
   - ❌ BAD: Multiple watchers for subdirectories
   - ✅ GOOD: One watcher with `IncludeSubdirectories = true`

2. **Buffer Size:**
   - Default 8KB is too small (causes missed events)
   - ✅ Set to 64KB: `InternalBufferSize = 65536`

3. **Debouncing:**
   - Files trigger multiple events (Created + Changed)
   - ✅ Wait 500ms after last change before processing

4. **Stability Check:**
   - Wait for file to stop growing (copy/download in progress)
   - ✅ Check file size every 500ms for 3 seconds max

5. **Lock Detection:**
   - Check if file is accessible before processing
   - ✅ Try to open with `FileShare.Read`

6. **Error Handling:**
   - Restart watcher if internal error occurs
   - ✅ Subscribe to `Error` event

---

## Startup Directory Scan

### Correct Pattern

```csharp
public class StartupScanService : IStartupScanService
{
    private readonly ILogger<StartupScanService> _logger;
    private readonly IFileProcessor _processor;
    private readonly IOptions<FileMonitoringOptions> _options;

    public async Task ScanAsync(IProgress<ScanProgress> progress, CancellationToken cancellationToken)
    {
        _logger.Information("Starting directory scan: {Path}", _options.Value.MonitoredDirectory);

        var directory = new DirectoryInfo(_options.Value.MonitoredDirectory);
        if (!directory.Exists)
        {
            _logger.Warning("Monitored directory does not exist: {Path}", directory.FullName);
            return;
        }

        // Enumerate files
        var files = directory.EnumerateFiles("*.eng.srt", SearchOption.AllDirectories);
        var fileList = files.ToList();

        _logger.Information("Found {Count} .eng.srt files", fileList.Count);
        progress.Report(new ScanProgress { TotalFiles = fileList.Count, ProcessedFiles = 0 });

        int processed = 0;

        foreach (var file in fileList)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                _logger.Information("Scan cancelled by user");
                break;
            }

            try
            {
                // Check if already translated
                var outputPath = file.FullName.Replace(".eng.srt", ".pt.srt");
                if (File.Exists(outputPath))
                {
                    _logger.Debug("Skipping {File} (already translated)", file.Name);
                }
                else
                {
                    _logger.Information("Queueing {File} for translation", file.Name);
                    await _processor.QueueFileAsync(file.FullName);
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error processing file {Path}", file.FullName);
            }

            processed++;
            progress.Report(new ScanProgress { TotalFiles = fileList.Count, ProcessedFiles = processed });
        }

        _logger.Information("Scan complete: {Processed}/{Total} files", processed, fileList.Count);
    }
}
```

### Performance Considerations

1. **Async Enumeration:**
   - Use `EnumerateFiles()` instead of `GetFiles()`
   - ✅ `EnumerateFiles()` yields results incrementally
   - ❌ `GetFiles()` loads entire list into memory

2. **Skip Already Translated:**
   - Check if `.pt.srt` exists before queueing
   - ✅ Avoid re-translating existing files

3. **Progress Reporting:**
   - Report every file processed
   - ✅ UI can show "Scanning 45/100 files"

4. **Cancellation Support:**
   - Check `CancellationToken` in loop
   - ✅ User can stop scan if needed

---

## qBittorrent Integration

### Polling Service

```csharp
public class QBittorrentMonitor : BackgroundService
{
    private readonly IQBittorrentClient _client;
    private readonly IFileProcessor _processor;
    private readonly ILogger<QBittorrentMonitor> _logger;
    private readonly IOptions<QBittorrentOptions> _options;
    private readonly HashSet<string> _processedTorrents = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Value.Enabled)
        {
            _logger.Information("qBittorrent monitoring disabled");
            return;
        }

        _logger.Information("qBittorrent monitoring started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckCompletedTorrentsAsync(stoppingToken);
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error checking qBittorrent");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    private async Task CheckCompletedTorrentsAsync(CancellationToken cancellationToken)
    {
        var torrents = await _client.GetTorrentsAsync(cancellationToken);

        foreach (var torrent in torrents.Where(t => t.State == "pausedUP" || t.Progress == 1.0))
        {
            // Skip if already processed
            if (_processedTorrents.Contains(torrent.Hash))
                continue;

            _logger.Information("Torrent completed: {Name}", torrent.Name);
            _processedTorrents.Add(torrent.Hash);

            // Scan torrent save path for .eng.srt files
            var savePath = torrent.SavePath;
            if (Directory.Exists(savePath))
            {
                var srtFiles = Directory.EnumerateFiles(
                    savePath,
                    "*.eng.srt",
                    SearchOption.AllDirectories);

                foreach (var file in srtFiles)
                {
                    _logger.Information("Found subtitle in completed torrent: {File}", file);
                    await _processor.QueueFileAsync(file);
                }
            }
        }
    }
}
```

### qBittorrent Client (Refit)

```csharp
public interface IQBittorrentClient
{
    [Post("/api/v2/auth/login")]
    Task<HttpResponseMessage> LoginAsync([Body(BodySerializationMethod.UrlEncoded)] Dictionary<string, string> credentials);

    [Get("/api/v2/torrents/info")]
    Task<List<TorrentInfo>> GetTorrentsAsync(CancellationToken cancellationToken = default);

    [Get("/api/v2/torrents/files")]
    Task<List<TorrentFile>> GetFilesAsync([Query] string hash, CancellationToken cancellationToken = default);
}

public class TorrentInfo
{
    [JsonPropertyName("hash")]
    public string Hash { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("state")]
    public string State { get; set; } = "";

    [JsonPropertyName("progress")]
    public double Progress { get; set; }

    [JsonPropertyName("save_path")]
    public string SavePath { get; set; } = "";

    [JsonPropertyName("completion_on")]
    public long CompletionOn { get; set; }
}

// Registration:
services.AddRefitClient<IQBittorrentClient>()
    .ConfigureHttpClient(c => c.BaseAddress = new Uri(options.WebUIUrl));
```

### Authentication Handling

```csharp
public class QBittorrentAuthHandler : DelegatingHandler
{
    private readonly IQBittorrentClient _client;
    private readonly IOptions<QBittorrentOptions> _options;
    private string? _cookie;

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        // Ensure authenticated
        if (_cookie == null)
        {
            await LoginAsync(cancellationToken);
        }

        // Add cookie to request
        if (_cookie != null)
        {
            request.Headers.Add("Cookie", _cookie);
        }

        var response = await base.SendAsync(request, cancellationToken);

        // Re-authenticate if 403
        if (response.StatusCode == HttpStatusCode.Forbidden)
        {
            await LoginAsync(cancellationToken);
            request.Headers.Remove("Cookie");
            request.Headers.Add("Cookie", _cookie);
            response = await base.SendAsync(request, cancellationToken);
        }

        return response;
    }

    private async Task LoginAsync(CancellationToken cancellationToken)
    {
        var credentials = new Dictionary<string, string>
        {
            ["username"] = _options.Value.Username,
            ["password"] = _options.Value.Password
        };

        var response = await _client.LoginAsync(credentials);

        if (response.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            _cookie = cookies.First();
        }
    }
}
```

---

## De-duplication

### Correct Pattern

```csharp
public class FileProcessor : IFileProcessor
{
    private readonly ConcurrentDictionary<string, DateTime> _recentlyProcessed = new();
    private readonly ITranslationService _translationService;
    private readonly ILogger<FileProcessor> _logger;

    public async Task ProcessFileAsync(string filePath)
    {
        // Normalize path (handle case differences)
        var normalizedPath = Path.GetFullPath(filePath).ToLowerInvariant();

        // Check if recently processed (within last 5 minutes)
        if (_recentlyProcessed.TryGetValue(normalizedPath, out var lastProcessed))
        {
            if (DateTime.UtcNow - lastProcessed < TimeSpan.FromMinutes(5))
            {
                _logger.Information("File {Path} already processed recently, skipping", filePath);
                return;
            }
        }

        // Check if output already exists
        var outputPath = filePath.Replace(".eng.srt", ".pt.srt");
        if (File.Exists(outputPath))
        {
            _logger.Information("File {Path} already translated, skipping", filePath);
            return;
        }

        // Mark as processing
        _recentlyProcessed.AddOrUpdate(normalizedPath, DateTime.UtcNow, (_, __) => DateTime.UtcNow);

        try
        {
            await _translationService.TranslateFileAsync(filePath);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Translation failed for {Path}", filePath);
            // Remove from recent list on failure (allow retry)
            _recentlyProcessed.TryRemove(normalizedPath, out _);
            throw;
        }
    }

    public Task QueueFileAsync(string filePath)
    {
        // Add to background queue (not immediate processing)
        // This prevents overwhelming the system
        return Task.CompletedTask;
    }

    // Cleanup old entries periodically
    public void CleanupOldEntries()
    {
        var cutoff = DateTime.UtcNow.AddHours(-1);

        foreach (var entry in _recentlyProcessed.Where(e => e.Value < cutoff).ToList())
        {
            _recentlyProcessed.TryRemove(entry.Key, out _);
        }
    }
}
```

---

## Configuration

### FileMonitoringOptions

```csharp
public class FileMonitoringOptions
{
    public string MonitoredDirectory { get; set; } = "";
    public bool EnableStartupScan { get; set; } = true;
    public bool EnableFileSystemWatcher { get; set; } = true;
    public int DebounceMilliseconds { get; set; } = 500;
    public int StabilityCheckAttempts { get; set; } = 6;
}

public class QBittorrentOptions
{
    public bool Enabled { get; set; } = false;
    public string WebUIUrl { get; set; } = "http://localhost:8080";
    public string Username { get; set; } = "admin";
    public string Password { get; set; } = "";
    public int PollingIntervalSeconds { get; set; } = 30;
}

// appsettings.json
{
  "FileMonitoring": {
    "MonitoredDirectory": "C:\\Downloads\\Subtitles",
    "EnableStartupScan": true,
    "EnableFileSystemWatcher": true,
    "DebounceMilliseconds": 500,
    "StabilityCheckAttempts": 6
  },
  "QBittorrent": {
    "Enabled": true,
    "WebUIUrl": "http://localhost:8080",
    "Username": "admin",
    "Password": "",
    "PollingIntervalSeconds": 30
  }
}
```

---

## Testing

### Mock FileSystemWatcher

```csharp
public class MockFileSystemWatcher : IFileWatcherService
{
    public List<string> ProcessedFiles { get; } = new();
    public bool IsStarted { get; private set; }

    public void Start() => IsStarted = true;
    public void Stop() => IsStarted = false;

    public void SimulateFileCreated(string path)
    {
        ProcessedFiles.Add(path);
    }
}

[Fact]
public async Task FileWatcher_WhenFileCreated_ProcessesFile()
{
    // Arrange
    var mockWatcher = new MockFileSystemWatcher();
    var testFilePath = "C:\\test\\movie.eng.srt";

    // Act
    mockWatcher.Start();
    mockWatcher.SimulateFileCreated(testFilePath);

    // Assert
    mockWatcher.IsStarted.Should().BeTrue();
    mockWatcher.ProcessedFiles.Should().Contain(testFilePath);
}
```

### Integration Test with Real Files

```csharp
[Fact]
public async Task FileWatcher_RealFile_DetectsAndProcesses()
{
    // Arrange
    var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    Directory.CreateDirectory(tempDir);

    var watcher = new FileWatcherService(...);
    watcher.Start();

    // Act
    var testFile = Path.Combine(tempDir, "test.eng.srt");
    await File.WriteAllTextAsync(testFile, "1\n00:00:01,000 --> 00:00:02,000\nTest");

    // Wait for processing
    await Task.Delay(2000);

    // Assert
    var outputFile = testFile.Replace(".eng.srt", ".pt.srt");
    File.Exists(outputFile).Should().BeTrue();

    // Cleanup
    Directory.Delete(tempDir, true);
}
```

---

## Performance Optimization

### 1. Parallel Processing

```csharp
public async Task ProcessMultipleFilesAsync(List<string> files)
{
    var options = new ParallelOptions
    {
        MaxDegreeOfParallelism = Environment.ProcessorCount,
        CancellationToken = CancellationToken.None
    };

    await Parallel.ForEachAsync(files, options, async (file, ct) =>
    {
        await ProcessFileAsync(file);
    });
}
```

### 2. Memory-Efficient Directory Enumeration

```csharp
// ✅ GOOD: Lazy enumeration
var files = directory.EnumerateFiles("*.eng.srt", SearchOption.AllDirectories);
foreach (var file in files)
{
    await ProcessFileAsync(file.FullName);
}

// ❌ BAD: Loads all files into memory
var files = directory.GetFiles("*.eng.srt", SearchOption.AllDirectories);
```

### 3. Batch Database Operations

```csharp
// ✅ GOOD: Batch insert
var jobs = files.Select(f => new TranslationJob { FilePath = f }).ToList();
await _context.TranslationJobs.AddRangeAsync(jobs);
await _context.SaveChangesAsync();

// ❌ BAD: One at a time
foreach (var file in files)
{
    await _context.TranslationJobs.AddAsync(new TranslationJob { FilePath = file });
    await _context.SaveChangesAsync();
}
```

---

## Common Issues and Solutions

| Issue                            | Cause                    | Solution                                             |
| -------------------------------- | ------------------------ | ---------------------------------------------------- |
| Missed file events               | Buffer overflow          | Increase `InternalBufferSize` to 64KB                |
| Multiple processing of same file | Duplicate events         | Implement de-duplication with `ConcurrentDictionary` |
| File locked during processing    | File still being written | Implement stability check + lock detection           |
| High CPU usage                   | No debouncing            | Add 500ms debounce timer                             |
| qBittorrent auth fails           | Session expired          | Implement auth handler with auto-retry               |
| Slow startup scan                | Synchronous enumeration  | Use `EnumerateFiles` + async processing              |

---

**Remember:** File monitoring is the foundation of the app. Robust file detection = reliable translation.
