import { describe, expect, it } from "vitest";
import { isPasswordRecoveryRoute } from "./recoveryRoute";

describe("مسار استرداد Supabase", () => {
  it("يفتح صفحة التعيين عند وجود معلمة التطبيق", () => {
    expect(isPasswordRecoveryRoute("?reset-password=1", "")).toBe(true);
  });

  it("يفتح صفحة التعيين حتى إذا عاد Supabase بالرموز فقط", () => {
    expect(isPasswordRecoveryRoute("", "#access_token=test&type=recovery&refresh_token=refresh")).toBe(true);
  });

  it("لا يعامل الصفحة العادية كرابط استرداد", () => {
    expect(isPasswordRecoveryRoute("", "")).toBe(false);
  });
});
