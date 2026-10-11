using System.Collections.Concurrent;
using System.Diagnostics;

namespace Bannerlord.LobbyBridge;

/// <summary>
/// A single threaded synchronization context that mimics the game's main loop:
/// queued continuations run on one thread, and the Diamond client is ticked between them.
/// Like the game, it ticks once per frame and sleeps in between, so it never spins a core
/// </summary>
internal sealed class PumpContext : SynchronizationContext
{
    // The game ticks its clients once per frame, about 60 times a second
    private static readonly TimeSpan Frame = TimeSpan.FromMilliseconds(16);
    // A continuation that keeps queueing itself can't hold the loop past this, the rest waits for the next frame
    private const int MaxCallbacksPerFrame = 256;

    private readonly BlockingCollection<(SendOrPostCallback Callback, object? State)> _queue = new();
    private readonly Action _tick;

    public PumpContext(Action tick) => _tick = tick;

    public override void Post(SendOrPostCallback d, object? state) => _queue.Add((d, state));

    public override void Send(SendOrPostCallback d, object? state) => throw new NotSupportedException();

    public T Run<T>(Func<Task<T>> action, TimeSpan timeout, string what)
    {
        var previous = Current;
        SetSynchronizationContext(this);
        try
        {
            var task = action();
            var stopwatch = Stopwatch.StartNew();
            while (!task.IsCompleted)
            {
                if (stopwatch.Elapsed > timeout)
                    throw new BridgeException($"Timed out after {timeout.TotalSeconds:0}s while {what}");
                RunFrame(() => task.IsCompleted);
            }
            // Continuations of the finished task, bounded like a frame
            for (var i = 0; i < MaxCallbacksPerFrame && _queue.TryTake(out var item); i++)
                item.Callback(item.State);
            return task.GetAwaiter().GetResult();
        }
        finally
        {
            SetSynchronizationContext(previous);
        }
    }

    public void RunUntil(Func<bool> condition, TimeSpan timeout)
    {
        var previous = Current;
        SetSynchronizationContext(this);
        try
        {
            var stopwatch = Stopwatch.StartNew();
            while (!condition() && stopwatch.Elapsed < timeout)
                RunFrame(condition);
        }
        finally
        {
            SetSynchronizationContext(previous);
        }
    }

    /// <summary>
    /// One frame: ticks the client, then runs continuations as they arrive until the frame is over, sleeping while
    /// there are none. Returns early once done says so
    /// </summary>
    private void RunFrame(Func<bool> done)
    {
        var frame = Stopwatch.StartNew();
        _tick();
        var callbacks = 0;
        while (!done())
        {
            var left = Frame - frame.Elapsed;
            if (left <= TimeSpan.Zero)
                return;
            if (callbacks >= MaxCallbacksPerFrame)
            {
                Thread.Sleep(left);
                return;
            }
            if (!_queue.TryTake(out var item, left))
                return;
            item.Callback(item.State);
            callbacks++;
        }
    }
}
