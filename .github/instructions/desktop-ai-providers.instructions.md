# Desktop AI Providers Instructions

> **Applies to:** `LegendAI.Infrastructure/AI/**/*.cs`  
> **Purpose:** Implement AI provider fallback chain with quota management and rate limiting

---

## AI Provider Contract

### Interface Definition

**MUST implement:**

```csharp
public interface IAIProvider
{
    /// <summary>
    /// Provider name (e.g., "Gemini", "Groq")
    /// </summary>
    string Name { get; }

    /// <summary>
    /// Translate subtitles from English to Brazilian Portuguese
    /// </summary>
    Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Check if provider is available (not on cooldown)
    /// </summary>
    bool IsAvailable();
}
```

---

## Translation Rules (SAME AS WEB)

### Critical Rules

1. **Count Preservation:**
   - Input: 100 subtitles → Output: 100 subtitles
   - If count doesn't match, throw `ValidationException`

2. **Timing Preservation:**
   - NEVER modify timestamps
   - Input: `00:01:23,456 --> 00:01:25,789`
   - Output: `00:01:23,456 --> 00:01:25,789` (EXACT SAME)

3. **Index Preservation:**
   - Input subtitle #5 → Output subtitle #5
   - Use positional mapping by index

4. **Dialogue Formatting:**
   - Preserve hyphen-prefixed lines
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

### Validation After Translation

```csharp
private void ValidateTranslation(
    List<Subtitle> input,
    List<Subtitle> output)
{
    if (input.Count != output.Count)
    {
        throw new ValidationException(
            $"Count mismatch: expected {input.Count}, got {output.Count}");
    }

    for (int i = 0; i < input.Count; i++)
    {
        if (input[i].Index != output[i].Index)
        {
            throw new ValidationException(
                $"Index mismatch at position {i}: expected {input[i].Index}, got {output[i].Index}");
        }

        if (input[i].StartTime != output[i].StartTime ||
            input[i].EndTime != output[i].EndTime)
        {
            throw new ValidationException(
                $"Timing mismatch at index {input[i].Index}");
        }
    }
}
```

---

## Provider Implementation Pattern

### Gemini Provider (Primary)

**Port from web:** `app/api/route.ts`

```csharp
public class GeminiProvider : IAIProvider
{
    private readonly HttpClient _httpClient;
    private readonly IOptions<AIProviderOptions> _options;
    private readonly ILogger<GeminiProvider> _logger;
    private const string MODEL = "gemini-2.0-flash-exp";

    public string Name => "Gemini";

    public GeminiProvider(
        HttpClient httpClient,
        IOptions<AIProviderOptions> options,
        ILogger<GeminiProvider> logger)
    {
        _httpClient = httpClient;
        _options = options;
        _logger = logger;
    }

    public async Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        _logger.Information("Translating {Count} subtitles with {Provider}",
            request.Subtitles.Count, Name);

        var prompt = BuildPrompt(request);

        var payload = new
        {
            contents = new[]
            {
                new
                {
                    parts = new[] { new { text = prompt } }
                }
            },
            generationConfig = new
            {
                temperature = 0.3,
                maxOutputTokens = 8192
            }
        };

        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={_options.Value.GeminiApiKey}";

        var response = await _httpClient.PostAsJsonAsync(url, payload, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();

            if (response.StatusCode == HttpStatusCode.TooManyRequests ||
                response.StatusCode == HttpStatusCode.Forbidden)
            {
                throw new QuotaExceededException($"{Name} quota exceeded");
            }

            throw new AIProviderException($"{Name} error: {error}");
        }

        var result = await response.Content.ReadFromJsonAsync<GeminiResponse>();
        var translatedText = result?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;

        if (string.IsNullOrWhiteSpace(translatedText))
        {
            throw new AIProviderException($"{Name} returned empty response");
        }

        // Parse response into subtitles (same logic as web)
        var translated = ParseTranslatedSubtitles(translatedText);

        // Validate count matches
        ValidateTranslation(request.Subtitles, translated);

        _logger.Information("Successfully translated {Count} subtitles with {Provider}",
            translated.Count, Name);

        return new TranslationResponse { Subtitles = translated };
    }

    public bool IsAvailable()
    {
        return !string.IsNullOrWhiteSpace(_options.Value.GeminiApiKey);
    }

    private string BuildPrompt(TranslationRequest request)
    {
        var context = request.Metadata != null
            ? $"Context: You are translating subtitles for \"{request.Metadata.Title}\" ({request.Metadata.Year}).\n" +
              $"Genre: {request.Metadata.Genre}\n" +
              $"Synopsis: {request.Metadata.Synopsis}\n\n"
            : "";

        var subtitleText = string.Join("\n\n", request.Subtitles.Select(s =>
            $"{s.Index}\n{FormatTimestamp(s.StartTime)} --> {FormatTimestamp(s.EndTime)}\n{s.Text}"));

        return $"{context}Translate these English subtitles to Brazilian Portuguese. " +
               $"CRITICAL: Preserve exact timing, index numbers, and subtitle count.\n\n" +
               $"{subtitleText}";
    }

    private string FormatTimestamp(TimeSpan time)
    {
        return $"{time.Hours:00}:{time.Minutes:00}:{time.Seconds:00},{time.Milliseconds:000}";
    }

    private List<Subtitle> ParseTranslatedSubtitles(string text)
    {
        // Same parsing logic as web version (lib/srt.ts parseStreamedResponse)
        var subtitles = new List<Subtitle>();
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        for (int i = 0; i < lines.Length; i++)
        {
            if (int.TryParse(lines[i], out var index))
            {
                if (i + 2 < lines.Length)
                {
                    var timing = lines[i + 1];
                    var textContent = lines[i + 2];

                    // Parse timing
                    var parts = timing.Split(" --> ");
                    if (parts.Length == 2)
                    {
                        var start = ParseTimeSpan(parts[0]);
                        var end = ParseTimeSpan(parts[1]);

                        subtitles.Add(new Subtitle(index, start, end, textContent));
                    }
                }
            }
        }

        return subtitles;
    }

    private TimeSpan ParseTimeSpan(string timestamp)
    {
        // Parse "00:01:23,456" format
        var parts = timestamp.Split(':');
        var secondsAndMillis = parts[2].Split(',');

        return new TimeSpan(
            0,
            int.Parse(parts[0]),
            int.Parse(parts[1]),
            int.Parse(secondsAndMillis[0]),
            int.Parse(secondsAndMillis[1]));
    }
}
```

### Groq Provider (Fallback 1)

```csharp
public class GroqProvider : IAIProvider
{
    private readonly HttpClient _httpClient;
    private readonly IOptions<AIProviderOptions> _options;
    private readonly ILogger<GroqProvider> _logger;
    private const string MODEL = "llama-3.1-70b-versatile";

    public string Name => "Groq";

    public async Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        _logger.Information("Translating with {Provider}", Name);

        var prompt = BuildPrompt(request);

        var payload = new
        {
            model = MODEL,
            messages = new[]
            {
                new { role = "system", content = "You are a professional subtitle translator." },
                new { role = "user", content = prompt }
            },
            temperature = 0.3,
            max_tokens = 8192
        };

        _httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _options.Value.GroqApiKey);

        var response = await _httpClient.PostAsJsonAsync(
            "https://api.groq.com/openai/v1/chat/completions",
            payload,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                throw new QuotaExceededException($"{Name} rate limit exceeded");

            var error = await response.Content.ReadAsStringAsync();
            throw new AIProviderException($"{Name} error: {error}");
        }

        var result = await response.Content.ReadFromJsonAsync<GroqResponse>();
        var translatedText = result?.Choices?.FirstOrDefault()?.Message?.Content;

        if (string.IsNullOrWhiteSpace(translatedText))
            throw new AIProviderException($"{Name} returned empty response");

        var translated = ParseTranslatedSubtitles(translatedText);
        ValidateTranslation(request.Subtitles, translated);

        return new TranslationResponse { Subtitles = translated };
    }

    public bool IsAvailable()
    {
        return !string.IsNullOrWhiteSpace(_options.Value.GroqApiKey);
    }

    // Same BuildPrompt and ParseTranslatedSubtitles as Gemini
}
```

---

## Fallback Chain Logic

### FallbackChain Service

```csharp
public class FallbackChain
{
    private readonly IEnumerable<IAIProvider> _providers;
    private readonly IAPIUsageRepository _usageRepo;
    private readonly ILogger<FallbackChain> _logger;

    public FallbackChain(
        IEnumerable<IAIProvider> providers,
        IAPIUsageRepository usageRepo,
        ILogger<FallbackChain> logger)
    {
        _providers = providers;
        _usageRepo = usageRepo;
        _logger = logger;
    }

    public async Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken = default)
    {
        var attempts = new List<string>();

        foreach (var provider in _providers.Where(p => p.IsAvailable()))
        {
            // Check if provider is on cooldown
            if (await IsOnCooldownAsync(provider.Name))
            {
                _logger.Warning("Provider {Provider} on cooldown, skipping", provider.Name);
                attempts.Add($"{provider.Name}: on cooldown");
                continue;
            }

            try
            {
                _logger.Information("Attempting translation with {Provider}", provider.Name);

                var response = await provider.TranslateAsync(request, cancellationToken);

                // Success! Record and return
                await _usageRepo.RecordSuccessAsync(provider.Name);
                _logger.Information("Translation successful with {Provider}", provider.Name);

                return response;
            }
            catch (QuotaExceededException ex)
            {
                _logger.Warning(ex, "Provider {Provider} quota exceeded", provider.Name);
                await _usageRepo.RecordQuotaExceededAsync(provider.Name);
                attempts.Add($"{provider.Name}: quota exceeded");
                // Try next provider
            }
            catch (ValidationException ex)
            {
                _logger.Error(ex, "Provider {Provider} validation failed", provider.Name);
                attempts.Add($"{provider.Name}: validation failed");
                // Try next provider
            }
            catch (AIProviderException ex)
            {
                _logger.Error(ex, "Provider {Provider} failed", provider.Name);
                await _usageRepo.RecordFailureAsync(provider.Name);
                attempts.Add($"{provider.Name}: {ex.Message}");
                // Try next provider
            }
        }

        // All providers failed
        var errorMessage = $"All providers failed. Attempts:\n{string.Join("\n", attempts)}";
        _logger.Error("Translation failed after trying all providers");
        throw new AllProvidersFailedException(errorMessage);
    }

    private async Task<bool> IsOnCooldownAsync(string providerName)
    {
        var lastFailure = await _usageRepo.GetLastFailureAsync(providerName);
        if (lastFailure == null) return false;

        var cooldownMinutes = GetCooldownMinutes(lastFailure.ConsecutiveFailures);
        var cooldownEnds = lastFailure.Timestamp.AddMinutes(cooldownMinutes);

        if (DateTime.UtcNow < cooldownEnds)
        {
            var remaining = cooldownEnds - DateTime.UtcNow;
            _logger.Debug("Provider {Provider} on cooldown for {Minutes} more minutes",
                providerName, remaining.TotalMinutes);
            return true;
        }

        return false;
    }

    private int GetCooldownMinutes(int consecutiveFailures)
    {
        return consecutiveFailures switch
        {
            1 => 1,    // 1 minute after first failure
            2 => 2,    // 2 minutes after second
            _ => 5     // 5 minutes after 3+ failures
        };
    }
}
```

---

## Rate Limiting

### Polly Rate Limiter

```csharp
public class RateLimiter
{
    private readonly AsyncRateLimitPolicy _policy;
    private readonly ILogger<RateLimiter> _logger;

    public RateLimiter(int requestsPerMinute, ILogger<RateLimiter> logger)
    {
        _logger = logger;

        _policy = Policy.RateLimitAsync(
            numberOfExecutions: requestsPerMinute,
            perTimeSpan: TimeSpan.FromMinutes(1),
            maxBurst: requestsPerMinute);
    }

    public async Task<T> ExecuteAsync<T>(
        Func<Task<T>> action,
        string providerName)
    {
        try
        {
            return await _policy.ExecuteAsync(action);
        }
        catch (RateLimitRejectedException ex)
        {
            _logger.Warning("Rate limit hit for {Provider}, waiting...", providerName);

            // Wait a bit and retry once
            await Task.Delay(TimeSpan.FromSeconds(1));
            return await _policy.ExecuteAsync(action);
        }
    }
}

// Usage in provider:
public class GeminiProvider : IAIProvider
{
    private readonly RateLimiter _rateLimiter;

    public async Task<TranslationResponse> TranslateAsync(...)
    {
        return await _rateLimiter.ExecuteAsync(
            async () => await DoTranslateAsync(...),
            Name);
    }
}
```

---

## Quota Management

### API Usage Repository

```csharp
public interface IAPIUsageRepository
{
    Task RecordSuccessAsync(string provider);
    Task RecordFailureAsync(string provider);
    Task RecordQuotaExceededAsync(string provider);
    Task<APIUsageRecord?> GetLastFailureAsync(string provider);
    Task<int> GetTodayUsageCountAsync(string provider);
}

public class APIUsageRepository : IAPIUsageRepository
{
    private readonly LegendAIDbContext _context;

    public async Task RecordSuccessAsync(string provider)
    {
        _context.APIUsage.Add(new APIUsage
        {
            Provider = provider,
            RequestTimestamp = DateTime.UtcNow,
            Success = true
        });
        await _context.SaveChangesAsync();

        // Reset consecutive failures on success
        await ResetConsecutiveFailuresAsync(provider);
    }

    public async Task RecordQuotaExceededAsync(string provider)
    {
        _context.APIUsage.Add(new APIUsage
        {
            Provider = provider,
            RequestTimestamp = DateTime.UtcNow,
            Success = false,
            ErrorMessage = "Quota exceeded"
        });
        await _context.SaveChangesAsync();

        await IncrementConsecutiveFailuresAsync(provider);
    }

    public async Task<int> GetTodayUsageCountAsync(string provider)
    {
        var today = DateTime.UtcNow.Date;

        return await _context.APIUsage
            .CountAsync(u => u.Provider == provider &&
                            u.Success &&
                            u.RequestTimestamp >= today);
    }
}
```

---

## Error Handling

### Exception Hierarchy

```csharp
public class AIProviderException : Exception
{
    public AIProviderException(string message) : base(message) { }
    public AIProviderException(string message, Exception inner) : base(message, inner) { }
}

public class QuotaExceededException : AIProviderException
{
    public QuotaExceededException(string message) : base(message) { }
}

public class ValidationException : AIProviderException
{
    public ValidationException(string message) : base(message) { }
}

public class AllProvidersFailedException : AIProviderException
{
    public AllProvidersFailedException(string message) : base(message) { }
}
```

### Retry Logic with Polly

```csharp
public class GeminiProvider : IAIProvider
{
    private readonly IAsyncPolicy<HttpResponseMessage> _retryPolicy;

    public GeminiProvider(...)
    {
        _retryPolicy = Policy
            .HandleResult<HttpResponseMessage>(r => !r.IsSuccessStatusCode)
            .Or<HttpRequestException>()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                onRetry: (outcome, timespan, retryCount, context) =>
                {
                    _logger.Warning("Retry {RetryCount} after {Delay}s", retryCount, timespan.TotalSeconds);
                });
    }

    public async Task<TranslationResponse> TranslateAsync(...)
    {
        var response = await _retryPolicy.ExecuteAsync(
            async () => await _httpClient.PostAsJsonAsync(url, payload));

        // ... rest of logic
    }
}
```

---

## Configuration

### AIProviderOptions

```csharp
public class AIProviderOptions
{
    public string GeminiApiKey { get; set; } = "";
    public string GroqApiKey { get; set; } = "";
    public string TogetherAPIKey { get; set; } = "";
    public string CohereApiKey { get; set; } = "";

    public string[] FallbackChain { get; set; } = { "Gemini", "Groq", "TogetherAI", "Cohere" };
    public int RateLimitPerMinute { get; set; } = 10;
}

// appsettings.json
{
  "AIProvider": {
    "FallbackChain": ["Gemini", "Groq", "TogetherAI", "Cohere"],
    "RateLimitPerMinute": 10
  }
}

// Register in DI:
services.Configure<AIProviderOptions>(
    Configuration.GetSection("AIProvider"));
```

---

## Testing

### Mock Provider for Tests

```csharp
public class MockAIProvider : IAIProvider
{
    public string Name => "Mock";
    public List<TranslationRequest> Requests { get; } = new();
    public TranslationResponse? ResponseToReturn { get; set; }
    public Exception? ExceptionToThrow { get; set; }

    public Task<TranslationResponse> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken)
    {
        Requests.Add(request);

        if (ExceptionToThrow != null)
            throw ExceptionToThrow;

        return Task.FromResult(ResponseToReturn ?? new TranslationResponse { ... });
    }

    public bool IsAvailable() => true;
}

// Usage in tests:
[Fact]
public async Task FallbackChain_WhenPrimaryFails_FallsBackToSecondary()
{
    // Arrange
    var primary = new MockAIProvider
    {
        Name = "Primary",
        ExceptionToThrow = new QuotaExceededException("Quota exceeded")
    };

    var secondary = new MockAIProvider
    {
        Name = "Secondary",
        ResponseToReturn = new TranslationResponse { ... }
    };

    var chain = new FallbackChain(new[] { primary, secondary }, ...);

    // Act
    var result = await chain.TranslateAsync(new TranslationRequest { ... });

    // Assert
    result.Should().NotBeNull();
    primary.Requests.Should().HaveCount(1);
    secondary.Requests.Should().HaveCount(1);
}
```

---

## Logging Best Practices

```csharp
// ✅ GOOD: Structured logging with context
_logger.Information(
    "Translation started for {FileName} with {Provider}, {ChunkCount} chunks",
    fileName, providerName, chunkCount);

_logger.Warning(
    "Provider {Provider} quota exceeded, trying fallback {Fallback}",
    primaryProvider, fallbackProvider);

_logger.Error(ex,
    "Translation failed for {FileName} with {Provider} after {Attempts} attempts",
    fileName, providerName, attempts);

// ❌ BAD: String interpolation (loses structure)
_logger.Information($"Translation started for {fileName}");
```

---

## Performance Considerations

1. **Parallel Chunk Translation:**
   - Translate multiple chunks at once (respecting rate limits)
   - Use `Task.WhenAll()`

2. **HttpClient Reuse:**
   - Single HttpClient instance per provider (injected)
   - Connection pooling

3. **Caching:**
   - Cache metadata (IMDB) to avoid repeated API calls
   - Cache successful provider for current session

---

**Remember:** AI providers are CRITICAL to the app. Follow all rules, especially count preservation and timing preservation. Test thoroughly with real subtitle files.
