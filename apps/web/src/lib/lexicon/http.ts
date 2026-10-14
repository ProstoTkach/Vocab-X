import type { AbortSignalLike } from '@vocabx/core';

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** GET JSON with a timeout; any failure (network, status, parse, abort) resolves to null. */
export async function getJson(
  fetchFn: FetchLike,
  url: string,
  timeoutMs: number,
  signal?: AbortSignalLike,
): Promise<unknown> {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal as AbortSignal);
  try {
    const res = await fetchFn(url, { signal: AbortSignal.any(signals) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Removes markup from dictionary HTML snippets and decodes the few entities they use. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x?[0-9a-f]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
