import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("تعريف Web Share Target", () => {
  it("يحتوي manifest على نطاق التطبيق ومعلمات مشاركة الرابط والعنوان والنص", () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "client/public/manifest.webmanifest"), "utf8")) as {
      id?: string;
      scope?: string;
      share_target?: { action?: string; method?: string; params?: Record<string, string> };
    };
    expect(manifest.id).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.share_target).toMatchObject({
      action: "./?share=1",
      method: "GET",
      params: { title: "share_title", text: "share_text", url: "share_url" },
    });
  });
});
