// Fetch a representative photo for a place/city from Wikipedia (free, no key).
// Used to give destination + place cards real imagery. Server-only; in-memory cached.

const cache = new Map<string, string | null>();

export async function wikiImage(name: string): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`,
      { headers: { "User-Agent": "TasteTrail/1.0 (hackathon demo)" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const json = await res.json();
    const url: string | null = json?.thumbnail?.source ?? null;
    cache.set(key, url);
    return url;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** Attach an `image` (or null) to each item by its `name`, all in parallel. */
export async function enrichWithImages<T extends { name: string }>(
  items: T[],
): Promise<(T & { image: string | null })[]> {
  return Promise.all(items.map(async (it) => ({ ...it, image: await wikiImage(it.name) })));
}
