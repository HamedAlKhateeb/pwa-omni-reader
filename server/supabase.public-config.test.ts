import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const describeWhenConfigured = supabaseUrl && anonKey ? describe : describe.skip;

describeWhenConfigured("Supabase public configuration", () => {
  it("accepts the configured public key at the authentication settings endpoint", async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(500);
  });
});
