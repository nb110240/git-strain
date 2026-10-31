import { readFileSync } from "node:fs";
import { collect } from "../lib/collect.mjs";

const config = JSON.parse(readFileSync(new URL("../members.json", import.meta.url), "utf8"));

export default async function handler(req, res) {
  // The CDN only caches clean GET requests, so anything else would reach GitHub on every call.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.url.includes("?")) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "Query parameters are not supported" });
  }

  try {
    const data = await collect(config, process.env.GITHUB_TOKEN);
    // Vercel's CDN answers repeat visits, so GitHub is queried about once an hour at most.
    // A partial failure may be temporary, so it's retried sooner.
    res.setHeader("Cache-Control", data.failed.length ? "s-maxage=300" : "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Could not load GitHub data" });
  }
}
