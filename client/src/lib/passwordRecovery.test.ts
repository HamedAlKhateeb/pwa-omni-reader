import { describe, expect, it } from "vitest";
import { buildPasswordRecoveryRedirectUrl } from "./supabaseSync";

describe("رابط استعادة كلمة المرور", () => {
  it("يوجه رسالة الاستعادة إلى صفحة تغيير كلمة المرور داخل تطبيق Pages", () => {
    expect(buildPasswordRecoveryRedirectUrl("https://hamedalkhateeb.github.io", "/pwa-omni-reader/")).toBe("https://hamedalkhateeb.github.io/pwa-omni-reader/?reset-password=1");
  });
});
