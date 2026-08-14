import { describe, expect, it } from "vitest";

describe("Supabase public configuration", () => {
  it("accepts the configured publishable key at the Auth health endpoint", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    expect(url).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i);
    expect(key?.length).toBeGreaterThan(20);
    const response = await fetch(`${url!.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: key! } });
    expect(response.status).toBe(200);
  }, 20_000);
});
