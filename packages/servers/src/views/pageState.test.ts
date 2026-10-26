import { createElement, Dispatch, SetStateAction } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { requestedCollections, usePageState } from "./pageState";

let keys = 0;

/**
 * Renders a component reading the key once, as a page that mounts, and gives what it read and its setter.
 * Server rendering runs no effects, so only what the module keeps between mounts is observed
 */
const mount = <T>(
  key: string,
  initial: T | (() => T),
): { value: T; update: Dispatch<SetStateAction<T>> } => {
  let read: { value: T; update: Dispatch<SetStateAction<T>> } | undefined;
  const Page = (): null => {
    const [value, update] = usePageState<T>(key, initial);
    read = { value, update };
    return null;
  };
  renderToString(createElement(Page));
  if (read === undefined) {
    throw new Error("The page did not render");
  }
  return read;
};

const freshKey = (): string => `test-key-${++keys}`;

describe("usePageState", () => {
  it("starts from the initial value, computing a lazy one once", () => {
    const key = freshKey();
    let computed = 0;
    const initial = (): number => ++computed;

    expect(mount(key, initial).value).toBe(1);
    expect(mount(key, initial).value).toBe(1);
    expect(computed).toBe(1);
  });

  it("keeps the value across unmounts, so a page reopened after a profile switch continues", () => {
    const key = freshKey();

    mount(key, "idle").update("joining");

    expect(mount(key, "idle").value).toBe("joining");
  });

  it("applies updater functions to the value kept, not to what the page last rendered", () => {
    const key = freshKey();
    const { update } = mount(key, 1);

    update((previous) => previous + 1);
    update((previous) => previous * 10);

    expect(mount(key, 1).value).toBe(20);
  });

  it("keeps each key apart", () => {
    const a = freshKey();
    const b = freshKey();

    mount(a, "a").update("changed");

    expect(mount(b, "b").value).toBe("b");
  });
});

describe("requestedCollections", () => {
  it("is one set for the session", () => {
    requestedCollections.add("abcd1234");
    try {
      expect(requestedCollections.has("abcd1234")).toBe(true);
    } finally {
      requestedCollections.delete("abcd1234");
    }
  });
});
