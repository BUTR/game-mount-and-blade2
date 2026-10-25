using System.Collections;
using System.Reflection;

namespace Bannerlord.LobbyBridge;

/// <summary>
/// Drives the game's own LobbyClient the way TaleWorlds.MountAndBlade.Multiplayer.MultiplayerMain does,
/// without the engine. Everything is resolved by reflection from the installed game
/// </summary>
internal sealed class LobbySession : IDisposable
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(45);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan LogoutTimeout = TimeSpan.FromSeconds(5);

    private readonly GameAssemblies _game;
    private readonly Action<string> _log;
    private readonly PumpContext _pump;

    private object? _application;
    private object? _lobbyClient;
    private MethodInfo? _clientUpdate;
    private Type? _steamApi;
    // Called every tick, looked up once
    private MethodInfo? _steamRunCallbacks;
    private bool _steamInitialized;
    private object? _gogPlatformServices;
    private Type? _gogPlatformServicesInterface;
    private MethodInfo? _galaxyProcessData;

    public string? ApplicationVersion { get; private set; }

    public LobbySession(GameAssemblies game, Action<string> log)
    {
        _game = game;
        _log = log;
        _pump = new PumpContext(Tick);
        NoOpProxy.Log = message => _log($"lobby callback: {message}");
    }

    /// <param name="platform">The TaleWorlds.Library.Platform the game would run as, e.g. WindowsSteam or WindowsGOG</param>
    public void Initialize(string platform)
    {
        if (platform == "WindowsSteam")
        {
            // The Steam API looks for the app id in the environment or in steam_appid.txt next to the process
            var appIdFile = Path.Combine(_game.BinPath, "steam_appid.txt");
            var appId = File.Exists(appIdFile) ? File.ReadAllText(appIdFile).Trim() : "261550";
            Environment.SetEnvironmentVariable("SteamAppId", appId);
            Environment.SetEnvironmentVariable("SteamGameId", appId);
        }
        Environment.CurrentDirectory = _game.BinPath;

        var library = _game.Load("TaleWorlds.Library");
        _game.Load("TaleWorlds.Diamond");
        // Must be loaded before DiamondClientApplication scans the AppDomain for message types
        var mbDiamond = _game.Load("TaleWorlds.MountAndBlade.Diamond");

        InitializePlatform(library, platform);
        InitializeFileHelper(library);

        var version = LoadMultiplayerVersion();
        ApplicationVersion = version.ToString();
        _log($"application version: {ApplicationVersion}");

        _game.GetType("TaleWorlds.ServiceDiscovery.Client", "TaleWorlds.ServiceDiscovery.Client.ServiceAddressManager")
            .GetMethod("Initalize", BindingFlags.Public | BindingFlags.Static)!
            .Invoke(null, null);

        var configurationType = _game.GetType("TaleWorlds.Diamond", "TaleWorlds.Diamond.ClientApplication.ClientApplicationConfiguration");
        var configuration = Activator.CreateInstance(configurationType)!;
        configurationType.GetMethod("FillFrom", [typeof(string)])!.Invoke(configuration, ["LobbyClient"]);

        var applicationType = _game.GetType("TaleWorlds.Diamond", "TaleWorlds.Diamond.ClientApplication.DiamondClientApplication");
        _application = applicationType.GetConstructor([version.GetType()])!.Invoke([version]);
        applicationType.GetMethod("Initialize", [configurationType])!.Invoke(_application, [configuration]);

        var lobbyClientType = mbDiamond.GetType("TaleWorlds.MountAndBlade.Diamond.LobbyClient", throwOnError: true)!;
        _lobbyClient = applicationType.GetMethod("GetClient")!.MakeGenericMethod(lobbyClientType)
            .Invoke(_application, ["LobbyClient"])
            ?? throw new BridgeException("The game's client profile does not define a LobbyClient");
        // The session runs on a background thread, results are handed to the client when the game ticks it every frame
        _clientUpdate = lobbyClientType.GetMethod("Update", BindingFlags.Public | BindingFlags.Instance, Type.EmptyTypes)
            ?? throw new BridgeException("LobbyClient has no Update method");

        // A vanilla client: LobbyClient.Connect sends this list and expects it to be set by the game
        var modulesField = lobbyClientType.GetField("_loadedUnofficialModules", BindingFlags.NonPublic | BindingFlags.Instance);
        if (modulesField is not null && modulesField.GetValue(_lobbyClient) is null)
            modulesField.SetValue(_lobbyClient, Activator.CreateInstance(modulesField.FieldType));
    }

    public void ConnectSteam()
    {
        var accessProviderType = _game.GetType("TaleWorlds.Diamond.AccessProvider.Steam", "TaleWorlds.Diamond.AccessProvider.Steam.SteamLoginAccessProvider");
        _steamApi = _game.GetType("Steamworks.NET", "Steamworks.SteamAPI");
        _steamRunCallbacks = _steamApi.GetMethod("RunCallbacks", Type.EmptyTypes);
        var accessProvider = Activator.CreateInstance(accessProviderType)!;
        // SteamLoginAccessProvider.Initialize calls SteamAPI.Init, LobbyClient.Connect calls Initialize
        _steamInitialized = true;
        Connect(accessProvider);
    }

    /// <summary>
    /// Mirrors TaleWorlds.MountAndBlade.Module.LoadPlatformServices for WindowsGOG: the game's own GOGPlatformServices
    /// starts the Galaxy SDK with the game's credentials and signs in through the running GOG Galaxy client
    /// </summary>
    public void ConnectGog()
    {
        // GalaxyCSharpGlue links against Galaxy64, load it from the game first so the dependency resolves
        _game.LoadNative("Galaxy64.dll");

        var platformServicesAssembly = _game.Load("TaleWorlds.PlatformService.GOG");
        _gogPlatformServicesInterface = _game.GetType("TaleWorlds.PlatformService", "TaleWorlds.PlatformService.IPlatformServices");
        var platformServicesType = platformServicesAssembly.GetTypes()
            .FirstOrDefault(t => !t.IsAbstract && _gogPlatformServicesInterface.IsAssignableFrom(t))
            ?? throw new BridgeException("TaleWorlds.PlatformService.GOG has no IPlatformServices implementation");

        var initParamsType = _game.GetType("TaleWorlds.Library", "TaleWorlds.Library.PlatformInitParams");
        var initParams = (IDictionary<string, object>)Activator.CreateInstance(initParamsType)!;
        initParams["AchievementDataXmlPath"] = Path.Combine(_game.GamePath, "Modules", "Native", "ModuleData", "AchievementData", "gog_achievement_data.xml");
        _gogPlatformServices = platformServicesType.GetConstructor([initParamsType])!.Invoke([initParams]);

        var friendListServiceType = _game.GetType("TaleWorlds.PlatformService", "TaleWorlds.PlatformService.IFriendListService");
        var initialize = _gogPlatformServicesInterface.GetMethod("Initialize")!;
        var initialized = (bool)initialize.Invoke(_gogPlatformServices, [Array.CreateInstance(friendListServiceType, 0)])!;
        if (!initialized)
            throw new BridgeException("GOG Galaxy could not be initialized. Make sure GOG Galaxy is running and you are signed in");

        // Only pump Galaxy callbacks, IPlatformServices.Tick would also store stats and achievements
        _galaxyProcessData = _game.GetType("GalaxyCSharp", "Galaxy.Api.GalaxyInstance").GetMethod("ProcessData", Type.EmptyTypes);

        var accessProviderType = _game.GetType("TaleWorlds.Diamond.AccessProvider.GOG", "TaleWorlds.Diamond.AccessProvider.GOG.GOGLoginAccessProvider");
        Connect(Activator.CreateInstance(accessProviderType)!);
    }

    private void Connect(object accessProvider)
    {
        var lobbyClient = _lobbyClient ?? throw new InvalidOperationException("Not initialized");
        var lobbyClientType = lobbyClient.GetType();
        var handlerType = lobbyClientType.Assembly.GetType("TaleWorlds.MountAndBlade.Diamond.ILobbyClientSessionHandler", throwOnError: true)!;
        var handler = NoOpProxy.Create(handlerType);
        var initParams = Activator.CreateInstance(_game.GetType("TaleWorlds.Library", "TaleWorlds.Library.PlatformInitParams"))!;

        var connect = lobbyClientType.GetMethod("Connect", BindingFlags.Public | BindingFlags.Instance)!;
        var result = _pump.Run(
            () => AsObjectTask(connect.Invoke(lobbyClient, [handler, accessProvider, null, true, initParams, null])!),
            ConnectTimeout,
            "connecting to the lobby");

        var connected = (bool)result!.GetType().GetProperty("Connected")!.GetValue(result)!;
        if (!connected)
        {
            var error = result.GetType().GetProperty("Error")!.GetValue(result);
            throw new BridgeException($"The lobby refused the connection: {SafeToString(error)}");
        }
        _log($"connected, lobby state: {lobbyClientType.GetProperty("CurrentState")!.GetValue(lobbyClient)}");
    }

    /// <summary>
    /// Returns the raw AvailableCustomGames object from the lobby
    /// </summary>
    public object GetCustomGameServerList()
    {
        var lobbyClient = _lobbyClient ?? throw new InvalidOperationException("Not initialized");
        var method = lobbyClient.GetType().GetMethod("GetCustomGameServerList", Type.EmptyTypes)!;
        return _pump.Run(
            () => AsObjectTask(method.Invoke(lobbyClient, null)!),
            RequestTimeout,
            "requesting the custom server list")
            ?? throw new BridgeException("The lobby returned no custom server list");
    }

    /// <summary>
    /// Serializes a game object with the game's own Newtonsoft.Json, honoring its [JsonProperty] and converters
    /// </summary>
    public string SerializeWithGameJson(object value)
    {
        var jsonConvert = _game.GetType("Newtonsoft.Json", "Newtonsoft.Json.JsonConvert");
        var serialize = jsonConvert.GetMethod("SerializeObject", [typeof(object)])!;
        return (string)serialize.Invoke(null, [value])!;
    }

    public static int CountServers(object availableCustomGames) =>
        availableCustomGames.GetType().GetProperty("CustomGameServerInfos")!.GetValue(availableCustomGames) is ICollection list
            ? list.Count
            : 0;

    private static void InitializePlatform(Assembly library, string platform)
    {
        var platformType = library.GetType("TaleWorlds.Library.ApplicationPlatform", throwOnError: true)!;
        var engineType = library.GetType("TaleWorlds.Library.EngineType", throwOnError: true)!;
        var platformEnum = library.GetType("TaleWorlds.Library.Platform", throwOnError: true)!;
        var runtimeEnum = library.GetType("TaleWorlds.Library.Runtime", throwOnError: true)!;
        platformType.GetMethod("Initialize")!.Invoke(null,
        [
            Enum.Parse(engineType, "RGL"),
            Enum.Parse(platformEnum, platform),
            Enum.Parse(runtimeEnum, "DotNetCore"),
        ]);
    }

    /// <summary>
    /// The game reads player files such as the perma mute list through Common.PlatformFileHelper.
    /// The tool does not need them, so every file appears to be missing and nothing is read or written
    /// </summary>
    private static void InitializeFileHelper(Assembly library)
    {
        var helperInterface = library.GetType("TaleWorlds.Library.IPlatformFileHelper", throwOnError: true)!;
        var common = library.GetType("TaleWorlds.Library.Common", throwOnError: true)!;
        var helper = NoOpProxy.Create(helperInterface);

        var property = common.GetProperty("PlatformFileHelper", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        if (property?.SetMethod is not null)
        {
            property.SetValue(null, helper);
            return;
        }
        common.GetField("_fileHelper", BindingFlags.NonPublic | BindingFlags.Static)!.SetValue(null, helper);
    }

    private object LoadMultiplayerVersion()
    {
        var moduleInfoType = _game.GetType("TaleWorlds.ModuleManager", "TaleWorlds.ModuleManager.ModuleInfo");
        var moduleInfo = Activator.CreateInstance(moduleInfoType)!;
        var modulePath = Path.Combine(_game.GamePath, "Modules", "Multiplayer");
        if (!File.Exists(Path.Combine(modulePath, "SubModule.xml")))
            throw new BridgeException($"The Multiplayer module is missing at '{modulePath}'");
        moduleInfoType.GetMethod("LoadWithFullPath", [typeof(string)])!.Invoke(moduleInfo, [modulePath]);
        return moduleInfoType.GetProperty("Version")!.GetValue(moduleInfo)!;
    }

    private void Tick()
    {
        _clientUpdate?.Invoke(_lobbyClient, null);
        if (_steamInitialized)
            _steamRunCallbacks?.Invoke(null, null);
        _galaxyProcessData?.Invoke(null, null);
    }

    private static async Task<object?> AsObjectTask(object task)
    {
        await ((Task)task).ConfigureAwait(true);
        return task.GetType().GetProperty("Result")?.GetValue(task);
    }

    private static string SafeToString(object? value)
    {
        try
        {
            return value?.ToString() ?? "no reason given";
        }
        catch (Exception e)
        {
            return $"(could not render the reason: {e.GetType().Name})";
        }
    }

    public void Dispose()
    {
        if (_lobbyClient is not null)
        {
            try
            {
                var lobbyClientType = _lobbyClient.GetType();
                var state = lobbyClientType.GetProperty("CurrentState")!;
                if (state.GetValue(_lobbyClient)?.ToString() != "Idle")
                {
                    lobbyClientType.GetMethod("Logout")!.Invoke(_lobbyClient, [null]);
                    _pump.RunUntil(() => state.GetValue(_lobbyClient)?.ToString() == "Idle", LogoutTimeout);
                    _log($"logged out, lobby state: {state.GetValue(_lobbyClient)}");
                }
            }
            catch (Exception e)
            {
                _log($"logout failed: {e.GetBaseException().Message}");
            }
        }

        if (_steamInitialized)
        {
            try
            {
                _steamApi?.GetMethod("Shutdown", Type.EmptyTypes)?.Invoke(null, null);
            }
            catch (Exception e)
            {
                _log($"Steam shutdown failed: {e.GetBaseException().Message}");
            }
        }

        if (_gogPlatformServices is not null)
        {
            try
            {
                _galaxyProcessData = null;
                _gogPlatformServicesInterface?.GetMethod("Terminate")?.Invoke(_gogPlatformServices, null);
            }
            catch (Exception e)
            {
                _log($"GOG Galaxy shutdown failed: {e.GetBaseException().Message}");
            }
        }
    }
}
