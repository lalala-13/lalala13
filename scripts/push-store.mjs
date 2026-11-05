#!/usr/bin/env node
// Pushes store/ and content/ into a Shopify store through the Admin GraphQL API.
//
//   SHOPIFY_STORE=xxxx.myshopify.com SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... \
//     node scripts/push-store.mjs [--dry-run] [--only pages,policies,collections,menus,shipping,discount,theme,blog]
//
// Auth: a Dev Dashboard app's client ID + secret (exchanged for a 24h token via the client credentials grant),
// or a ready-made SHOPIFY_ADMIN_TOKEN from an older admin-created custom app.
//
// Idempotent: existing pages, collections, menus, shipping rates and discount codes (matched by handle / zone / code)
// are updated, not duplicated. The theme step reads the live Dawn theme's JSON files, merges store/theme-settings.json
// into them and writes them back, keeping a copy of the originals under .backup/theme/<timestamp>/.
//
// Other options:
//   --render content/pages/faq.md      preview a Markdown file as HTML
//   --theme-dir /path/to/dawn          with --dry-run: run the theme merge on a local Dawn copy, output to .backup/theme-preview/

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT, args, DRY, flag, opt, connect, gql, onlineStorePublicationId, inline, mdToHtml, frontMatter, plainText } from "./lib/shopify.mjs";
import { THEME_FILES, buildThemeFiles } from "./lib/theme.mjs";
import { HORIZON_FILES, buildHorizonFiles } from "./lib/theme-horizon.mjs";

const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
const want = (step) => !ONLY || ONLY.has(step);
const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
const seoFor = async () => (await readJson("store/seo.json"));
const seoMetafields = (title, description) => [
  { namespace: "global", key: "title_tag", type: "single_line_text_field", value: title },
  { namespace: "global", key: "description_tag", type: "single_line_text_field", value: description },
];

if (flag("--render")) { // preview a Markdown file as HTML: node scripts/push-store.mjs --render content/pages/faq.md
  const md = await readFile(path.resolve(opt("--render")), "utf8");
  console.log(mdToHtml(frontMatter(md).body));
  process.exit(0);
}

// ---------- pages ----------
async function pushPages() {
  const seo = await seoFor();
  const dir = path.join(ROOT, "content/pages");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
    const { meta, body } = frontMatter(await readFile(path.join(dir, file), "utf8"));
    const html = mdToHtml(body.replace(/^#\s.*\n/, "")); // title comes from front matter
    const s = seo.pages[meta.handle] || {};
    const page = { title: meta.title, handle: meta.handle, body: html, isPublished: true, templateSuffix: meta.template || null,
      metafields: seoMetafields((s.title || meta.title) + seo.suffix, s.description || plainText(html)) };
    console.log(`page ${meta.handle}`);
    const found = DRY ? null : (await gql(`query($q:String){ pages(first:1, query:$q){ nodes{ id } } }`, { q: `handle:${meta.handle}` })).pages.nodes[0];
    if (found) await gql(`mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){ page{id} userErrors{field message} } }`, { id: found.id, page });
    else await gql(`mutation($page:PageCreateInput!){ pageCreate(page:$page){ page{id} userErrors{field message} } }`, { page });
  }
}

// ---------- policies ----------
const POLICY_TYPES = { privacy: "PRIVACY_POLICY", refund: "REFUND_POLICY", shipping: "SHIPPING_POLICY", terms: "TERMS_OF_SERVICE" };
async function pushPolicies() {
  for (const [name, type] of Object.entries(POLICY_TYPES)) {
    const md = await readFile(path.join(ROOT, "content/policies", `${name}.md`), "utf8");
    console.log(`policy ${type}`);
    try {
      await gql(`mutation($p:ShopPolicyInput!){ shopPolicyUpdate(shopPolicy:$p){ shopPolicy{id} userErrors{field message} } }`,
        { p: { type, body: mdToHtml(md.replace(/^#\s.*\n/, "")) } });
    } catch (e) {
      if (!/Automatic management/i.test(e.message)) throw e;
      // Shopify generates this policy itself until the owner switches that off in Settings → Policies.
      console.log(`  skipped: Shopify manages this policy automatically. Settings → Policies → ${name} → turn off automatic management, then re-run with --only policies.`);
    }
  }
}

// ---------- collections ----------
async function pushCollections() {
  const defs = await readJson("store/collections.json");
  const seo = await seoFor();
  const pubId = await onlineStorePublicationId();
  for (const c of defs) {
    const rule = c.rule
      ? { column: c.rule.column, relation: c.rule.relation, condition: c.rule.condition }
      : { column: "TAG", relation: "EQUALS", condition: c.tag };
    const s = seo.collections[c.handle] || {};
    const input = { title: c.title, handle: c.handle, descriptionHtml: `<p>${inline(c.description)}</p>`,
      ruleSet: { appliedDisjunctively: false, rules: [rule] }, sortOrder: "BEST_SELLING",
      seo: { title: (s.title || `${c.title} for Kids`) + seo.suffix, description: s.description || plainText(c.description) } };
    console.log(`collection ${c.handle}`);
    const found = DRY ? null : (await gql(`query($h:String!){ collectionByHandle(handle:$h){ id } }`, { h: c.handle })).collectionByHandle;
    let id = found?.id;
    if (id) await gql(`mutation($i:CollectionInput!){ collectionUpdate(input:$i){ collection{id} userErrors{field message} } }`, { i: { id, ...input } });
    else id = (await gql(`mutation($i:CollectionInput!){ collectionCreate(input:$i){ collection{id} userErrors{field message} } }`, { i: input })).collectionCreate?.collection?.id;
    if (id && pubId) await gql(`mutation($id:ID!,$pub:ID!){ publishablePublish(id:$id,input:{publicationId:$pub}){ userErrors{field message} } }`, { id, pub: pubId });
  }
}

// ---------- menus ----------
function menuItems(items) {
  return items.map((it) => ({ title: it.title, type: "HTTP", url: it.url, items: it.items ? menuItems(it.items) : [] }));
}
async function pushMenus() {
  const nav = await readJson("store/navigation.json");
  const existing = DRY ? [] : (await gql(`{ menus(first:20){ nodes{ id handle title } } }`)).menus.nodes;
  for (const [handle, items] of Object.entries(nav)) {
    const title = handle === "main-menu" ? "Main menu" : "Footer menu";
    console.log(`menu ${handle}`);
    const found = existing.find((m) => m.handle === handle);
    if (found) await gql(`mutation($id:ID!,$t:String!,$items:[MenuItemUpdateInput!]!){ menuUpdate(id:$id,title:$t,items:$items){ menu{id} userErrors{field message} } }`, { id: found.id, t: title, items: menuItems(items) });
    else await gql(`mutation($t:String!,$h:String!,$items:[MenuItemCreateInput!]!){ menuCreate(title:$t,handle:$h,items:$items){ menu{id} userErrors{field message} } }`, { t: title, h: handle, items: menuItems(items) });
  }
}

// ---------- shipping ----------
// Default delivery profile → the zone that contains our country gets exactly the rates in store/shipping.json.
async function pushShipping() {
  const cfg = await readJson("store/shipping.json");
  const money = (n) => ({ amount: n.toFixed(2), currencyCode: cfg.currency });
  const methodDefinitionsToCreate = cfg.rates.map((r) => ({
    name: r.name, active: true, rateDefinition: { price: money(r.price) },
    priceConditionsToCreate: [
      ...(r.minOrder !== undefined ? [{ criteria: money(r.minOrder), operator: "GREATER_THAN_OR_EQUAL_TO" }] : []),
      ...(r.maxOrder !== undefined ? [{ criteria: money(r.maxOrder), operator: "LESS_THAN_OR_EQUAL_TO" }] : []),
    ],
  }));
  console.log(`shipping: ${cfg.rates.map((r) => `${r.name} $${r.price}${r.minOrder !== undefined ? ` from $${r.minOrder}` : ""}${r.maxOrder !== undefined ? ` up to $${r.maxOrder}` : ""}`).join(" | ")}`);
  if (DRY) { await gql(`mutation($id:ID!,$profile:DeliveryProfileInput!){ deliveryProfileUpdate(id:$id,profile:$profile){ profile{id} userErrors{field message} } }`, { id: "DRY", profile: { methodDefinitionsToCreate } }); return; }
  const d = await gql(`{ deliveryProfiles(first:10){ nodes{ id name default profileLocationGroups{ locationGroup{ id }
    locationGroupZones(first:20){ nodes{ zone{ id name countries{ code{ countryCode restOfWorld } } } methodDefinitions(first:20){ nodes{ id name active } } } } } } } }`);
  const profiles = d.deliveryProfiles.nodes;
  const profile = profiles.find((p) => p.default) || profiles[0];
  if (!profile) throw new Error("No delivery profile found");
  for (const p of profiles) if (p !== profile) console.log(`  note: extra delivery profile "${p.name}" (left untouched; supplier apps sometimes add their own rates)`);
  const group = profile.profileLocationGroups[0];
  if (!group) throw new Error("Default delivery profile has no location group; add a shipping location in Settings → Locations first");
  const zone = group.locationGroupZones.nodes.find((z) => z.zone.countries.some((c) => cfg.zone.countries.includes(c.code.countryCode)));
  const input = { locationGroupsToUpdate: [{ id: group.locationGroup.id }] };
  if (zone) {
    const old = zone.methodDefinitions.nodes;
    console.log(`  zone "${zone.zone.name}": replacing ${old.length} rate(s) [${old.map((m) => m.name).join(", ")}]`);
    input.methodDefinitionsToDelete = old.map((m) => m.id);
    input.locationGroupsToUpdate[0].zonesToUpdate = [{ id: zone.zone.id, methodDefinitionsToCreate }];
  } else {
    console.log(`  creating zone "${cfg.zone.name}" (${cfg.zone.countries.join(", ")})`);
    input.locationGroupsToUpdate[0].zonesToCreate = [{ name: cfg.zone.name, countries: cfg.zone.countries.map((code) => ({ code, includeAllProvinces: true })), methodDefinitionsToCreate }];
  }
  await gql(`mutation($id:ID!,$profile:DeliveryProfileInput!){ deliveryProfileUpdate(id:$id,profile:$profile){ profile{id} userErrors{field message} } }`, { id: profile.id, profile: input });
}

// ---------- discount codes ----------
async function pushDiscounts() {
  const defs = await readJson("store/discounts.json");
  for (const dsc of defs) {
    const input = {
      title: dsc.title, code: dsc.code, startsAt: new Date().toISOString(), appliesOncePerCustomer: !!dsc.oncePerCustomer,
      customerSelection: { all: true }, customerGets: { value: { percentage: dsc.percentage / 100 }, items: { all: true } },
      combinesWith: dsc.combinesWith,
    };
    console.log(`discount ${dsc.code} (${dsc.percentage}% off${dsc.oncePerCustomer ? ", once per customer" : ""})`);
    const found = DRY ? null : (await gql(`query($c:String!){ codeDiscountNodeByCode(code:$c){ id } }`, { c: dsc.code })).codeDiscountNodeByCode;
    if (found) { delete input.startsAt; await gql(`mutation($id:ID!,$d:DiscountCodeBasicInput!){ discountCodeBasicUpdate(id:$id,basicCodeDiscount:$d){ codeDiscountNode{id} userErrors{field message} } }`, { id: found.id, d: input }); }
    else await gql(`mutation($d:DiscountCodeBasicInput!){ discountCodeBasicCreate(basicCodeDiscount:$d){ codeDiscountNode{id} userErrors{field message} } }`, { d: input });
  }
}

// ---------- blog ----------
// content/blog/*.md → articles in the "Guides" blog (created if missing), matched by handle, with meta title/description.
const BLOG = { title: "Guides", handle: "guides" };
async function pushBlog() {
  const dir = path.join(ROOT, "content/blog");
  const posts = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".md"));
  if (!posts.length) { console.log("  no posts in content/blog"); return; }
  const seo = await seoFor();
  let blog = DRY ? { id: "gid://shopify/Blog/DRY" } : (await gql(`{ blogs(first:20){ nodes{ id handle title } } }`)).blogs.nodes.find((b) => b.handle === BLOG.handle);
  if (!blog) {
    console.log(`blog ${BLOG.handle} (create)`);
    blog = (await gql(`mutation($b:BlogCreateInput!){ blogCreate(blog:$b){ blog{ id handle } userErrors{ field message } } }`, { b: { title: BLOG.title, handle: BLOG.handle, commentPolicy: "CLOSED" } })).blogCreate.blog;
  }
  const existing = DRY ? [] : (await gql(`query($id:ID!){ blog(id:$id){ articles(first:50){ nodes{ id handle image { url } } } } }`, { id: blog.id })).blog.articles.nodes;
  for (const file of posts) {
    const { meta, body } = frontMatter(await readFile(path.join(dir, file), "utf8"));
    const html = mdToHtml(body.replace(/^#\s.*\n/, ""));
    const titleTag = (meta.title + seo.suffix).length <= 70 ? meta.title + seo.suffix : meta.title;
    const article = { title: meta.title, handle: meta.handle, body: html, summary: `<p>${inline(meta.summary || "")}</p>`, author: { name: meta.author || "Bubble Sharks" },
      isPublished: true, tags: (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      metafields: seoMetafields(titleTag, plainText(meta.summary || html)) };
    const found = existing.find((a) => a.handle === meta.handle);
    if (meta.image && !found?.image && !DRY) { // `image: <collection handle>` borrows that collection's image for the post card
      const col = (await gql(`query($h:String!){ collectionByHandle(handle:$h){ image { url altText } } }`, { h: meta.image })).collectionByHandle;
      if (col?.image?.url) article.image = { url: col.image.url, altText: col.image.altText || meta.title };
    }
    console.log(`article ${meta.handle}`);
    if (found) await gql(`mutation($id:ID!,$a:ArticleUpdateInput!){ articleUpdate(id:$id, article:$a){ article{ id } userErrors{ field message } } }`, { id: found.id, a: article });
    else await gql(`mutation($a:ArticleCreateInput!){ articleCreate(article:$a){ article{ id } userErrors{ field message } } }`, { a: { ...article, blogId: blog.id } });
  }
}

// ---------- theme ----------
// Supports Dawn and Horizon (Shopify's two free defaults). Reads the live theme's JSON, merges store/theme-settings.json, writes back.
const THEMES = { dawn: { files: THEME_FILES, build: buildThemeFiles }, horizon: { files: HORIZON_FILES, build: buildHorizonFiles } };
function themeKind(schemaJson, name) {
  const schema = schemaJson ? JSON.parse(schemaJson.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")) : [];
  const info = schema.find((g) => g.name === "theme_info");
  const label = `${info?.theme_name || ""} ${name || ""}`;
  return { kind: /horizon/i.test(label) ? "horizon" : /dawn/i.test(label) ? "dawn" : null, label: `${info?.theme_name || name || "?"} ${info?.theme_version || ""}`.trim() };
}
async function pushTheme() {
  const cfg = await readJson("store/theme-settings.json");
  const themeDir = opt("--theme-dir");
  const allFiles = [...new Set([...THEME_FILES, ...HORIZON_FILES])];
  let files = {};
  let themeId;
  if (DRY && themeDir) {
    for (const f of allFiles) files[f] = await readFile(path.join(themeDir, f), "utf8").catch(() => undefined);
  } else if (DRY) {
    console.log(`  [dry-run] would read the live theme's JSON and merge store/theme-settings.json into it (pass --theme-dir <theme checkout> to preview the merge)`);
    return;
  } else {
    const themes = (await gql(`{ themes(first:20){ nodes{ id name role } } }`)).themes.nodes;
    const main = themes.find((t) => t.role === "MAIN");
    if (!main) throw new Error("No published (MAIN) theme found");
    themeId = main.id;
    const got = (await gql(`query($id:ID!,$names:[String!]!){ theme(id:$id){ files(filenames:$names, first:20){ nodes{ filename body{ ... on OnlineStoreThemeFileBodyText{ content } } } } } }`,
      { id: themeId, names: allFiles })).theme.files.nodes;
    for (const n of got) files[n.filename] = n.body?.content;
  }
  const { kind, label } = themeKind(files["config/settings_schema.json"], themeId ? undefined : path.basename(themeDir));
  console.log(`  theme: ${label}`);
  if (!kind) { console.log("  neither Dawn nor Horizon: skipping theme settings. Apply store/theme-settings.json by hand in the theme editor."); return; }
  if (!files["config/settings_data.json"]) throw new Error("Could not read config/settings_data.json from the theme");
  const out = THEMES[kind].build(files, cfg);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, ".backup", DRY ? "theme-preview" : `theme/${stamp}`);
  for (const [name, content] of Object.entries(out)) {
    await mkdir(path.join(backupDir, path.dirname(name)), { recursive: true });
    if (!DRY && files[name]) await writeFile(path.join(backupDir, name + ".orig"), files[name]);
    if (DRY) await writeFile(path.join(backupDir, name), content);
  }
  console.log(DRY ? `  merged files written to ${path.relative(ROOT, backupDir)}/` : `  originals backed up to ${path.relative(ROOT, backupDir)}/`);
  const upsert = Object.entries(out).map(([filename, value]) => ({ filename, body: { type: "TEXT", value } }));
  const res = await gql(`mutation($id:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){ themeFilesUpsert(themeId:$id, files:$files){ upsertedThemeFiles{ filename } userErrors{ field message filename code } } }`,
    { id: themeId || "DRY", files: upsert });
  if (!DRY) console.log(`  wrote ${res.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(", ")}`);
}

await connect();
const steps = { pages: pushPages, policies: pushPolicies, collections: pushCollections, menus: pushMenus, shipping: pushShipping, discount: pushDiscounts, theme: pushTheme, blog: pushBlog };
for (const name of ONLY || []) if (!steps[name]) { console.error(`Unknown step "${name}". Steps: ${Object.keys(steps).join(", ")}`); process.exit(1); }
for (const [name, fn] of Object.entries(steps)) {
  if (!want(name)) continue;
  console.log(`\n== ${name} ==`);
  await fn();
}
console.log(DRY ? "\nDry run complete." : "\nDone. Next: docs/HANDOFF-CHECKLIST.md (homepage SEO, pixels, checkout settings, test order, password off).");
