# Desktop UI Instructions

> **Applies to:** `LegendAI.UI/**/*.cs`, `LegendAI.UI/**/*.axaml`  
> **Purpose:** Build clean, responsive Avalonia UI following MVVM pattern

---

## MVVM Architecture

### Pattern Overview

```
View (XAML)
    ↓ DataContext
ViewModel (C#)
    ↓ Calls
Model/Services (Business Logic)
```

**Rules:**

1. Views are XAML only (no code-behind except initialization)
2. ViewModels expose properties and commands
3. ViewModels never reference Views
4. Models/Services have no UI dependencies

---

## ViewModel Pattern

### Base ViewModel

```csharp
public class ViewModelBase : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    protected bool SetProperty<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return false;

        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }
}
```

### Example ViewModel

```csharp
public class MainViewModel : ViewModelBase
{
    private readonly ITranslationService _translationService;
    private readonly ILogger<MainViewModel> _logger;

    private string _monitoredDirectory = "";
    private bool _isMonitoring;
    private ObservableCollection<TranslationJobViewModel> _activeJobs = new();
    private ObservableCollection<LogEntryViewModel> _logs = new();

    public MainViewModel(
        ITranslationService translationService,
        ILogger<MainViewModel> logger)
    {
        _translationService = translationService;
        _logger = logger;

        StartMonitoringCommand = ReactiveCommand.CreateFromTask(StartMonitoringAsync);
        StopMonitoringCommand = ReactiveCommand.CreateFromTask(StopMonitoringAsync);
        SelectDirectoryCommand = ReactiveCommand.CreateFromTask(SelectDirectoryAsync);
        ClearLogsCommand = ReactiveCommand.Create(ClearLogs);
    }

    // Properties
    public string MonitoredDirectory
    {
        get => _monitoredDirectory;
        set => SetProperty(ref _monitoredDirectory, value);
    }

    public bool IsMonitoring
    {
        get => _isMonitoring;
        set => SetProperty(ref _isMonitoring, value);
    }

    public ObservableCollection<TranslationJobViewModel> ActiveJobs
    {
        get => _activeJobs;
        set => SetProperty(ref _activeJobs, value);
    }

    public ObservableCollection<LogEntryViewModel> Logs
    {
        get => _logs;
        set => SetProperty(ref _logs, value);
    }

    // Commands
    public ICommand StartMonitoringCommand { get; }
    public ICommand StopMonitoringCommand { get; }
    public ICommand SelectDirectoryCommand { get; }
    public ICommand ClearLogsCommand { get; }

    // Command Implementations
    private async Task StartMonitoringAsync()
    {
        try
        {
            await _translationService.StartMonitoringAsync(MonitoredDirectory);
            IsMonitoring = true;
            _logger.Information("Monitoring started for {Directory}", MonitoredDirectory);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to start monitoring");
            // Show error dialog (see Error Handling section)
        }
    }

    private async Task StopMonitoringAsync()
    {
        try
        {
            await _translationService.StopMonitoringAsync();
            IsMonitoring = false;
            _logger.Information("Monitoring stopped");
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to stop monitoring");
        }
    }

    private async Task SelectDirectoryAsync()
    {
        var dialog = new OpenFolderDialog();
        var result = await dialog.ShowAsync(/* pass window reference */);

        if (!string.IsNullOrEmpty(result))
        {
            MonitoredDirectory = result;
        }
    }

    private void ClearLogs()
    {
        Logs.Clear();
    }
}
```

---

## View (XAML) Pattern

### MainWindow.axaml

```xml
<Window xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:vm="using:LegendAI.UI.ViewModels"
        xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
        mc:Ignorable="d" d:DesignWidth="1200" d:DesignHeight="700"
        x:Class="LegendAI.UI.Views.MainWindow"
        x:DataType="vm:MainViewModel"
        Title="LegendAI - Subtitle Translator"
        Width="1200" Height="700"
        MinWidth="800" MinHeight="600">

    <Design.DataContext>
        <vm:MainViewModel />
    </Design.DataContext>

    <DockPanel>
        <!-- Status Bar (Top) -->
        <Border DockPanel.Dock="Top" Background="#1e1e1e" Padding="10,5">
            <Grid ColumnDefinitions="Auto,*,Auto">
                <!-- Status Indicator -->
                <StackPanel Grid.Column="0" Orientation="Horizontal" Spacing="10">
                    <Ellipse Width="10" Height="10">
                        <Ellipse.Fill>
                            <SolidColorBrush Color="{Binding IsMonitoring,
                                Converter={StaticResource IsMonitoringToColorConverter}}" />
                        </Ellipse.Fill>
                    </Ellipse>
                    <TextBlock Text="{Binding IsMonitoring,
                        Converter={StaticResource IsMonitoringToTextConverter}}"
                        Foreground="White" />
                </StackPanel>

                <!-- Directory -->
                <TextBlock Grid.Column="1"
                    Text="{Binding MonitoredDirectory}"
                    Foreground="Gray"
                    Margin="20,0"
                    VerticalAlignment="Center" />

                <!-- Controls -->
                <StackPanel Grid.Column="2" Orientation="Horizontal" Spacing="5">
                    <Button Command="{Binding SelectDirectoryCommand}">
                        Select Directory
                    </Button>
                    <Button Command="{Binding StartMonitoringCommand}"
                        IsEnabled="{Binding !IsMonitoring}">
                        Start
                    </Button>
                    <Button Command="{Binding StopMonitoringCommand}"
                        IsEnabled="{Binding IsMonitoring}">
                        Stop
                    </Button>
                </StackPanel>
            </Grid>
        </Border>

        <!-- Main Content -->
        <Grid RowDefinitions="Auto,*,200">
            <!-- Active Translations -->
            <Border Grid.Row="0" BorderBrush="Gray" BorderThickness="0,0,0,1" Padding="10">
                <StackPanel>
                    <TextBlock Text="Active Translations"
                        FontSize="16" FontWeight="Bold"
                        Margin="0,0,0,10" />

                    <ItemsControl ItemsSource="{Binding ActiveJobs}">
                        <ItemsControl.ItemTemplate>
                            <DataTemplate>
                                <Border BorderBrush="Gray"
                                    BorderThickness="1"
                                    CornerRadius="5"
                                    Padding="10"
                                    Margin="0,5">
                                    <Grid RowDefinitions="Auto,Auto,Auto"
                                        ColumnDefinitions="*,Auto">

                                        <!-- File Name -->
                                        <TextBlock Grid.Row="0" Grid.Column="0"
                                            Text="{Binding FileName}"
                                            FontWeight="SemiBold" />

                                        <!-- Status -->
                                        <TextBlock Grid.Row="0" Grid.Column="1"
                                            Text="{Binding Status}"
                                            Foreground="Gray" />

                                        <!-- Progress Bar -->
                                        <ProgressBar Grid.Row="1" Grid.ColumnSpan="2"
                                            Value="{Binding Progress}"
                                            Maximum="100"
                                            Margin="0,5" />

                                        <!-- Details -->
                                        <TextBlock Grid.Row="2" Grid.ColumnSpan="2"
                                            Text="{Binding Details}"
                                            Foreground="Gray"
                                            FontSize="12" />
                                    </Grid>
                                </Border>
                            </DataTemplate>
                        </ItemsControl.ItemTemplate>
                    </ItemsControl>
                </StackPanel>
            </Border>

            <!-- Logs -->
            <Border Grid.Row="2" BorderBrush="Gray" BorderThickness="0,1,0,0" Padding="10">
                <DockPanel>
                    <!-- Log Header -->
                    <Grid DockPanel.Dock="Top" ColumnDefinitions="*,Auto" Margin="0,0,0,10">
                        <TextBlock Grid.Column="0"
                            Text="Logs"
                            FontSize="16" FontWeight="Bold" />

                        <Button Grid.Column="1"
                            Command="{Binding ClearLogsCommand}">
                            Clear
                        </Button>
                    </Grid>

                    <!-- Log Entries -->
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <ItemsControl ItemsSource="{Binding Logs}">
                            <ItemsControl.ItemTemplate>
                                <DataTemplate>
                                    <Border Padding="5,2">
                                        <Grid ColumnDefinitions="Auto,Auto,*">
                                            <!-- Timestamp -->
                                            <TextBlock Grid.Column="0"
                                                Text="{Binding Timestamp, StringFormat='{}{0:HH:mm:ss}'}"
                                                Foreground="Gray"
                                                FontFamily="Consolas"
                                                Margin="0,0,10,0" />

                                            <!-- Level -->
                                            <TextBlock Grid.Column="1"
                                                Text="{Binding Level}"
                                                Foreground="{Binding Level,
                                                    Converter={StaticResource LogLevelToColorConverter}}"
                                                FontWeight="Bold"
                                                Margin="0,0,10,0" />

                                            <!-- Message -->
                                            <TextBlock Grid.Column="2"
                                                Text="{Binding Message}"
                                                TextWrapping="Wrap"
                                                FontFamily="Consolas" />
                                        </Grid>
                                    </Border>
                                </DataTemplate>
                            </ItemsControl.ItemTemplate>
                        </ItemsControl>
                    </ScrollViewer>
                </DockPanel>
            </Border>
        </Grid>
    </DockPanel>
</Window>
```

### MainWindow.axaml.cs (Code-Behind - Minimal)

```csharp
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }
}
```

---

## ReactiveUI Commands

### Creating Commands

```csharp
// Synchronous command
ClearLogsCommand = ReactiveCommand.Create(ClearLogs);

// Async command
StartMonitoringCommand = ReactiveCommand.CreateFromTask(StartMonitoringAsync);

// Command with parameter
DeleteJobCommand = ReactiveCommand.Create<TranslationJobViewModel>(DeleteJob);

// Command with CanExecute
StartMonitoringCommand = ReactiveCommand.CreateFromTask(
    StartMonitoringAsync,
    this.WhenAnyValue(x => x.MonitoredDirectory, dir => !string.IsNullOrEmpty(dir)));
```

### Binding Commands in XAML

```xml
<!-- Simple command -->
<Button Command="{Binding StartMonitoringCommand}">
    Start
</Button>

<!-- Command with parameter -->
<Button Command="{Binding DeleteJobCommand}"
        CommandParameter="{Binding}">
    Delete
</Button>

<!-- IsEnabled binding -->
<Button Command="{Binding StartMonitoringCommand}"
        IsEnabled="{Binding !IsMonitoring}">
    Start
</Button>
```

---

## Data Binding

### Property Binding

```xml
<!-- Two-way binding (default for TextBox) -->
<TextBox Text="{Binding MonitoredDirectory}" />

<!-- One-way binding -->
<TextBlock Text="{Binding StatusMessage, Mode=OneWay}" />

<!-- One-time binding (for static data) -->
<TextBlock Text="{Binding AppVersion, Mode=OneTime}" />

<!-- String format -->
<TextBlock Text="{Binding Progress, StringFormat='Progress: {0}%'}" />
<TextBlock Text="{Binding Timestamp, StringFormat='{}{0:yyyy-MM-dd HH:mm:ss}'}" />
```

### Collection Binding

```xml
<!-- ItemsControl (no selection) -->
<ItemsControl ItemsSource="{Binding Logs}">
    <ItemsControl.ItemTemplate>
        <DataTemplate>
            <TextBlock Text="{Binding Message}" />
        </DataTemplate>
    </ItemsControl.ItemTemplate>
</ItemsControl>

<!-- ListBox (with selection) -->
<ListBox ItemsSource="{Binding ActiveJobs}"
         SelectedItem="{Binding SelectedJob}">
    <ListBox.ItemTemplate>
        <DataTemplate>
            <TextBlock Text="{Binding FileName}" />
        </DataTemplate>
    </ListBox.ItemTemplate>
</ListBox>

<!-- DataGrid -->
<DataGrid ItemsSource="{Binding TranslationHistory}"
          AutoGenerateColumns="False">
    <DataGrid.Columns>
        <DataGridTextColumn Header="File Name" Binding="{Binding FileName}" />
        <DataGridTextColumn Header="Status" Binding="{Binding Status}" />
        <DataGridTextColumn Header="Date" Binding="{Binding CreatedAt, StringFormat='{}{0:yyyy-MM-dd}'}" />
    </DataGrid.Columns>
</DataGrid>
```

---

## Value Converters

### Creating Converters

```csharp
public class IsMonitoringToColorConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool isMonitoring)
        {
            return isMonitoring ? Colors.Green : Colors.Red;
        }
        return Colors.Gray;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class LogLevelToColorConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string level)
        {
            return level switch
            {
                "Error" => Colors.Red,
                "Warning" => Colors.Orange,
                "Information" => Colors.Green,
                _ => Colors.White
            };
        }
        return Colors.White;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
```

### Registering Converters

```xml
<Window.Resources>
    <converters:IsMonitoringToColorConverter x:Key="IsMonitoringToColorConverter" />
    <converters:LogLevelToColorConverter x:Key="LogLevelToColorConverter" />
</Window.Resources>
```

### Using Converters

```xml
<TextBlock
    Foreground="{Binding Level, Converter={StaticResource LogLevelToColorConverter}}" />
```

---

## Styling

### Global Styles (App.axaml)

```xml
<Application.Styles>
    <FluentTheme />

    <Style Selector="Button">
        <Setter Property="Padding" Value="10,5" />
        <Setter Property="Margin" Value="5" />
        <Setter Property="CornerRadius" Value="5" />
    </Style>

    <Style Selector="Button:pointerover">
        <Setter Property="Background" Value="#2a2a2a" />
    </Style>

    <Style Selector="TextBox">
        <Setter Property="Padding" Value="5" />
        <Setter Property="CornerRadius" Value="3" />
    </Style>

    <Style Selector="ProgressBar">
        <Setter Property="Height" Value="20" />
        <Setter Property="Foreground" Value="#4CAF50" />
    </Style>
</Application.Styles>
```

### Theme Support

```csharp
public class ThemeService
{
    public void SetTheme(ThemeVariant theme)
    {
        if (Application.Current is App app)
        {
            app.RequestedThemeVariant = theme;
        }
    }

    public ThemeVariant CurrentTheme =>
        Application.Current?.ActualThemeVariant ?? ThemeVariant.Default;
}

// Toggle theme
_themeService.SetTheme(ThemeVariant.Dark);
_themeService.SetTheme(ThemeVariant.Light);
```

---

## Dialogs

### Message Box

```csharp
public class DialogService : IDialogService
{
    public async Task ShowErrorAsync(string title, string message)
    {
        var dialog = new Window
        {
            Title = title,
            Width = 400,
            Height = 200,
            Content = new StackPanel
            {
                Margin = new Thickness(20),
                Spacing = 10,
                Children =
                {
                    new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
                    new Button { Content = "OK", HorizontalAlignment = HorizontalAlignment.Center }
                }
            }
        };

        await dialog.ShowDialog(GetMainWindow());
    }

    public async Task<bool> ShowConfirmationAsync(string title, string message)
    {
        var result = false;

        var dialog = new Window
        {
            Title = title,
            Width = 400,
            Height = 200
        };

        var okButton = new Button { Content = "OK" };
        okButton.Click += (s, e) => { result = true; dialog.Close(); };

        var cancelButton = new Button { Content = "Cancel" };
        cancelButton.Click += (s, e) => dialog.Close();

        dialog.Content = new StackPanel
        {
            Margin = new Thickness(20),
            Spacing = 10,
            Children =
            {
                new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
                new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Spacing = 10,
                    Children = { okButton, cancelButton }
                }
            }
        };

        await dialog.ShowDialog(GetMainWindow());
        return result;
    }
}
```

---

## Error Handling in UI

### ViewModel Error Handling

```csharp
public class MainViewModel : ViewModelBase
{
    private string _errorMessage = "";
    private bool _hasError;

    public string ErrorMessage
    {
        get => _errorMessage;
        set
        {
            SetProperty(ref _errorMessage, value);
            HasError = !string.IsNullOrEmpty(value);
        }
    }

    public bool HasError
    {
        get => _hasError;
        set => SetProperty(ref _hasError, value);
    }

    private async Task StartMonitoringAsync()
    {
        try
        {
            ErrorMessage = ""; // Clear previous errors
            await _translationService.StartMonitoringAsync(MonitoredDirectory);
            IsMonitoring = true;
        }
        catch (DirectoryNotFoundException ex)
        {
            ErrorMessage = $"Directory not found: {MonitoredDirectory}";
            _logger.Error(ex, "Directory not found");
        }
        catch (UnauthorizedAccessException ex)
        {
            ErrorMessage = "Access denied. Please select a different directory.";
            _logger.Error(ex, "Access denied");
        }
        catch (Exception ex)
        {
            ErrorMessage = "An unexpected error occurred. Please try again.";
            _logger.Error(ex, "Unexpected error starting monitoring");
        }
    }
}
```

### Error Display in XAML

```xml
<!-- Error Banner -->
<Border IsVisible="{Binding HasError}"
        Background="DarkRed"
        Padding="10,5"
        Margin="0,0,0,10">
    <Grid ColumnDefinitions="*,Auto">
        <TextBlock Grid.Column="0"
            Text="{Binding ErrorMessage}"
            Foreground="White"
            TextWrapping="Wrap" />

        <Button Grid.Column="1"
            Content="✕"
            Command="{Binding ClearErrorCommand}"
            Background="Transparent"
            Foreground="White" />
    </Grid>
</Border>
```

---

## Performance Optimization

### Virtualization

```xml
<!-- Use VirtualizingStackPanel for large lists -->
<ListBox ItemsSource="{Binding LargeLogs}"
         VirtualizationMode="Recycling">
    <ListBox.ItemsPanel>
        <ItemsPanelTemplate>
            <VirtualizingStackPanel />
        </ItemsPanelTemplate>
    </ListBox.ItemsPanel>
</ListBox>
```

### Async Loading

```csharp
public class MainViewModel : ViewModelBase
{
    private bool _isLoading;

    public bool IsLoading
    {
        get => _isLoading;
        set => SetProperty(ref _isLoading, value);
    }

    public async Task LoadDataAsync()
    {
        IsLoading = true;

        try
        {
            var jobs = await _repository.GetActiveJobsAsync();
            ActiveJobs = new ObservableCollection<TranslationJobViewModel>(jobs);
        }
        finally
        {
            IsLoading = false;
        }
    }
}
```

```xml
<!-- Loading indicator -->
<Grid>
    <!-- Main content -->
    <ContentControl Content="{Binding}" IsVisible="{Binding !IsLoading}" />

    <!-- Loading overlay -->
    <Border IsVisible="{Binding IsLoading}"
            Background="#80000000"
            HorizontalAlignment="Stretch"
            VerticalAlignment="Stretch">
        <StackPanel HorizontalAlignment="Center"
                    VerticalAlignment="Center"
                    Spacing="10">
            <ProgressBar IsIndeterminate="True" Width="200" />
            <TextBlock Text="Loading..." Foreground="White" />
        </StackPanel>
    </Border>
</Grid>
```

---

## Testing UI

### ViewModel Testing

```csharp
public class MainViewModelTests
{
    [Fact]
    public async Task StartMonitoring_ValidDirectory_SetsIsMonitoring()
    {
        // Arrange
        var mockService = new Mock<ITranslationService>();
        var viewModel = new MainViewModel(mockService.Object, ...);
        viewModel.MonitoredDirectory = "C:\\Test";

        // Act
        await viewModel.StartMonitoringCommand.Execute();

        // Assert
        viewModel.IsMonitoring.Should().BeTrue();
        mockService.Verify(s => s.StartMonitoringAsync("C:\\Test"), Times.Once);
    }

    [Fact]
    public void MonitoredDirectory_WhenSet_RaisesPropertyChanged()
    {
        // Arrange
        var viewModel = new MainViewModel(...);
        var propertyChangedRaised = false;
        viewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(viewModel.MonitoredDirectory))
                propertyChangedRaised = true;
        };

        // Act
        viewModel.MonitoredDirectory = "C:\\Test";

        // Assert
        propertyChangedRaised.Should().BeTrue();
    }
}
```

---

## Dependency Injection for UI

### Program.cs

```csharp
public class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        BuildAvaloniaApp()
            .StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp()
    {
        var services = new ServiceCollection();
        ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        return AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace()
            .AfterSetup(_ =>
            {
                // Register service provider with App
                if (Application.Current is App app)
                {
                    app.ServiceProvider = serviceProvider;
                }
            });
    }

    private static void ConfigureServices(IServiceCollection services)
    {
        // ViewModels
        services.AddTransient<MainViewModel>();
        services.AddTransient<SettingsViewModel>();

        // Services
        services.AddSingleton<ITranslationService, TranslationService>();
        services.AddSingleton<IDialogService, DialogService>();
        services.AddSingleton<IThemeService, ThemeService>();

        // Infrastructure
        services.AddDbContext<LegendAIDbContext>();
        services.AddSingleton<IFileWatcherService, FileWatcherService>();
    }
}
```

### App.axaml.cs

```csharp
public class App : Application
{
    public IServiceProvider? ServiceProvider { get; set; }

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var mainViewModel = ServiceProvider?.GetRequiredService<MainViewModel>();

            desktop.MainWindow = new MainWindow
            {
                DataContext = mainViewModel
            };
        }

        base.OnFrameworkInitializationCompleted();
    }
}
```

---

## Common Patterns

### Empty State

```xml
<!-- Show message when no data -->
<Grid>
    <TextBlock Text="No active translations"
               HorizontalAlignment="Center"
               VerticalAlignment="Center"
               Foreground="Gray"
               FontSize="16"
               IsVisible="{Binding ActiveJobs.Count, Converter={StaticResource CountToVisibilityConverter}}" />

    <ItemsControl ItemsSource="{Binding ActiveJobs}"
                  IsVisible="{Binding ActiveJobs.Count}" />
</Grid>
```

### Search/Filter

```csharp
public class LogsViewModel : ViewModelBase
{
    private string _searchText = "";
    private ObservableCollection<LogEntryViewModel> _filteredLogs = new();

    public string SearchText
    {
        get => _searchText;
        set
        {
            if (SetProperty(ref _searchText, value))
            {
                FilterLogs();
            }
        }
    }

    public ObservableCollection<LogEntryViewModel> FilteredLogs
    {
        get => _filteredLogs;
        set => SetProperty(ref _filteredLogs, value);
    }

    private void FilterLogs()
    {
        var filtered = string.IsNullOrWhiteSpace(SearchText)
            ? _allLogs
            : _allLogs.Where(log => log.Message.Contains(SearchText, StringComparison.OrdinalIgnoreCase));

        FilteredLogs = new ObservableCollection<LogEntryViewModel>(filtered);
    }
}
```

---

## Best Practices

### 1. Never Use Code-Behind

```csharp
// ❌ BAD: Logic in code-behind
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        StartButton.Click += OnStartClicked;
    }

    private void OnStartClicked(object sender, RoutedEventArgs e)
    {
        // Business logic here
    }
}

// ✅ GOOD: Logic in ViewModel
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        // DataContext set via DI
    }
}

public class MainViewModel : ViewModelBase
{
    public ICommand StartCommand { get; }

    public MainViewModel()
    {
        StartCommand = ReactiveCommand.Create(OnStart);
    }

    private void OnStart()
    {
        // Business logic here
    }
}
```

### 2. Use ObservableCollection for Dynamic Lists

```csharp
// ✅ GOOD: UI updates automatically
public ObservableCollection<TranslationJobViewModel> ActiveJobs { get; } = new();

public void AddJob(TranslationJobViewModel job)
{
    ActiveJobs.Add(job); // UI updates automatically
}

// ❌ BAD: UI doesn't update
public List<TranslationJobViewModel> ActiveJobs { get; set; } = new();

public void AddJob(TranslationJobViewModel job)
{
    ActiveJobs.Add(job); // UI doesn't update
    OnPropertyChanged(nameof(ActiveJobs)); // Need manual notification
}
```

### 3. Async Operations with CancellationToken

```csharp
public class MainViewModel : ViewModelBase
{
    private CancellationTokenSource? _cts;

    public ICommand LoadDataCommand { get; }
    public ICommand CancelCommand { get; }

    public MainViewModel()
    {
        LoadDataCommand = ReactiveCommand.CreateFromTask(LoadDataAsync);
        CancelCommand = ReactiveCommand.Create(Cancel);
    }

    private async Task LoadDataAsync()
    {
        _cts = new CancellationTokenSource();

        try
        {
            var data = await _service.LoadDataAsync(_cts.Token);
            // Update UI
        }
        catch (OperationCanceledException)
        {
            // User cancelled
        }
        finally
        {
            _cts?.Dispose();
            _cts = null;
        }
    }

    private void Cancel()
    {
        _cts?.Cancel();
    }
}
```

---

**Remember:** Clean UI = Happy users. Follow MVVM strictly, keep Views simple, and let ViewModels handle the logic.
