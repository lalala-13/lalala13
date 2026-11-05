// Shared helpers for scripts/push-*.mjs: CLI flags, Admin API auth + GraphQL, Markdown → HTML, rich text.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
export const args = process.argv.slice(2);
export const DRY = args.includes("--dry-run");
export const flag = (name) => args.includes(name);
export const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const STORE = process.env.SHOPIFY_STORE;
const { SHOPIFY_CLIENT_ID: CLIENT_ID, SHOPIFY_CLIENT_SECRET: CLIENT_SECRET } = process.env;
let TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// Shopify answers a failed client-credentials exchange with an HTML page whose <title> carries the code.
const OAUTH_HELP = {
  app_not_installed: "The Dev Dashboard app is not installed on this store yet. Open dev.shopify.com → your app → Home → " +
    "Install app, pick the store named in SHOPIFY_STORE and approve (SETUP-GUIDE.md step A5.4). The app version with " +
    "the scopes must have been released first (A5.3).",
  invalid_client: "Client ID or secret is wrong. Copy both again from the app's Settings page in the Dev Dashboard (A5.5).",
  invalid_request: "The store address or grant type was rejected. SHOPIFY_STORE must be the *.myshopify.com address, no https://.",
};

// Exchanges client ID + secret for a 24h token (no-op in --dry-run or when SHOPIFY_ADMIN_TOKEN is set).
export async function connect() {
  if (DRY) return;
  if (!STORE || !(TOKEN || (CLIENT_ID && CLIENT_SECRET))) {
    console.error("Set SHOPIFY_STORE plus SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_TOKEN), or pass --dry-run.");
    process.exit(1);
  }
  if (TOKEN) return;
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || !json.access_token) {
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const code = title?.match(/Oauth error (\w+)/i)?.[1] || json.error;
    console.error(`Token exchange failed (${res.status}): ${code || title || text.slice(0, 200)}`);
    if (OAUTH_HELP[code]) console.error(`  Fix: ${OAUTH_HELP[code]}`);
    process.exit(1);
  }
  TOKEN = json.access_token;
  console.log(`Got access token for ${STORE}, scopes: ${json.scope}`);
}

// Runs one Admin GraphQL operation. Throws on transport/GraphQL errors and on userErrors (unless opts.allowUserErrors).
export async function gql(query, variables = {}, opts = {}) {
  if (DRY) {
    console.log(`  [dry-run] ${query.trim().split("\n")[0].trim()}`, JSON.stringify(variables).slice(0, 160));
    return {};
  }
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const data = json.data;
  if (!opts.allowUserErrors) {
    for (const key of Object.keys(data || {})) {
      const errs = data[key]?.userErrors;
      if (errs?.length) throw new Error(`${key}: ${errs.map((e) => `${(e.field || []).join(".") || "-"}: ${e.message}`).join("; ")}`);
    }
  }
  return data;
}

// Walks a connection with `first`/`after` until exhausted. `select` returns {nodes, pageInfo} from the response.
export async function paginate(query, variables, select, first = 100) {
  const all = [];
  let after = null;
  do {
    const d = await gql(query, { ...variables, first, after });
    if (DRY) return all;
    const { nodes, pageInfo } = select(d);
    all.push(...nodes);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);
  return all;
}

export async function onlineStorePublicationId() {
  if (DRY) return "gid://shopify/Publication/DRY";
  const d = await gql(`{ publications(first:20){ nodes{ id name } } }`);
  return d.publications.nodes.find((p) => p.name === "Online Store")?.id;
}

// ---------- minimal Markdown -> HTML (covers what content/ uses) ----------
export function inline(s) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/&lt;(https?:\/\/[^\s]+)&gt;/g, '<a href="$1">$1</a>')
    .replace(/\b(support@bubblesharks\.com)\b/g, '<a href="mailto:$1">$1</a>');
}
export function mdToHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const cells = (r) => r.split("|").slice(1, -1).map((c) => c.trim());
      const body = rows.filter((r) => !/^\|\s*-+/.test(r));
      const [head, ...rest] = body;
      const headCells = cells(head);
      let html = "<table>";
      if (headCells.some(Boolean)) html += `<thead><tr>${headCells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
      html += `<tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      out.push(html); continue;
    }
    const listMatch = (l) => l.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (listMatch(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (listMatch(lines[i]) || (lines[i].startsWith("  ") && items.length))) {
        const m = listMatch(lines[i]);
        if (m && !lines[i].startsWith("  ")) items.push(m[3]);
        else items[items.length - 1] += " " + lines[i].trim().replace(/^[-*]\s+/, "");
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}
export function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  const meta = Object.fromEntries(m[1].split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return { meta, body: m[2] };
}
// Strips tags for plain-text fields such as meta descriptions; trims to `max` characters on a word boundary.
export function plainText(html, max = 160) {
  const t = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// ---------- Shopify rich_text_field JSON ----------
// blocks: { h: "Heading", level?: 3 } | { p: "text" } | { p: [{ text, bold }] } | { ul: ["a", "b"] }
export function richText(blocks) {
  const text = (v) => (typeof v === "string" ? [{ type: "text", value: v }] : v.map((s) => ({ type: "text", value: s.text, ...(s.bold ? { bold: true } : {}) })));
  const children = blocks.map((b) => {
    if (b.h) return { type: "heading", level: b.level || 3, children: text(b.h) };
    if (b.ul) return { type: "list", listType: "unordered", children: b.ul.map((li) => ({ type: "list-item", children: text(li) })) };
    return { type: "paragraph", children: text(b.p) };
  });
  return JSON.stringify({ type: "root", children });
}
