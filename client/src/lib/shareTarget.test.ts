import { describe, expect, it } from "vitest";
import { readSharedLink } from "./shareTarget";

describe("readSharedLink", () => {
  it("accepts URL and title from an installed PWA share target", () => {
    expect(readSharedLink("?share_url=https%3A%2F%2Fexample.com%2Farticle&share_title=Article")).toEqual({ url: "https://example.com/article", title: "Article" });
  });

  it("falls back to a URL embedded in shared text", () => {
    expect(readSharedLink("?share_text=Read%20https%3A%2F%2Fexample.com%2Fstory%20later")).toEqual({ url: "https://example.com/story", title: "" });
  });

  it("rejects missing and non-HTTP shared values", () => {
    expect(readSharedLink("?share_url=javascript%3Aalert%281%29")).toBeNull();
    expect(readSharedLink("?share=1")).toBeNull();
  });
});
