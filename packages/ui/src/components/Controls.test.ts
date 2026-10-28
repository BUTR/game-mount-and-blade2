import { describe, expect, it } from "vitest";
import { hostOf } from "./Controls";

describe("hostOf", () => {
  it("is the host of a URL, with its port", () => {
    expect(hostOf("https://www.nexusmods.com/mountandblade2bannerlord")).toBe(
      "www.nexusmods.com",
    );
    expect(hostOf("http://localhost:8080/path?q=1")).toBe("localhost:8080");
  });

  it("is the text itself when it isn't a URL", () => {
    expect(hostOf("not a url")).toBe("not a url");
    expect(hostOf("")).toBe("");
  });
});
