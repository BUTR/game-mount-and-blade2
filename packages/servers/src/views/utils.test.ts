import { describe, expect, it } from "vitest";
import { createPendingResult } from "@bannerlord/server-query/query";
import { IServerQueryResult } from "@bannerlord/server-query/types";
import { IServerRow } from "../row";
import { getStatusText, pinServerRow } from "./utils";

const row = (id: string, overrides: Partial<IServerRow> = {}): IServerRow => ({
  id,
  address: "10.0.0.1",
  port: 7210,
  manual: null,
  lobby: null,
  probe: null,
  extension: null,
  pinned: false,
  favorite: false,
  ...overrides,
});

const NOTHING_KNOWN = { probe: null, extension: null, favorite: false };

describe("pinServerRow", () => {
  it("leaves the rows alone without an active server profile", () => {
    const rows = { a: row("a") };

    expect(pinServerRow(rows, undefined, NOTHING_KNOWN)).toBe(rows);
  });

  it("moves the profile's server to the top, pinned", () => {
    const rows = {
      "a:1": row("a:1"),
      "b:1": row("b:1", { favorite: true }),
      "c:1": row("c:1"),
    };

    const result = pinServerRow(rows, "b:1", NOTHING_KNOWN);

    expect(Object.keys(result)).toEqual(["b:1", "a:1", "c:1"]);
    expect(result["b:1"]).toEqual({ ...rows["b:1"], pinned: true });
    expect(rows["b:1"]?.pinned).toBe(false);
  });

  it("adds the profile's server from its id before any list has it", () => {
    const probe: IServerQueryResult = {
      ...createPendingResult(),
      state: "online",
    };

    const result = pinServerRow({ "a:1": row("a:1") }, "[2001:db8::1]:7300", {
      probe,
      extension: null,
      favorite: true,
    });

    expect(Object.keys(result)).toEqual(["[2001:db8::1]:7300", "a:1"]);
    expect(result["[2001:db8::1]:7300"]).toEqual({
      id: "[2001:db8::1]:7300",
      address: "2001:db8::1",
      port: 7300,
      manual: null,
      lobby: null,
      probe,
      extension: null,
      favorite: true,
      pinned: true,
    });
  });

  it("ignores a server id that isn't an address", () => {
    const rows = { "a:1": row("a:1") };

    expect(pinServerRow(rows, "not an address", NOTHING_KNOWN)).toBe(rows);
  });
});

describe("getStatusText", () => {
  it.each<[IServerQueryResult["state"], string]>([
    ["pending", "Checking..."],
    ["online", "Available"],
    ["unreachable", "Not published"],
    ["invalid", "Invalid response"],
  ])("describes %s as %s", (state, text) => {
    expect(
      getStatusText({ ...createPendingResult(), state }, (key) => `t(${key})`),
    ).toBe(`t(${text})`);
  });
});
