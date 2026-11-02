// Polite HTTP for public job APIs: identify ourselves, time out, retry once.
// Only search terms ever go out in these requests, never personal data.

const USER_AGENT = "Mozilla/5.0 (compatible; pathfinder-job-search/0.1; +https://github.com/GabrielShaad/pathfinder)";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

async function request(url: string, timeoutMs = 20_000): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json, application/rss+xml, text/html;q=0.9, */*;q=0.8" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 && attempt === 0) {
        await sleep(3_000);
        continue;
      }
      if (response.status >= 500 && attempt === 0) throw new HttpError(response.status, url);
      if (!response.ok) throw new HttpError(response.status, url);
      return response;
    } catch (error) {
      // A host that does not resolve (an unknown Recruitee subdomain) will not resolve a second later.
      const dns = (error as { cause?: { code?: string } }).cause?.code === "ENOTFOUND";
      const retryable = !dns && (!(error instanceof HttpError) || error.status >= 500);
      if (attempt > 0 || !retryable) throw error;
      await sleep(1_000);
    }
  }
}

export const getJson = async <T = unknown>(url: string): Promise<T> => (await request(url)).json() as Promise<T>;
export const getText = async (url: string): Promise<string> => (await request(url)).text();
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs tasks with at most `limit` in flight, keeping input order in the result.
export async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
