import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const describeWhenConfigured = supabaseUrl && anonKey ? describe : describe.skip;

describeWhenConfigured("Supabase user_data anonymous access", () => {
  it("does not expose any synchronization record to the anonymous public key", async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/user_data?select=user_id,data_key&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual([]);
  });
});
