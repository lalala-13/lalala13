#!/usr/bin/env node
// Pushes store/ and content/ into a Shopify store through the Admin GraphQL API.
//
//   SHOPIFY_STORE=xxxx.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_... node scripts/push-store.mjs [--dry-run] [--only pages,policies,collections,menus]
//
// Idempotent: existing pages, collections and menus (matched by handle) are updated, not duplicated.
// Theme colours/fonts/sections (store/theme-settings.json) are applied separately in the theme editor.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
const want = (step) => !ONLY || ONLY.has(step);

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
if (!DRY && !args.includes("--render") && (!STORE || !TOKEN)) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN (or pass --dry-run).");
  process.exit(1);
}

async function gql(query, variables = {}) {
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
  for (const key of Object.keys(data || {})) {
    const errs = data[key]?.userErrors;
    if (errs?.length) throw new Error(`${key}: ${errs.map((e) => e.message).join("; ")}`);
  }
  return data;
}

// ---------- minimal Markdown -> HTML (covers what content/ uses) ----------
function inline(s) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/&lt;(https?:\/\/[^\s]+)&gt;/g, '<a href="$1">$1</a>')
    .replace(/\b(support@bubblesharks\.com)\b/g, '<a href="mailto:$1">$1</a>');
}
function mdToHtml(md) {
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
function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  const meta = Object.fromEntries(m[1].split("\n").map((l) => l.split(/:\s*/, 2)));
  return { meta, body: m[2] };
}

// ---------- pages ----------
async function pushPages() {
  const dir = path.join(ROOT, "content/pages");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
    const { meta, body } = frontMatter(await readFile(path.join(dir, file), "utf8"));
    const html = mdToHtml(body.replace(/^#\s.*\n/, "")); // title comes from front matter
    const page = { title: meta.title, handle: meta.handle, body: html, isPublished: true, templateSuffix: meta.template || null };
    console.log(`page ${meta.handle}`);
    const found = DRY ? null : (await gql(`query($q:String){ pages(first:1, query:$q){ nodes{ id } } }`, { q: `handle:${meta.handle}` })).pages.nodes[0];
    if (found) await gql(`mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){ page{id} userErrors{message} } }`, { id: found.id, page });
    else await gql(`mutation($page:PageCreateInput!){ pageCreate(page:$page){ page{id} userErrors{message} } }`, { page });
  }
}

// ---------- policies ----------
const POLICY_TYPES = { privacy: "PRIVACY_POLICY", refund: "REFUND_POLICY", shipping: "SHIPPING_POLICY", terms: "TERMS_OF_SERVICE" };
async function pushPolicies() {
  for (const [name, type] of Object.entries(POLICY_TYPES)) {
    const md = await readFile(path.join(ROOT, "content/policies", `${name}.md`), "utf8");
    console.log(`policy ${type}`);
    await gql(`mutation($p:ShopPolicyInput!){ shopPolicyUpdate(shopPolicy:$p){ shopPolicy{id} userErrors{message} } }`,
      { p: { type, body: mdToHtml(md.replace(/^#\s.*\n/, "")) } });
  }
}

// ---------- collections ----------
async function onlineStorePublicationId() {
  if (DRY) return "gid://shopify/Publication/DRY";
  const d = await gql(`{ publications(first:20){ nodes{ id name } } }`);
  return d.publications.nodes.find((p) => p.name === "Online Store")?.id;
}
async function pushCollections() {
  const defs = JSON.parse(await readFile(path.join(ROOT, "store/collections.json"), "utf8"));
  const pubId = await onlineStorePublicationId();
  for (const c of defs) {
    const rule = c.rule
      ? { column: c.rule.column, relation: c.rule.relation, condition: c.rule.condition }
      : { column: "TAG", relation: "EQUALS", condition: c.tag };
    const input = { title: c.title, handle: c.handle, descriptionHtml: `<p>${inline(c.description)}</p>`,
      ruleSet: { appliedDisjunctively: false, rules: [rule] } };
    console.log(`collection ${c.handle}`);
    const found = DRY ? null : (await gql(`query($h:String!){ collectionByHandle(handle:$h){ id } }`, { h: c.handle })).collectionByHandle;
    let id = found?.id;
    if (id) await gql(`mutation($i:CollectionInput!){ collectionUpdate(input:$i){ collection{id} userErrors{message} } }`, { i: { id, ...input } });
    else id = (await gql(`mutation($i:CollectionInput!){ collectionCreate(input:$i){ collection{id} userErrors{message} } }`, { i: input })).collectionCreate?.collection?.id;
    if (id && pubId) await gql(`mutation($id:ID!,$pub:ID!){ publishablePublish(id:$id,input:{publicationId:$pub}){ userErrors{message} } }`, { id, pub: pubId });
  }
}

// ---------- menus ----------
function menuItems(items) {
  return items.map((it) => ({ title: it.title, type: "HTTP", url: it.url, items: it.items ? menuItems(it.items) : [] }));
}
async function pushMenus() {
  const nav = JSON.parse(await readFile(path.join(ROOT, "store/navigation.json"), "utf8"));
  const existing = DRY ? [] : (await gql(`{ menus(first:20){ nodes{ id handle title } } }`)).menus.nodes;
  for (const [handle, items] of Object.entries(nav)) {
    const title = handle === "main-menu" ? "Main menu" : "Footer menu";
    console.log(`menu ${handle}`);
    const found = existing.find((m) => m.handle === handle);
    if (found) await gql(`mutation($id:ID!,$t:String!,$items:[MenuItemUpdateInput!]!){ menuUpdate(id:$id,title:$t,items:$items){ menu{id} userErrors{message} } }`, { id: found.id, t: title, items: menuItems(items) });
    else await gql(`mutation($t:String!,$h:String!,$items:[MenuItemCreateInput!]!){ menuCreate(title:$t,handle:$h,items:$items){ menu{id} userErrors{message} } }`, { t: title, h: handle, items: menuItems(items) });
  }
}

if (args.includes("--render")) { // preview a Markdown file as HTML: node scripts/push-store.mjs --render content/pages/faq.md
  const md = await readFile(path.resolve(args[args.indexOf("--render") + 1]), "utf8");
  console.log(mdToHtml(frontMatter(md).body));
  process.exit(0);
}

const steps = { pages: pushPages, policies: pushPolicies, collections: pushCollections, menus: pushMenus };
for (const [name, fn] of Object.entries(steps)) {
  if (!want(name)) continue;
  console.log(`\n== ${name} ==`);
  await fn();
}
console.log(DRY ? "\nDry run complete." : "\nDone. Apply store/theme-settings.json in Online Store → Themes → Customize.");
