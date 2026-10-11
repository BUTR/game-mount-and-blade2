namespace Bannerlord.LobbyBridge;

/// <summary>
/// An expected failure that is reported to the caller as a message instead of a stack trace
/// </summary>
internal sealed class BridgeException(string message) : Exception(message);
