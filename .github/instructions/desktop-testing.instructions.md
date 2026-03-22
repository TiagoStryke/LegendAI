# Desktop Testing Instructions

> **Applies to:** `**/*.Tests/**/*.cs`, `**/Tests/**/*.cs`  
> **Purpose:** Ensure 80%+ code coverage with TDD using xUnit, FluentAssertions, and Moq

---

## Testing Philosophy

### Test-Driven Development (TDD)

**ALWAYS follow Red-Green-Refactor:**

1. **Red:** Write failing test first
2. **Green:** Write minimal code to make test pass
3. **Refactor:** Clean up code while keeping tests green

```csharp
// Example TDD workflow:

// Step 1: RED - Write failing test
[Fact]
public void SRTParser_ValidFile_ReturnsSubtitles()
{
    // Arrange
    var parser = new SRTParser();
    var content = "1\n00:00:01,000 --> 00:00:02,000\nHello";

    // Act
    var result = parser.Parse(content);

    // Assert
    result.Should().HaveCount(1);
    result[0].Text.Should().Be("Hello");
}

// Step 2: GREEN - Implement minimal code
public class SRTParser
{
    public List<Subtitle> Parse(string content)
    {
        return new List<Subtitle>
        {
            new Subtitle(1, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), "Hello")
        };
    }
}

// Step 3: REFACTOR - Add more test cases and improve implementation
[Theory]
[InlineData("1\n00:00:01,000 --> 00:00:02,000\nHello", 1)]
[InlineData("1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld", 2)]
public void SRTParser_ValidFile_ReturnsCorrectCount(string content, int expectedCount)
{
    var parser = new SRTParser();
    var result = parser.Parse(content);
    result.Should().HaveCount(expectedCount);
}
```

---

## Testing Framework Setup

### xUnit Configuration

```csharp
// LegendAI.Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="xunit" Version="2.6.6" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.5.6" />
    <PackageReference Include="FluentAssertions" Version="6.12.0" />
    <PackageReference Include="Moq" Version="4.20.70" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.9.0" />
    <PackageReference Include="coverlet.collector" Version="6.0.0" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\LegendAI.Core\LegendAI.Core.csproj" />
    <ProjectReference Include="..\LegendAI.Application\LegendAI.Application.csproj" />
    <ProjectReference Include="..\LegendAI.Infrastructure\LegendAI.Infrastructure.csproj" />
  </ItemGroup>
</Project>
```

---

## Naming Conventions

### Test Class Naming

```csharp
// ✅ GOOD: [ClassUnderTest]Tests
public class SRTParserTests { }
public class GeminiProviderTests { }
public class FileWatcherServiceTests { }

// ❌ BAD: Inconsistent naming
public class TestSRTParser { }
public class SRTParserTest { }
```

### Test Method Naming

**Pattern:** `MethodName_Scenario_ExpectedBehavior`

```csharp
// ✅ GOOD: Clear, descriptive test names
[Fact]
public void Parse_ValidSRT_ReturnsSubtitles() { }

[Fact]
public void Parse_EmptyContent_ThrowsArgumentException() { }

[Fact]
public void Parse_MalformedTimestamp_ThrowsFormatException() { }

[Fact]
public void TranslateAsync_QuotaExceeded_ThrowsQuotaExceededException() { }

[Fact]
public void FileWatcher_FileCreated_ProcessesFile() { }

// ❌ BAD: Vague test names
[Fact]
public void Test1() { }

[Fact]
public void ParseTest() { }

[Fact]
public void ShouldWork() { }
```

---

## FluentAssertions Usage

### Prefer FluentAssertions over Assert

```csharp
// ✅ GOOD: FluentAssertions (readable, detailed error messages)
result.Should().NotBeNull();
result.Should().HaveCount(10);
result.Should().BeOfType<List<Subtitle>>();
result[0].Text.Should().Be("Hello");
result[0].StartTime.Should().Be(TimeSpan.FromSeconds(1));

subtitle.Index.Should().BeGreaterThan(0);
subtitle.Text.Should().NotBeNullOrWhiteSpace();
subtitle.StartTime.Should().BeLessThan(subtitle.EndTime);

// Collection assertions
subtitles.Should().AllSatisfy(s => s.Index.Should().BePositive());
subtitles.Should().OnlyContain(s => !string.IsNullOrWhiteSpace(s.Text));

// Exception assertions
Action act = () => parser.Parse("");
act.Should().Throw<ArgumentException>()
   .WithMessage("Content cannot be empty");

// Async exception assertions
Func<Task> act = async () => await provider.TranslateAsync(null);
await act.Should().ThrowAsync<ArgumentNullException>();

// ❌ BAD: Traditional Assert (less readable)
Assert.NotNull(result);
Assert.Equal(10, result.Count);
Assert.IsType<List<Subtitle>>(result);
Assert.Equal("Hello", result[0].Text);
```

---

## Moq Usage

### Mocking Dependencies

```csharp
public class TranslationServiceTests
{
    private readonly Mock<IAIProvider> _mockProvider;
    private readonly Mock<IMetadataService> _mockMetadata;
    private readonly Mock<ILogger<TranslationService>> _mockLogger;
    private readonly TranslationService _service;

    public TranslationServiceTests()
    {
        _mockProvider = new Mock<IAIProvider>();
        _mockMetadata = new Mock<IMetadataService>();
        _mockLogger = new Mock<ILogger<TranslationService>>();

        _service = new TranslationService(
            _mockProvider.Object,
            _mockMetadata.Object,
            _mockLogger.Object);
    }

    [Fact]
    public async Task TranslateAsync_ValidRequest_CallsProvider()
    {
        // Arrange
        var request = new TranslationRequest
        {
            Subtitles = new List<Subtitle> { /* ... */ }
        };

        var expectedResponse = new TranslationResponse
        {
            Subtitles = new List<Subtitle> { /* ... */ }
        };

        _mockProvider
            .Setup(p => p.TranslateAsync(It.IsAny<TranslationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _service.TranslateAsync(request);

        // Assert
        result.Should().NotBeNull();
        result.Subtitles.Should().HaveCount(expectedResponse.Subtitles.Count);

        _mockProvider.Verify(
            p => p.TranslateAsync(It.IsAny<TranslationRequest>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task TranslateAsync_ProviderFails_ThrowsException()
    {
        // Arrange
        _mockProvider
            .Setup(p => p.TranslateAsync(It.IsAny<TranslationRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new AIProviderException("Test error"));

        // Act
        Func<Task> act = async () => await _service.TranslateAsync(new TranslationRequest());

        // Assert
        await act.Should().ThrowAsync<AIProviderException>()
            .WithMessage("Test error");
    }
}
```

### Mock Setup Patterns

```csharp
// Return specific value
_mock.Setup(m => m.GetValue()).Returns(42);

// Return based on parameter
_mock.Setup(m => m.GetValue(It.IsAny<int>()))
    .Returns((int x) => x * 2);

// Throw exception
_mock.Setup(m => m.GetValue())
    .Throws(new InvalidOperationException());

// Async return
_mock.Setup(m => m.GetValueAsync())
    .ReturnsAsync(42);

// Verify method called
_mock.Verify(m => m.GetValue(), Times.Once);
_mock.Verify(m => m.GetValue(), Times.Exactly(3));
_mock.Verify(m => m.GetValue(), Times.Never);

// Verify with specific arguments
_mock.Verify(m => m.SetValue(It.Is<int>(x => x > 0)), Times.Once);

// Verify property access
_mock.VerifyGet(m => m.Name, Times.Once);
_mock.VerifySet(m => m.Name = "test", Times.Once);
```

---

## Test Categories

### Unit Tests

**Purpose:** Test single class in isolation  
**Dependencies:** All mocked  
**Speed:** Very fast (<10ms per test)

```csharp
public class SubtitleTests
{
    [Fact]
    public void Constructor_ValidParameters_CreatesSubtitle()
    {
        // Arrange & Act
        var subtitle = new Subtitle(
            1,
            TimeSpan.FromSeconds(1),
            TimeSpan.FromSeconds(2),
            "Hello");

        // Assert
        subtitle.Index.Should().Be(1);
        subtitle.StartTime.Should().Be(TimeSpan.FromSeconds(1));
        subtitle.EndTime.Should().Be(TimeSpan.FromSeconds(2));
        subtitle.Text.Should().Be("Hello");
    }

    [Fact]
    public void Constructor_EndBeforeStart_ThrowsArgumentException()
    {
        // Act
        Action act = () => new Subtitle(
            1,
            TimeSpan.FromSeconds(2),
            TimeSpan.FromSeconds(1),
            "Hello");

        // Assert
        act.Should().Throw<ArgumentException>()
           .WithMessage("*EndTime*StartTime*");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Constructor_InvalidText_ThrowsArgumentException(string text)
    {
        // Act
        Action act = () => new Subtitle(1, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), text);

        // Assert
        act.Should().Throw<ArgumentException>();
    }
}
```

### Integration Tests

**Purpose:** Test multiple components together  
**Dependencies:** Real implementations (DB, file system)  
**Speed:** Slower (100ms-1s per test)

```csharp
public class TranslationIntegrationTests : IDisposable
{
    private readonly LegendAIDbContext _context;
    private readonly string _testDbPath;

    public TranslationIntegrationTests()
    {
        _testDbPath = Path.Combine(Path.GetTempPath(), $"test_{Guid.NewGuid()}.db");

        var options = new DbContextOptionsBuilder<LegendAIDbContext>()
            .UseSqlite($"Data Source={_testDbPath}")
            .Options;

        _context = new LegendAIDbContext(options);
        _context.Database.EnsureCreated();
    }

    [Fact]
    public async Task TranslationRepository_SaveAndRetrieve_Works()
    {
        // Arrange
        var repo = new TranslationRepository(_context);
        var job = new TranslationJob
        {
            FileName = "test.eng.srt",
            Status = TranslationStatus.Pending,
            CreatedAt = DateTime.UtcNow
        };

        // Act
        await repo.AddAsync(job);
        var retrieved = await repo.GetByIdAsync(job.Id);

        // Assert
        retrieved.Should().NotBeNull();
        retrieved!.FileName.Should().Be("test.eng.srt");
        retrieved.Status.Should().Be(TranslationStatus.Pending);
    }

    public void Dispose()
    {
        _context.Dispose();
        if (File.Exists(_testDbPath))
            File.Delete(_testDbPath);
    }
}
```

### End-to-End Tests

**Purpose:** Test complete workflows  
**Dependencies:** Real files, real AI providers (or mocked at HTTP level)  
**Speed:** Slowest (1s-10s per test)

```csharp
public class EndToEndTranslationTests
{
    [Fact]
    public async Task CompleteTranslationWorkflow_ValidFile_ProducesTranslatedFile()
    {
        // Arrange
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempDir);

        var inputPath = Path.Combine(tempDir, "test.eng.srt");
        var outputPath = Path.Combine(tempDir, "test.pt.srt");

        var srtContent = """
            1
            00:00:01,000 --> 00:00:02,000
            Hello, world!

            2
            00:00:03,000 --> 00:00:04,000
            How are you?
            """;

        await File.WriteAllTextAsync(inputPath, srtContent);

        // Create real service with mocked AI provider
        var mockProvider = new Mock<IAIProvider>();
        mockProvider
            .Setup(p => p.TranslateAsync(It.IsAny<TranslationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TranslationRequest req, CancellationToken ct) =>
            {
                // Simulate translation (preserve timing, translate text)
                var translated = req.Subtitles.Select(s => new Subtitle(
                    s.Index,
                    s.StartTime,
                    s.EndTime,
                    s.Text.Replace("Hello", "Olá").Replace("How are you?", "Como vai?")
                )).ToList();

                return new TranslationResponse { Subtitles = translated };
            });

        var service = new TranslationService(mockProvider.Object, ...);

        // Act
        await service.TranslateFileAsync(inputPath);

        // Assert
        File.Exists(outputPath).Should().BeTrue();

        var outputContent = await File.ReadAllTextAsync(outputPath);
        outputContent.Should().Contain("Olá");
        outputContent.Should().Contain("Como vai?");
        outputContent.Should().Contain("00:00:01,000 --> 00:00:02,000"); // Timing preserved

        // Cleanup
        Directory.Delete(tempDir, true);
    }
}
```

---

## Theory Tests (Data-Driven)

### Use [Theory] for Multiple Test Cases

```csharp
[Theory]
[InlineData("00:00:01,000", 1, 0)]
[InlineData("00:01:23,456", 83, 456)]
[InlineData("01:30:00,000", 5400, 0)]
public void ParseTimestamp_ValidFormat_ReturnsCorrectTime(
    string timestamp,
    int expectedSeconds,
    int expectedMilliseconds)
{
    // Act
    var result = SRTParser.ParseTimestamp(timestamp);

    // Assert
    result.TotalSeconds.Should().Be(expectedSeconds);
    result.Milliseconds.Should().Be(expectedMilliseconds);
}

[Theory]
[InlineData("")]
[InlineData("invalid")]
[InlineData("99:99:99,999")]
public void ParseTimestamp_InvalidFormat_ThrowsFormatException(string timestamp)
{
    // Act
    Action act = () => SRTParser.ParseTimestamp(timestamp);

    // Assert
    act.Should().Throw<FormatException>();
}
```

### MemberData for Complex Test Data

```csharp
public class SRTParserTests
{
    public static IEnumerable<object[]> ValidSRTFiles =>
        new List<object[]>
        {
            new object[] { "1\n00:00:01,000 --> 00:00:02,000\nHello", 1 },
            new object[] { "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld", 2 },
            new object[] { File.ReadAllText("TestData/valid.srt"), 100 }
        };

    [Theory]
    [MemberData(nameof(ValidSRTFiles))]
    public void Parse_ValidFiles_ReturnsCorrectCount(string content, int expectedCount)
    {
        var parser = new SRTParser();
        var result = parser.Parse(content);
        result.Should().HaveCount(expectedCount);
    }
}
```

---

## Test Fixtures

### Class Fixture (Shared Setup)

```csharp
public class DatabaseFixture : IDisposable
{
    public LegendAIDbContext Context { get; }

    public DatabaseFixture()
    {
        var options = new DbContextOptionsBuilder<LegendAIDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        Context = new LegendAIDbContext(options);
        Context.Database.EnsureCreated();

        // Seed test data
        Context.Config.Add(new Config { Key = "TestKey", Value = "TestValue" });
        Context.SaveChanges();
    }

    public void Dispose()
    {
        Context.Dispose();
    }
}

public class RepositoryTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fixture;

    public RepositoryTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task GetAsync_ExistingKey_ReturnsValue()
    {
        // Arrange
        var repo = new ConfigRepository(_fixture.Context);

        // Act
        var result = await repo.GetAsync("TestKey");

        // Assert
        result.Should().Be("TestValue");
    }
}
```

---

## Code Coverage

### Target: 80%+ Coverage

```bash
# Run tests with coverage
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=opencover

# Generate HTML report (requires ReportGenerator)
reportgenerator -reports:**/coverage.opencover.xml -targetdir:coverage -reporttypes:Html

# View report
open coverage/index.html
```

### Coverage Goals by Layer

- **Core (Domain):** 90%+ (pure business logic, easy to test)
- **Application:** 85%+ (use cases with mocked dependencies)
- **Infrastructure:** 70%+ (external dependencies, harder to test)
- **UI:** 60%+ (ViewModels testable, Views harder)

---

## Testing Best Practices

### 1. Arrange-Act-Assert (AAA)

```csharp
[Fact]
public void Example_Test_Pattern()
{
    // Arrange: Set up test data and dependencies
    var parser = new SRTParser();
    var content = "1\n00:00:01,000 --> 00:00:02,000\nHello";

    // Act: Execute the method under test
    var result = parser.Parse(content);

    // Assert: Verify the outcome
    result.Should().HaveCount(1);
    result[0].Text.Should().Be("Hello");
}
```

### 2. One Assert Per Test (Guideline)

```csharp
// ✅ GOOD: Focused test
[Fact]
public void Parse_ValidSRT_ReturnsCorrectCount()
{
    var result = parser.Parse(content);
    result.Should().HaveCount(1);
}

[Fact]
public void Parse_ValidSRT_ReturnsCorrectText()
{
    var result = parser.Parse(content);
    result[0].Text.Should().Be("Hello");
}

// ⚠️ ACCEPTABLE: Related assertions
[Fact]
public void Parse_ValidSRT_ReturnsSubtitleWithCorrectProperties()
{
    var result = parser.Parse(content);
    result[0].Index.Should().Be(1);
    result[0].StartTime.Should().Be(TimeSpan.FromSeconds(1));
    result[0].EndTime.Should().Be(TimeSpan.FromSeconds(2));
}

// ❌ BAD: Too many unrelated assertions
[Fact]
public void Parse_ValidSRT_WorksCompletely()
{
    var result = parser.Parse(content);
    result.Should().HaveCount(1);
    result[0].Text.Should().Be("Hello");
    parser.ErrorCount.Should().Be(0);
    parser.LastParsedFile.Should().NotBeNull();
}
```

### 3. Test Isolation

```csharp
// ✅ GOOD: Each test is independent
public class SRTParserTests
{
    [Fact]
    public void Test1()
    {
        var parser = new SRTParser(); // Fresh instance
        // ...
    }

    [Fact]
    public void Test2()
    {
        var parser = new SRTParser(); // Fresh instance
        // ...
    }
}

// ❌ BAD: Shared state between tests
public class SRTParserTests
{
    private readonly SRTParser _parser = new(); // Shared instance

    [Fact]
    public void Test1()
    {
        _parser.Parse("..."); // Modifies shared state
    }

    [Fact]
    public void Test2()
    {
        _parser.Parse("..."); // Affected by Test1 if run after it
    }
}
```

### 4. Test Naming Consistency

```csharp
// ✅ GOOD: Consistent naming pattern
Parse_ValidSRT_ReturnsSubtitles
Parse_EmptyContent_ThrowsArgumentException
Parse_MalformedTimestamp_ThrowsFormatException
TranslateAsync_QuotaExceeded_ThrowsQuotaExceededException
FileWatcher_FileCreated_ProcessesFile

// ❌ BAD: Inconsistent naming
TestParse1
ParseTest
ShouldParseValidSRT
WhenParsingEmptyContentThenThrowsException
```

---

## Performance Testing

### BenchmarkDotNet

```csharp
[MemoryDiagnoser]
public class SRTParserBenchmarks
{
    private string _smallSRT;
    private string _largeSRT;

    [GlobalSetup]
    public void Setup()
    {
        _smallSRT = File.ReadAllText("TestData/small.srt"); // 100 subtitles
        _largeSRT = File.ReadAllText("TestData/large.srt"); // 10,000 subtitles
    }

    [Benchmark]
    public void ParseSmallFile()
    {
        var parser = new SRTParser();
        parser.Parse(_smallSRT);
    }

    [Benchmark]
    public void ParseLargeFile()
    {
        var parser = new SRTParser();
        parser.Parse(_largeSRT);
    }
}

// Run benchmarks:
// dotnet run -c Release --project LegendAI.Benchmarks
```

---

## Common Testing Patterns

### Testing Async Methods

```csharp
[Fact]
public async Task TranslateAsync_ValidRequest_ReturnsResponse()
{
    // Act
    var result = await _service.TranslateAsync(request);

    // Assert
    result.Should().NotBeNull();
}

[Fact]
public async Task TranslateAsync_InvalidRequest_ThrowsException()
{
    // Act
    Func<Task> act = async () => await _service.TranslateAsync(null);

    // Assert
    await act.Should().ThrowAsync<ArgumentNullException>();
}
```

### Testing Cancellation

```csharp
[Fact]
public async Task TranslateAsync_Cancelled_ThrowsOperationCanceledException()
{
    // Arrange
    var cts = new CancellationTokenSource();
    cts.Cancel();

    // Act
    Func<Task> act = async () => await _service.TranslateAsync(request, cts.Token);

    // Assert
    await act.Should().ThrowAsync<OperationCanceledException>();
}
```

### Testing Events

```csharp
[Fact]
public void FileWatcher_FileCreated_RaisesEvent()
{
    // Arrange
    var watcher = new FileWatcherService(...);
    var eventRaised = false;
    watcher.FileDetected += (sender, args) => eventRaised = true;

    // Act
    watcher.SimulateFileCreated("test.eng.srt");

    // Assert
    eventRaised.Should().BeTrue();
}
```

---

## Test Documentation

### XML Comments for Complex Tests

```csharp
/// <summary>
/// Verifies that the SRT parser correctly handles dialogue formatting
/// with hyphen-prefixed lines, which must be preserved during translation.
/// </summary>
/// <remarks>
/// This test covers the critical requirement that multi-speaker dialogue
/// (indicated by leading hyphens) must maintain its formatting.
/// See: DESKTOP-SKILL.MD Section "Translation Rules - Dialogue Formatting"
/// </remarks>
[Fact]
public void Parse_DialogueWithHyphens_PreservesFormatting()
{
    // Arrange
    var content = """
        1
        00:00:01,000 --> 00:00:02,000
        -Hello!
        -Hi there!
        """;

    // Act
    var result = parser.Parse(content);

    // Assert
    result[0].Text.Should().Contain("-Hello!");
    result[0].Text.Should().Contain("-Hi there!");
}
```

---

**Remember:** Tests are documentation. Write clear, maintainable tests that explain what the code should do.
