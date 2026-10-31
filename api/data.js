import { readFileSync } from "node:fs";
import { collect } from "../lib/collect.mjs";

const config = JSON.parse(readFileSync(new URL("../members.json", import.meta.url), "utf8"));

export default async function handler(req, res) {
  try {
    const data = await collect(config, process.env.GITHUB_TOKEN);
    // Vercel's CDN answers repeat visits, so GitHub is queried about once an hour at most.
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Could not load GitHub data" });
  }
}
