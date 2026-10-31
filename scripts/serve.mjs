// Local preview: serves public/ and /api/data using the logged-in gh CLI token.
// Set PREVIEW_MEMBERS=a,b,c to try other usernames without editing members.json.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "../lib/collect.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const PORT = 4173;

const config = JSON.parse(readFileSync(join(ROOT, "members.json"), "utf8"));
if (process.env.PREVIEW_MEMBERS) config.members = process.env.PREVIEW_MEMBERS.split(",");
const token = process.env.GITHUB_TOKEN || execSync("gh auth token", { encoding: "utf8" }).trim();

createServer(async (req, res) => {
  const path = normalize(new URL(req.url, "http://localhost").pathname).replace(/^[/\\]+/, "");
  try {
    if (path.replaceAll("\\", "/") === "api/data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(await collect(config, token)));
      return;
    }
    const file = path || "index.html";
    const body = await readFile(join(ROOT, "public", file));
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
