import "server-only";

// Interchangeable AI service. Set AI_PROVIDER to "anthropic" (default) or "openai" (any OpenAI-compatible API).
//   AI_API_KEY   required
//   AI_MODEL     model name (default depends on provider)
//   AI_BASE_URL  optional, for OpenAI-compatible servers
export const aiConfigured = () => !!process.env.AI_API_KEY;

export interface AiResult { text: string; model: string }

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`The AI service answered ${res.status}.`);
    return await res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("The AI service timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function aiComplete(system: string, user: string): Promise<AiResult> {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY is not set.");
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();

  if (provider === "anthropic") {
    const model = process.env.AI_MODEL ?? "claude-haiku-5-5";
    const json = await post("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model, max_tokens: 700, temperature: 0.2, system, messages: [{ role: "user", content: user }] });
    const text = Array.isArray(json?.content) ? json.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : "";
    if (!text) throw new Error("The AI service returned no text.");
    return { text, model };
  }

  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const base = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const json = await post(`${base}/chat/completions`, { Authorization: `Bearer ${key}` },
    { model, temperature: 0.2, max_tokens: 700, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("The AI service returned no text.");
  return { text, model };
}
