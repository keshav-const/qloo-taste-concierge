import { Redis } from "@upstash/redis";

/**
 * Tiny serverless KV wrapper (Upstash Redis, what Vercel KV is built on).
 *
 * Reads credentials from either the Vercel-KV names (KV_REST_API_URL / KV_REST_API_TOKEN) or the
 * Upstash-marketplace names (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN), so it works no
 * matter how the integration was added. Returns null when unconfigured (e.g. local dev with no
 * KV) so callers can fall back gracefully instead of crashing.
 */
let _redis: Redis | null | undefined;

export function kv(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

export function kvConfigured(): boolean {
  return kv() !== null;
}
