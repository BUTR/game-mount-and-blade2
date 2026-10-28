/**
 * How many calls are in flight at once: enough to overlap the waits, few enough that a hard disk serves the first
 * results first. The same as LauncherManager's ReadAhead
 */
export const READ_AHEAD = 16;

/**
 * Maps the items with an async function, at most `limit` calls in flight, the results in the items' order.
 * File IO waits on something, a disk seek or an IPC round trip: starting the next calls while earlier ones are in
 * flight overlaps those waits instead of adding them up. Bounded, unlike Promise.all: Node runs file operations on a
 * few threads and an IPC route takes requests one by one, a thousand at once would only queue.
 * Rejects with the first failure, and starts no call after it
 */
export const mapInOrderAsync = async <T, R>(
  items: readonly T[],
  map: (item: T, index: number) => Promise<R>,
  limit = READ_AHEAD,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const runAsync = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await map(items[index] as T, index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runAsync),
  );
  return results;
};
