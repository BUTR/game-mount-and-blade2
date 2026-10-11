using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Loader;

namespace Bannerlord.LobbyBridge;

/// <summary>
/// Loads the game's own managed assemblies from its installation, so the tool works with whatever game version is installed
/// </summary>
internal sealed class GameAssemblies
{
    public string GamePath { get; }
    public string BinPath { get; }

    public GameAssemblies(string gamePath)
    {
        GamePath = Path.GetFullPath(gamePath);
        BinPath = Path.Combine(GamePath, "bin", "Win64_Shipping_Client");
        if (!File.Exists(Path.Combine(BinPath, "TaleWorlds.Library.dll")))
            throw new BridgeException($"'{GamePath}' is not a Bannerlord installation, '{BinPath}' has no TaleWorlds.Library.dll");

        AssemblyLoadContext.Default.Resolving += (_, name) =>
        {
            var candidate = Path.Combine(BinPath, $"{name.Name}.dll");
            return File.Exists(candidate) ? AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate) : null;
        };
    }

    private readonly HashSet<Assembly> _withNativeResolver = [];

    public Assembly Load(string name)
    {
        var assembly = AssemblyLoadContext.Default.LoadFromAssemblyName(new AssemblyName(name));
        // Steamworks.NET and GalaxyCSharp P/Invoke into native libraries that live next to them
        if (_withNativeResolver.Add(assembly))
            NativeLibrary.SetDllImportResolver(assembly, ResolveNative);
        return assembly;
    }

    public void LoadNative(string fileName)
    {
        var candidate = Path.Combine(BinPath, fileName);
        if (!NativeLibrary.TryLoad(candidate, out _))
            throw new BridgeException($"Could not load '{candidate}'");
    }

    public Type GetType(string assemblyName, string typeName) =>
        Load(assemblyName).GetType(typeName, throwOnError: true)!;

    private IntPtr ResolveNative(string libraryName, Assembly assembly, DllImportSearchPath? searchPath)
    {
        var fileName = libraryName.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) ? libraryName : $"{libraryName}.dll";
        var candidate = Path.Combine(BinPath, fileName);
        return File.Exists(candidate) && NativeLibrary.TryLoad(candidate, out var handle) ? handle : IntPtr.Zero;
    }
}
