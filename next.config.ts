import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The evidence snapshot is read at runtime via a dynamic fs path (process.cwd()/data/...),
  // which Next's tracer can't detect — force it into every serverless function bundle so the
  // API routes (plan/depth-map/localpack) can read it on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./data/evidence-snapshot.json"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
