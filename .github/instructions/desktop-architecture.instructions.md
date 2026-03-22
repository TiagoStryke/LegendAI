# Desktop Architecture Instructions

> **Applies to:** `LegendAI.Desktop/**/*.cs`  
> **Purpose:** Enforce Clean Architecture and SOLID principles in desktop application

---

## Architecture Rules

### Layer Dependencies

**CRITICAL:** Dependencies MUST flow inward only.

```
UI → Application → Infrastructure → Core
     (use cases)   (external)      (domain)
```

**Rules:**

1. **Core Layer:** NO dependencies on any other layer or external library
2. **Application Layer:** Can depend on Core only
3. **Infrastructure Layer:** Can depend on Core and Application
4. **UI Layer:** Can depend on all layers (but prefer Application interfaces)

### Forbidden Dependencies

❌ **Core depending on Application**  
❌ **Core depending on Infrastructure**  
❌ **Application depending on Infrastructure**  
❌ **Core depending on external libraries** (except .NET BCL)

### Correct Dependencies

✅ Core defines interfaces (`IAIProvider`, `IRepository`)  
✅ Infrastructure implements interfaces  
✅ Application uses interfaces (injected)  
✅ UI uses Application layer (use cases)

---

## Project Structure Rules

### File Naming

- One class per file
- Filename MUST match class name: `TranslationService.cs`
- Test files: `TranslationServiceTests.cs`
- Interfaces: `IAIProvider.cs`

### Namespace Conventions

```csharp
LegendAI.Core.Entities
LegendAI.Core.ValueObjects
LegendAI.Core.Interfaces
LegendAI.Application.UseCases.TranslateSubtitle
LegendAI.Infrastructure.AI.Providers
LegendAI.UI.ViewModels
```

### Folder Structure

- Group by feature, not by type
- UseCases folder has subfolders per use case
- Each use case folder has Command, Handler, Validator

---

## SOLID Principles

### Single Responsibility Principle

Each class has ONE reason to change.

```csharp
// ✅ GOOD: Focused responsibility
public class SRTParser
{
    public List<Subtitle> Parse(string content) { }
}

// ❌ BAD: Multiple responsibilities
public class FileProcessor
{
    public List<Subtitle> Parse(string content) { }
    public void Translate(List<Subtitle> subs) { }
    public void SaveToFile(string path) { }
}
```

### Open/Closed Principle

Open for extension, closed for modification.

```csharp
// ✅ GOOD: Can add providers without modifying existing code
public interface IAIProvider
{
    Task<TranslationResponse> TranslateAsync(TranslationRequest request);
}

public class GeminiProvider : IAIProvider { }
public class GroqProvider : IAIProvider { }

// New provider = new class, no modifications
public class NewProvider : IAIProvider { }
```

### Liskov Substitution Principle

Derived classes must be substitutable for base classes.

```csharp
// ✅ GOOD: Any IAIProvider can replace another
public class TranslationService
{
    private readonly IAIProvider _provider;

    public TranslationService(IAIProvider provider)
    {
        _provider = provider; // Can be ANY implementation
    }
}
```

### Interface Segregation Principle

Clients should not depend on interfaces they don't use.

```csharp
// ✅ GOOD: Separate interfaces
public interface IAIProvider
{
    Task<TranslationResponse> TranslateAsync(TranslationRequest request);
}

public interface IMetadataProvider
{
    Task<Metadata> FetchMetadataAsync(string title);
}

// ❌ BAD: Fat interface
public interface IProvider
{
    Task<TranslationResponse> TranslateAsync(...);
    Task<Metadata> FetchMetadataAsync(...);
    Task SendNotificationAsync(...); // Not all providers need this
}
```

### Dependency Inversion Principle

Depend on abstractions, not concretions.

```csharp
// ✅ GOOD: Depends on abstraction
public class TranslationHandler
{
    private readonly IAIProvider _aiProvider;
    private readonly IRepository<Translation> _repository;

    public TranslationHandler(
        IAIProvider aiProvider, // Interface
        IRepository<Translation> repository) // Interface
    {
        _aiProvider = aiProvider;
        _repository = repository;
    }
}

// ❌ BAD: Depends on concrete class
public class TranslationHandler
{
    private readonly GeminiProvider _gemini; // Concrete class

    public TranslationHandler()
    {
        _gemini = new GeminiProvider(); // Hard-coded dependency
    }
}
```

---

## Domain Layer (Core) Rules

### Entities

- Must have identity (Id)
- Encapsulate business rules
- Validate invariants in constructor

```csharp
public class Subtitle
{
    public int Index { get; private set; }
    public TimeSpan StartTime { get; private set; }
    public TimeSpan EndTime { get; private set; }
    public string Text { get; private set; }

    public Subtitle(int index, TimeSpan startTime, TimeSpan endTime, string text)
    {
        if (index <= 0)
            throw new ArgumentException("Index must be positive", nameof(index));

        if (endTime <= startTime)
            throw new ArgumentException("EndTime must be after StartTime");

        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Text cannot be empty", nameof(text));

        Index = index;
        StartTime = startTime;
        EndTime = endTime;
        Text = text;
    }

    // No setters - immutability
}
```

### Value Objects

- No identity (equality by value)
- Immutable
- Self-validating

```csharp
public record TimingInfo(TimeSpan Start, TimeSpan End)
{
    public TimingInfo
    {
        if (End <= Start)
            throw new ArgumentException("End must be after Start");
    }

    public TimeSpan Duration => End - Start;
}
```

### Interfaces

- Define contracts for infrastructure
- NO implementation details

```csharp
public interface IAIProvider
{
    string Name { get; }
    Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken);
    bool IsAvailable();
}
```

---

## Application Layer Rules

### Use Cases

- One handler per use case
- Use Command/Query pattern
- Return Result<T> instead of throwing

```csharp
public record TranslateSubtitleCommand(string FilePath);

public class TranslateSubtitleHandler
{
    private readonly IAIProvider _aiProvider;
    private readonly IRepository<Translation> _repository;

    public async Task<Result<Translation>> HandleAsync(
        TranslateSubtitleCommand command)
    {
        try
        {
            // 1. Parse file
            var subtitles = SRTParser.Parse(await File.ReadAllTextAsync(command.FilePath));

            // 2. Translate
            var response = await _aiProvider.TranslateAsync(new TranslationRequest { ... });

            // 3. Validate
            if (!Validator.Validate(subtitles, response.Subtitles))
                return Result<Translation>.Failed("Validation failed");

            // 4. Save
            var translation = new Translation { ... };
            await _repository.AddAsync(translation);

            return Result<Translation>.Success(translation);
        }
        catch (Exception ex)
        {
            return Result<Translation>.Failed(ex.Message);
        }
    }
}
```

### DTOs

- Simple data transfer objects
- No business logic
- Used for communication between layers

```csharp
public class TranslationRequest
{
    public List<Subtitle> Subtitles { get; set; }
    public FileMetadata? Metadata { get; set; }
}

public class TranslationResponse
{
    public List<Subtitle> Subtitles { get; set; }
}
```

---

## Infrastructure Layer Rules

### Implementations Must Be Isolated

- Each implementation in its own file
- No shared state between implementations
- Use dependency injection

```csharp
// GeminiProvider.cs
public class GeminiProvider : IAIProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<GeminiProvider> _logger;

    public GeminiProvider(
        HttpClient httpClient,
        ILogger<GeminiProvider> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<TranslationResponse> TranslateAsync(...)
    {
        // Implementation
    }
}
```

### Repository Pattern

- One repository per aggregate root
- Generic repository for simple CRUD
- Specific repositories for complex queries

```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id);
    Task<List<T>> GetAllAsync();
    Task AddAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(int id);
}

public class TranslationRepository : IRepository<Translation>
{
    private readonly LegendAIDbContext _context;

    public async Task<Translation?> GetByIdAsync(int id)
    {
        return await _context.Translations.FindAsync(id);
    }

    // Specific query
    public async Task<List<Translation>> GetPendingAsync()
    {
        return await _context.Translations
            .Where(t => t.Status == "Pending")
            .ToListAsync();
    }
}
```

---

## UI Layer Rules

### MVVM Pattern

- ViewModels handle UI logic
- Views are XAML only (no code-behind)
- Use commands for user actions

```csharp
public class MainWindowViewModel : ViewModelBase
{
    private string _statusText;
    public string StatusText
    {
        get => _statusText;
        set => this.RaiseAndSetIfChanged(ref _statusText, value);
    }

    public ObservableCollection<LogEntry> Logs { get; }

    public ReactiveCommand<Unit, Unit> StartMonitoringCommand { get; }

    public MainWindowViewModel(IFileMonitorService monitorService)
    {
        StartMonitoringCommand = ReactiveCommand.CreateFromTask(
            async () => await monitorService.StartAsync());
    }
}
```

### View (XAML)

```xml
<Window x:Class="LegendAI.UI.Views.MainWindow"
        xmlns:vm="clr-namespace:LegendAI.UI.ViewModels">
  <Window.DataContext>
    <vm:MainWindowViewModel/>
  </Window.DataContext>

  <StackPanel>
    <TextBlock Text="{Binding StatusText}"/>
    <Button Command="{Binding StartMonitoringCommand}" Content="Start"/>
  </StackPanel>
</Window>
```

---

## Dependency Injection Setup

**Program.cs or App.xaml.cs:**

```csharp
public class Program
{
    public static void Main(string[] args)
    {
        var builder = Host.CreateDefaultBuilder(args);

        builder.ConfigureServices((context, services) =>
        {
            // Core (no registrations - no dependencies)

            // Application
            services.AddScoped<TranslateSubtitleHandler>();
            services.AddScoped<ScanDirectoryHandler>();

            // Infrastructure
            services.AddSingleton<IAIProvider, GeminiProvider>();
            services.AddSingleton<IMetadataProvider, OMDBClient>();
            services.AddScoped<IRepository<Translation>, TranslationRepository>();
            services.AddDbContext<LegendAIDbContext>(options =>
                options.UseSqlite("Data Source=legendai.db"));

            // UI
            services.AddSingleton<MainWindowViewModel>();
        });

        var app = builder.Build();
        app.Run();
    }
}
```

---

## Error Handling Strategy

### Domain Layer

- Throw domain-specific exceptions
- Validate in constructors

```csharp
public class InvalidSubtitleException : Exception
{
    public InvalidSubtitleException(string message) : base(message) { }
}
```

### Application Layer

- Catch domain exceptions
- Return Result<T>
- Log errors

```csharp
public async Task<Result<Translation>> HandleAsync(...)
{
    try
    {
        // Business logic
    }
    catch (InvalidSubtitleException ex)
    {
        _logger.Error(ex, "Invalid subtitle format");
        return Result<Translation>.Failed(ex.Message);
    }
}
```

### Infrastructure Layer

- Catch IO/network exceptions
- Retry with Polly
- Log with context

```csharp
public async Task<TranslationResponse> TranslateAsync(...)
{
    try
    {
        var response = await _httpClient.PostAsync(...);
        return ParseResponse(response);
    }
    catch (HttpRequestException ex)
    {
        _logger.Error(ex, "HTTP error calling {Provider}", Name);
        throw new AIProviderException($"Failed to call {Name}", ex);
    }
}
```

### UI Layer

- Never crash, always show user-friendly message
- Display errors in UI
- Log everything

```csharp
public MainWindowViewModel()
{
    StartCommand = ReactiveCommand.CreateFromTask(async () =>
    {
        try
        {
            await _service.StartAsync();
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to start monitoring");
            ErrorMessage = "Failed to start monitoring. Please check logs.";
        }
    });
}
```

---

## Performance Rules

1. **Always async for I/O:**
   - File operations: `File.ReadAllTextAsync()`
   - Database: `await _context.SaveChangesAsync()`
   - HTTP: `await _httpClient.GetAsync()`

2. **Dispose resources:**

   ```csharp
   using var stream = File.OpenRead(path);
   await stream.CopyToAsync(destination);
   ```

3. **Use `ConfigureAwait(false)` in libraries:**

   ```csharp
   await Task.Delay(1000).ConfigureAwait(false);
   ```

4. **Batch database operations:**
   ```csharp
   _context.Translations.AddRange(translations); // Not Add() in loop
   await _context.SaveChangesAsync();
   ```

---

## Code Review Checklist

Before committing, verify:

- [ ] Dependencies flow inward (Core has no dependencies)
- [ ] One class per file, filename matches class name
- [ ] All SOLID principles applied
- [ ] Tests written (TDD)
- [ ] No hard-coded dependencies (use DI)
- [ ] Async/await for all I/O
- [ ] Resources disposed properly
- [ ] Errors logged with context
- [ ] XML comments on public APIs

---

**Remember:** Architecture is not optional. Following these rules ensures maintainability, testability, and scalability.
