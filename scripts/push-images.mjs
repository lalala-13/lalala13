#!/usr/bin/env node
// Puts brand/images/*.png into the store without the Files API scope:
//   1. uploads them as theme assets (public CDN URLs),
//   2. keeps an archived, unpublished "brand assets" product whose media are the logo, inverse logo, favicon and hero,
//      which makes them Files entries that theme settings can reference as shopify://shop_images/<name>,
//      and writes those references into store/theme-settings.json → brand.images (then run push-store.mjs --only theme),
//   3. sets each collection's image (only where the collection has none),
//   4. attaches the category placeholder image to every placeholder product that has no media yet.
// Idempotent. `--dry-run` lists what would happen.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, DRY, connect, gql } from "./lib/shopify.mjs";

const IMG = path.join(ROOT, "brand/images/");
const STORE = process.env.SHOPIFY_STORE;
const HOLDER_HANDLE = "bubble-sharks-brand-assets";
const BRAND = ["logo", "logo-inverse", "favicon", "hero"];
const CATEGORIES = ["bath", "outdoor", "stem", "plush", "sensory", "games"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await connect();
const pngs = readdirSync(IMG).filter((f) => f.endsWith(".png"));
console.log(`${pngs.length} image(s) in brand/images`);
if (DRY) { console.log("  [dry-run] would upload them as theme assets, fill the brand-assets product, set collection images and placeholder product images."); process.exit(0); }

// 1. theme assets
const main = (await gql(`{ themes(first:10){ nodes{ id name role } } }`)).themes.nodes.find((t) => t.role === "MAIN");
const files = pngs.map((f) => ({ filename: `assets/bs-${f}`, body: { type: "BASE64", value: readFileSync(path.join(IMG, f)).toString("base64") } }));
for (let i = 0; i < files.length; i += 10) {
  const r = await gql(`mutation($id:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){ themeFilesUpsert(themeId:$id, files:$files){ upsertedThemeFiles{ filename } userErrors{ field message filename code } } }`, { id: main.id, files: files.slice(i, i + 10) });
  console.log(`uploaded ${r.themeFilesUpsert.upsertedThemeFiles.length} theme asset(s)`);
}
// Assets are served from the storefront's /cdn/shop/t/<n>/assets/ path; <n> comes from the live page HTML.
const html = await fetch(`https://${STORE}/password`).then((r) => r.text());
const themePath = html.match(/\/cdn\/shop\/t\/\d+\//)?.[0];
if (!themePath) throw new Error("Could not find /cdn/shop/t/<n>/ in the storefront HTML");
const urls = {};
for (const f of files) {
  const url = `https://${STORE}${themePath}${f.filename}`;
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) throw new Error(`asset not reachable: ${url} (${head.status})`);
  urls[f.filename.replace(/^assets\/bs-/, "").replace(/\.png$/, "")] = url;
}

// 2. holder product → Files → theme settings
let holder = (await gql(`{ productByHandle(handle:"${HOLDER_HANDLE}"){ id media(first:20){ nodes{ ... on MediaImage { alt status image { url } } } } } }`)).productByHandle;
if (!holder) {
  holder = (await gql(`mutation($p:ProductCreateInput!){ productCreate(product:$p){ product{ id media(first:20){ nodes{ ... on MediaImage { alt status image { url } } } } } userErrors{ field message } } }`,
    { p: { title: "Bubble Sharks brand assets (do not delete)", handle: HOLDER_HANDLE, status: "ARCHIVED", tags: ["internal"],
      descriptionHtml: "<p>Holds the logo, favicon and hero image used by the theme settings. Archived, never published. Delete only after uploading replacements in Content → Files and re-pointing Theme settings → Logo and favicon.</p>" } })).productCreate.product;
  console.log("created brand-assets product");
}
const have = new Set(holder.media.nodes.map((m) => m.alt));
const toAdd = BRAND.filter((k) => !have.has(k) && urls[k]).map((k) => ({ originalSource: urls[k], alt: k, mediaContentType: "IMAGE" }));
if (toAdd.length) {
  const r = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ ... on MediaImage { alt status } } mediaUserErrors{ field message } } }`, { id: holder.id, m: toAdd });
  if (r.productCreateMedia.mediaUserErrors?.length) throw new Error(JSON.stringify(r.productCreateMedia.mediaUserErrors));
  console.log("brand media queued:", toAdd.map((m) => m.alt).join(", "));
}
const refs = {};
for (let tries = 0; tries < 20; tries++) {
  const m = (await gql(`query($id:ID!){ product(id:$id){ media(first:20){ nodes{ ... on MediaImage { alt status image { url } } } } } }`, { id: holder.id })).product.media.nodes;
  if (m.length && m.every((x) => x.status === "READY")) {
    for (const x of m) { const u = x.image?.url || ""; const i = u.lastIndexOf("/files/"); if (i >= 0) refs[x.alt] = "shopify://shop_images/" + decodeURIComponent(u.slice(i + 7).split("?")[0]); }
    break;
  }
  await sleep(3000);
}
const cfgPath = path.join(ROOT, "store/theme-settings.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
cfg.brand.images = { logo: refs.logo || "", logo_inverse: refs["logo-inverse"] || "", favicon: refs.favicon || "", hero: refs.hero || "" };
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log("theme-settings.json brand.images:", JSON.stringify(cfg.brand.images));

// 3. collection images
const collections = (await gql(`{ collections(first:50){ nodes{ id handle image { url } } } }`)).collections.nodes;
let setImages = 0;
for (const c of collections) {
  const url = urls[`collection-${c.handle}`];
  if (!url || c.image) continue;
  await gql(`mutation($i:CollectionInput!){ collectionUpdate(input:$i){ collection{ id } userErrors{ field message } } }`, { i: { id: c.id, image: { src: url, altText: `${c.handle.replace(/-/g, " ")} at Bubble Sharks` } } });
  setImages++;
}
console.log(`collection images set: ${setImages}`);

// 4. placeholder product images
let after = null;
const products = [];
do {
  const d = await gql(`query($after:String){ products(first:100, after:$after, query:"tag:placeholder"){ nodes{ id handle title tags mediaCount { count } } pageInfo{ hasNextPage endCursor } } }`, { after });
  products.push(...d.products.nodes);
  after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (after);
let attached = 0;
for (const p of products) {
  if (p.mediaCount.count > 0) continue;
  const cat = p.tags.find((t) => CATEGORIES.includes(t));
  if (!urls[`placeholder-${cat}`]) continue;
  const r = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ ... on MediaImage { status } } mediaUserErrors{ field message } } }`,
    { id: p.id, m: [{ originalSource: urls[`placeholder-${cat}`], alt: `${p.title} (photo coming soon)`, mediaContentType: "IMAGE" }] });
  if (r.productCreateMedia.mediaUserErrors?.length) console.log("  media error", p.handle, JSON.stringify(r.productCreateMedia.mediaUserErrors));
  else attached++;
}
console.log(`placeholder images attached: ${attached} (of ${products.length} placeholder products)`);
console.log("\nDone. Run: node scripts/push-store.mjs --only theme   (applies the logo, favicon and hero references)");
