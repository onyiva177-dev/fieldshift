export class NasaError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "NasaError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a timeout and polite retries for rate limits (429), server errors and network failures. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retries = 3
): Promise<Response> {
  const { timeoutMs = 40000, ...rest } = init;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt;
        lastError = new NasaError(`NASA service answered ${res.status}`, res.status);
        if (attempt < retries) {
          await sleep(Math.min(wait, 8000));
          continue;
        }
        throw lastError;
      }
      return res;
    } catch (err) {
      if (err instanceof NasaError) throw err;
      lastError = new NasaError(err instanceof Error && err.name === "AbortError" ? "NASA service timed out" : "Could not reach the NASA service");
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new NasaError("NASA request failed");
}
