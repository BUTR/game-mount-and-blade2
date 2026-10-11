using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Bannerlord.LobbyBridge;

// Usage: Bannerlord.LobbyBridge servers --game <install path> [--platform steam|gog]
//        Bannerlord.LobbyBridge ping --targets <host:port>[,<host:port>...]
// Writes one JSON document to stdout. Diagnostics go to stderr.

static void Log(string message) => Console.Error.WriteLine($"[lobby-bridge] {message}");

static void WriteResult(JsonObject result) =>
    Console.Out.WriteLine(result.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));

static string? GetOption(string[] args, string name)
{
    var index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}

// The game shows the ping to each custom server as an ICMP echo to its address, -1 shown as "-" when there is no
// reply (LobbyClient.GetPingToServer, MPCustomGameItemVM.UpdatePingText). It waits 15s, a list answers in 5s.
// Hosts that drop ICMP are timed with a TCP connection to the server's port instead, where its web host listens:
// the handshake is one round trip as well. A refused connection isn't timed, Windows retries it before giving up.
// Hosts that answer neither, like the official servers, get an estimate: the round trip to the last router on the
// way that answers, when it is in the server's own network (the same /16).
// The three run in overlapping stages against one deadline: TCP only for hosts that haven't answered ICMP by
// PingTcpAfterMs, the route only for hosts that answered neither by PingRouteAfterMs. Routes are traced a few hosts
// at a time, routers drop answers when too many probes arrive at once
const int PingBudgetMs = 4200; // the whole command, process start included, stays under 5s
const int PingTcpAfterMs = 800; // ICMP answers come in well under this, the slowest seen was about 360 ms
const int PingRouteAfterMs = 1500;
const int RouteMaxHops = 30;
const int RouteHopTimeoutMs = 1000;
const int RouteConcurrency = 3; // more at once and routers start dropping answers
const int MaxPingTargets = 1024;
const int IcmpSamples = 3;
const int IcmpEchoTimeoutMs = 1000; // slower than this counts as no answer, TCP has been tried by then
const int TcpSamples = 2;
const int RouteTimings = 2;

// host:port, [IPv6]:port
static (string Host, int Port)? ParseTarget(string target)
{
    var colon = target.LastIndexOf(':');
    if (colon <= 0 || !int.TryParse(target[(colon + 1)..], out var port) || port is < 1 or > 65535)
        return null;
    var host = target[..colon].Trim('[', ']');
    return host.Length > 0 ? (host, port) : null;
}

// Addresses nothing answers on, e.g. 0.0.0.1 a server listed by mistake
static bool IsPingable(string host) =>
    !IPAddress.TryParse(host, out var address) ||
    address.AddressFamily != AddressFamily.InterNetwork ||
    address.GetAddressBytes()[0] is not (0 or >= 224);

// Several samples, the fastest counts: it is the one least delayed by queues and scheduling, the closest to the
// network's round trip. The first answer is reported right away, so the later stages know the host answered
static async Task<long?> IcmpPingAsync(string host, Func<int> leftMs, Action onAnswer)
{
    long? best = null;
    for (var i = 0; i < IcmpSamples; i++)
    {
        var timeoutMs = Math.Min(IcmpEchoTimeoutMs, leftMs());
        if (timeoutMs <= 0)
            break;
        try
        {
            using var ping = new Ping();
            // Timed by Windows itself, the process's own scheduling doesn't enter into it
            var reply = await ping.SendPingAsync(host, timeoutMs);
            if (reply.Status != IPStatus.Success)
                break;
            best = Math.Min(best ?? long.MaxValue, reply.RoundtripTime);
            onAnswer();
        }
        catch (Exception e) when (e is PingException or ArgumentException or InvalidOperationException)
        {
            break;
        }
    }
    return best;
}

static async Task<long?> TcpPingAsync(string host, int port, Func<int> leftMs, Action onAnswer)
{
    // The name is resolved first, so only the handshake is timed
    IPAddress address;
    try
    {
        using var resolve = new CancellationTokenSource(Math.Max(1, leftMs()));
        var addresses = IPAddress.TryParse(host, out var parsed) ? [parsed] : await Dns.GetHostAddressesAsync(host, resolve.Token);
        if (addresses.Length == 0)
            return null;
        address = addresses[0];
    }
    catch (Exception e) when (e is SocketException or OperationCanceledException or ArgumentException)
    {
        return null;
    }

    long? best = null;
    for (var i = 0; i < TcpSamples; i++)
    {
        var timeoutMs = leftMs();
        if (timeoutMs <= 0)
            break;
        using var client = new TcpClient();
        using var timeout = new CancellationTokenSource(timeoutMs);
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await client.ConnectAsync(address, port, timeout.Token);
            best = Math.Min(best ?? long.MaxValue, stopwatch.ElapsedMilliseconds);
            onAnswer();
        }
        catch (Exception e) when (e is SocketException or OperationCanceledException)
        {
            break;
        }
    }
    return best;
}

// Finds the last router that answers with one probe per hop, all at once. Windows reports no time for a router's
// answer, so each probe has its own stopwatch. With ~30 probes in flight those times run a little high, so the router
// found is then timed again on its own, the fastest of all of them counts
static async Task<(long Ms, string Via)?> RoutePingAsync(string host, Func<int> leftMs)
{
    var discoveryTimeoutMs = Math.Min(RouteHopTimeoutMs, leftMs());
    if (discoveryTimeoutMs < RouteHopTimeoutMs / 2 || !IPAddress.TryParse(host, out var target) || target.AddressFamily != AddressFamily.InterNetwork)
        return null;
    var buffer = new byte[32];
    var hops = await Task.WhenAll(Enumerable.Range(1, RouteMaxHops).Select(async ttl =>
    {
        try
        {
            using var ping = new Ping();
            var stopwatch = Stopwatch.StartNew();
            var reply = await ping.SendPingAsync(target, discoveryTimeoutMs, buffer, new PingOptions(ttl, true));
            return (Ttl: ttl, reply.Status, reply.Address, Ms: stopwatch.ElapsedMilliseconds);
        }
        catch (Exception e) when (e is PingException or InvalidOperationException)
        {
            return (Ttl: ttl, Status: IPStatus.Unknown, Address: (IPAddress?)null, Ms: 0L);
        }
    }));
    var last = hops
        .Where(hop => hop.Status == IPStatus.TtlExpired && hop.Address is not null)
        .OrderBy(hop => hop.Ttl)
        .LastOrDefault();
    if (last.Address is null)
        return null;
    var targetBytes = target.GetAddressBytes();
    var routerBytes = last.Address.GetAddressBytes();
    if (routerBytes.Length != 4 || routerBytes[0] != targetBytes[0] || routerBytes[1] != targetBytes[1])
        return null;

    var best = last.Ms;
    for (var i = 0; i < RouteTimings; i++)
    {
        var timeoutMs = Math.Min(RouteHopTimeoutMs, leftMs());
        if (timeoutMs <= 0)
            break;
        try
        {
            using var ping = new Ping();
            var stopwatch = Stopwatch.StartNew();
            var reply = await ping.SendPingAsync(target, timeoutMs, buffer, new PingOptions(last.Ttl, true));
            if (reply.Status == IPStatus.TtlExpired && reply.Address?.Equals(last.Address) == true)
                best = Math.Min(best, stopwatch.ElapsedMilliseconds);
        }
        catch (Exception e) when (e is PingException or InvalidOperationException)
        {
            break;
        }
    }
    return (best, last.Address.ToString());
}

static async Task<int> PingTargetsAsync(string[] args)
{
    var clock = Stopwatch.StartNew();
    int LeftMs() => Math.Max(0, PingBudgetMs - (int)clock.ElapsedMilliseconds);
    async Task WaitUntilAsync(int atMs)
    {
        var wait = atMs - (int)clock.ElapsedMilliseconds;
        if (wait > 0)
            await Task.Delay(wait);
    }

    var requested = (GetOption(args, "--targets") ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(MaxPingTargets)
        .ToArray();
    var targets = requested
        .Select(target => (Target: target, Parsed: ParseTarget(target)))
        .Where(t => t.Parsed is { } parsed && IsPingable(parsed.Host))
        .Select(t => (t.Target, t.Parsed!.Value.Host, t.Parsed!.Value.Port))
        .ToArray();
    var hosts = targets.Select(t => t.Host).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    // Hosts that answered at least once, set as the answers come in while more samples are still being taken
    var answered = new ConcurrentDictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

    // Once per host, several servers can share one
    var icmp = hosts.ToDictionary(host => host, host => IcmpPingAsync(host, LeftMs, () => answered[host] = true), StringComparer.OrdinalIgnoreCase);

    await WaitUntilAsync(PingTcpAfterMs);
    var tcp = targets
        .Where(t => !answered.ContainsKey(t.Host))
        .ToDictionary(t => t.Target, t => TcpPingAsync(t.Host, t.Port, LeftMs, () => answered[t.Host] = true), StringComparer.OrdinalIgnoreCase);

    await WaitUntilAsync(PingRouteAfterMs);
    using var routeLimiter = new SemaphoreSlim(RouteConcurrency);
    async Task<(long Ms, string Via)?> LimitedRouteAsync(string host)
    {
        await routeLimiter.WaitAsync();
        try
        {
            return await RoutePingAsync(host, LeftMs);
        }
        finally
        {
            routeLimiter.Release();
        }
    }
    var route = hosts
        .Where(host => !answered.ContainsKey(host))
        .ToDictionary(host => host, LimitedRouteAsync, StringComparer.OrdinalIgnoreCase);

    // Everything above stops at the deadline on its own
    await Task.WhenAll(icmp.Values.Cast<Task>().Concat(tcp.Values).Concat(route.Values));

    var pings = new JsonObject();
    foreach (var target in requested)
        pings[target] = null;
    foreach (var (target, host, _) in targets)
    {
        if (icmp[host].Result is { } icmpMs)
            pings[target] = new JsonObject { ["ms"] = icmpMs, ["method"] = "icmp", ["via"] = null };
        else if (tcp.TryGetValue(target, out var tcpTask) && tcpTask.Result is { } tcpMs)
            pings[target] = new JsonObject { ["ms"] = tcpMs, ["method"] = "tcp", ["via"] = null };
        else if (route.TryGetValue(host, out var routeTask) && routeTask.Result is { } estimate)
            pings[target] = new JsonObject { ["ms"] = estimate.Ms, ["method"] = "route", ["via"] = estimate.Via };
    }
    WriteResult(new JsonObject { ["ok"] = true, ["pings"] = pings });
    return 0;
}

if (args.Length > 0 && args[0] == "ping")
    return await PingTargetsAsync(args);

if (args.Length == 0 || args[0] != "servers")
{
    Console.Error.WriteLine("Usage: Bannerlord.LobbyBridge servers --game <install path> [--platform steam|gog]");
    Console.Error.WriteLine("       Bannerlord.LobbyBridge ping --targets <host:port>[,<host:port>...]");
    return 2;
}

var gamePath = GetOption(args, "--game");
var platform = GetOption(args, "--platform") ?? "steam";
if (gamePath is null)
{
    Console.Error.WriteLine("--game is required");
    return 2;
}

// The bridge signs in to the lobby with the player's account. While the game is running it may be in the lobby with
// that account itself, and a second sign-in could end the game's session. The game runs as Bannerlord.exe,
// Bannerlord.Native.exe or inside a BLSE launcher, all named Bannerlord*
static string? FindRunningGame()
{
    var self = Environment.ProcessId;
    foreach (var process in Process.GetProcesses())
    {
        using (process)
        {
            try
            {
                if (process.Id != self &&
                    process.ProcessName.StartsWith("Bannerlord", StringComparison.OrdinalIgnoreCase))
                    return process.ProcessName;
            }
            catch (InvalidOperationException)
            {
                // exited while listed
            }
        }
    }
    return null;
}

LobbySession? session = null;
try
{
    if (FindRunningGame() is { } running)
        throw new BridgeException($"Bannerlord is running ({running}). Close the game first, checking the lobby signs in with your account and could end the game's lobby session");

    var gamePlatform = platform switch
    {
        "steam" => "WindowsSteam",
        "gog" => "WindowsGOG",
        // Epic: TaleWorlds.MountAndBlade.Launcher.Epic logs in to EOS with the single use exchange code the Epic Games
        // Launcher passes as -AUTH_PASSWORD when it starts the game, and hands the game the in-process EOS platform.
        // There is no exchange code outside a launcher started game, so there is nothing to log in with
        "epic" => throw new BridgeException("The Epic version signs in with a one-time code the Epic Games Launcher passes to the game, it can't be done outside the game"),
        _ => throw new BridgeException($"Platform '{platform}' is not supported"),
    };

    var game = new GameAssemblies(gamePath);
    session = new LobbySession(game, Log);
    session.Initialize(gamePlatform);

    if (platform == "steam")
        session.ConnectSteam();
    else
        session.ConnectGog();

    var servers = session.GetCustomGameServerList();
    Log($"received {LobbySession.CountServers(servers)} servers");

    WriteResult(new JsonObject
    {
        ["ok"] = true,
        ["platform"] = platform,
        ["applicationVersion"] = session.ApplicationVersion,
        ["availableCustomGames"] = JsonNode.Parse(session.SerializeWithGameJson(servers)),
    });
    return 0;
}
catch (Exception e)
{
    var error = e is TargetInvocationException { InnerException: { } inner } ? inner : e;
    error = error is AggregateException aggregate ? aggregate.GetBaseException() : error;
    Log(error.ToString());
    WriteResult(new JsonObject
    {
        ["ok"] = false,
        ["platform"] = platform,
        ["error"] = error is BridgeException ? error.Message : $"{error.GetType().Name}: {error.Message}",
    });
    return 1;
}
finally
{
    session?.Dispose();
}
