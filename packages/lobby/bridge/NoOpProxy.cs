using System.Reflection;

namespace Bannerlord.LobbyBridge;

/// <summary>
/// Implements any game callback interface at runtime, so the tool does not break when TaleWorlds adds members to it.
/// Every call is logged and answered with a neutral value
/// </summary>
public class NoOpProxy : DispatchProxy
{
    internal static Action<string>? Log { get; set; }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod is null)
            return null;

        var details = args is { Length: > 0 }
            ? string.Join(", ", args.Select(a => a?.ToString() ?? "null"))
            : string.Empty;
        Log?.Invoke($"{targetMethod.Name}({details})");

        return DefaultFor(targetMethod.ReturnType);
    }

    private static object? DefaultFor(Type type)
    {
        if (type == typeof(void))
            return null;
        if (type == typeof(Task))
            return Task.CompletedTask;
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Task<>))
        {
            var resultType = type.GetGenericArguments()[0];
            var fromResult = typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(resultType);
            return fromResult.Invoke(null, [DefaultFor(resultType)]);
        }
        return type.IsValueType ? Activator.CreateInstance(type) : null;
    }

    public static object Create(Type interfaceType) => Create(interfaceType, typeof(NoOpProxy));
}
