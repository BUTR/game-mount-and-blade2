import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER_PORT,
  formatServerAddress,
  getServerId,
  parseServerAddress,
  sanitizeServerText,
  truncateServerText,
} from "./address";

describe("parseServerAddress", () => {
  it("uses the default port for a bare host", () => {
    expect(parseServerAddress("play.example.com")).toEqual({
      address: "play.example.com",
      port: DEFAULT_SERVER_PORT,
    });
  });

  it("reads host:port", () => {
    expect(parseServerAddress("192.168.1.10:7211")).toEqual({
      address: "192.168.1.10",
      port: 7211,
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseServerAddress("  10.0.0.1:7300 \n")).toEqual({
      address: "10.0.0.1",
      port: 7300,
    });
  });

  it("reads bracketed IPv6 with and without a port", () => {
    expect(parseServerAddress("[2001:db8::1]:7300")).toEqual({
      address: "2001:db8::1",
      port: 7300,
    });
    expect(parseServerAddress("[::1]")).toEqual({
      address: "::1",
      port: DEFAULT_SERVER_PORT,
    });
    expect(parseServerAddress("[::ffff:10.0.0.1]:1")).toEqual({
      address: "::ffff:10.0.0.1",
      port: 1,
    });
  });

  it("accepts the edges of the port range", () => {
    expect(parseServerAddress("host:1")?.port).toBe(1);
    expect(parseServerAddress("host:65535")?.port).toBe(65535);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["unbracketed IPv6", "2001:db8::1"],
    ["port zero", "host:0"],
    ["port above range", "host:65536"],
    ["non-numeric port", "host:http"],
    ["signed port", "host:+7210"],
    ["empty port", "host:"],
    ["empty bracketed port", "[::1]:"],
    ["space in host", "my host:7210"],
    ["scheme", "http://host:7210"],
    ["path", "host/maps:7210"],
    ["non-IPv6 in brackets", "[host.example]:7210"],
    ["text after brackets", "[::1]x"],
    ["empty brackets", "[]:7210"],
  ])("rejects %s", (_, input) => {
    expect(parseServerAddress(input)).toBeNull();
  });
});

describe("formatServerAddress", () => {
  it("joins host and port", () => {
    expect(formatServerAddress({ address: "1.2.3.4", port: 7210 })).toBe(
      "1.2.3.4:7210",
    );
  });

  it("brackets IPv6 so it parses back to the same address", () => {
    const server = { address: "2001:db8::1", port: 7300 };
    const formatted = formatServerAddress(server);

    expect(formatted).toBe("[2001:db8::1]:7300");
    expect(parseServerAddress(formatted)).toEqual(server);
  });
});

describe("getServerId", () => {
  it("is case-insensitive so the same server added twice gets one id", () => {
    expect(getServerId({ address: "Play.Example.COM", port: 7210 })).toBe(
      getServerId({ address: "play.example.com", port: 7210 }),
    );
    expect(getServerId({ address: "2001:DB8::A", port: 1 })).toBe(
      "[2001:db8::a]:1",
    );
  });

  it("tells servers on different ports apart", () => {
    expect(getServerId({ address: "host", port: 7210 })).not.toBe(
      getServerId({ address: "host", port: 7211 }),
    );
  });
});

describe("sanitizeServerText", () => {
  it("turns control characters into spaces and trims", () => {
    expect(sanitizeServerText("\t My\u0000Server\u001b[31m \r\n")).toBe(
      "My Server [31m",
    );
  });

  it("keeps ordinary text untouched", () => {
    expect(sanitizeServerText("Server – EU #1")).toBe("Server – EU #1");
  });
});

describe("truncateServerText", () => {
  it("keeps text within the limit", () => {
    expect(truncateServerText("abc", 3)).toBe("abc");
    expect(truncateServerText("ab😀", 4)).toBe("ab😀");
  });

  it("cuts text over the limit", () => {
    expect(truncateServerText("abcdef", 3)).toBe("abc");
  });

  it("drops an emoji the cut would split in half", () => {
    expect(truncateServerText("ab😀cd", 3)).toBe("ab");
    expect(truncateServerText("ab😀cd", 4)).toBe("ab😀");
  });
});
