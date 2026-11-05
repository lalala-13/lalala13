#!/usr/bin/env node
// Rewrites supplier-imported products to the listing rules in store/product-sourcing-rules.md, driven by store/products.json.
//
//   node scripts/push-products.mjs [--dry-run] [--slot bath-01,plush-01]   rewrite verified, matched slots
//   node scripts/push-products.mjs --create-placeholders                    create a placeholder product for every slot with no product yet
//   node scripts/push-products.mjs --audit                                  check every store product against the rules
//
// Placeholders carry the tags `placeholder` and `slot:<slot>`. They let the storefront be reviewed before the supplier
// import and are archived automatically when a real product for the same slot is rewritten. The audit lists them;
// none may be live at launch.
//
// A slot is pushed only when `verified: true` (age grade, materials, box contents and safety docs checked against the
// supplier listing) and a store product matches it by `match.handle` or `match.titleIncludes`. Everything else is reported.
// For each matched product: title, description, tags, product type, SEO, the Age & safety metafield (custom.age_safety,
// shown by the product page's collapsible) and the price of every variant are set, the product is set ACTIVE and
// published to the Online Store.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, DRY, flag, opt, connect, gql, paginate, onlineStorePublicationId, inline, richText, plainText } from "./lib/shopify.mjs";

const SEO_SUFFIX = " | Bubble Sharks";
const META = { namespace: "custom", key: "age_safety", name: "Age & safety", type: "rich_text_field" };
const TYPE_TAGS = ["bath", "outdoor", "stem", "plush", "sensory", "games"];
const AGE_TAGS = ["age-3-5", "age-6-8", "age-9-12"];
const FEES = { rate: 0.029, fixed: 0.3 }; // Shopify Payments Basic
const catalogue = JSON.parse(await readFile(path.join(ROOT, "store/products.json"), "utf8"));
const only = opt("--slot") ? new Set(opt("--slot").split(",")) : null;
const slots = catalogue.products.filter((p) => !only || only.has(p.slot));

// ---------- rules ----------
const charm = (n) => /\.(95|99)$/.test(n.toFixed(2));
export function retailFromLanded(landed) { // 2.5–3x landed, x.95, min 9.95
  let p = Math.ceil(landed * 2.5) - 0.05;
  if (p < landed * 2.5) p += 1;
  return Math.max(9.95, Number(p.toFixed(2)));
}
function checkSlot(p) {
  const problems = [];
  if (p.title.length > 60) problems.push(`title is ${p.title.length} chars (max 60)`);
  if (!/\bfor\b/i.test(p.title)) problems.push("title should read '<what it is> for <who>'");
  if (p.price < 9.95) problems.push("price below $9.95 minimum");
  if (!charm(p.price)) problems.push("price must end in .95 or .99");
  const landed = p.supplier.landedCost ?? p.supplier.landedCostTarget;
  if (landed) {
    if (p.price < landed * 2.5 && p.price > 9.95) problems.push(`price under 2.5x landed cost ($${landed}); next x.95 is $${retailFromLanded(landed)}`);
    if (p.price > landed * 3 && p.price > 9.95) problems.push(`price over 3x landed cost ($${landed})`);
    const margin = p.price - p.price * FEES.rate - FEES.fixed - landed;
    if (margin < 6) problems.push(`margin $${margin.toFixed(2)} after fees is under the $6 floor`);
  }
  if (!TYPE_TAGS.includes(p.collection)) problems.push(`collection tag must be one of ${TYPE_TAGS.join("|")}`);
  if (!AGE_TAGS.includes(p.age)) problems.push(`age tag must be one of ${AGE_TAGS.join("|")}`);
  if (p.benefits.length < 3 || p.benefits.length > 5) problems.push("3–5 benefit bullets");
  for (const f of ["lead", "materials", "supervision", "inTheBox", "ageLabel", "type"]) if (!p[f]) problems.push(`missing ${f}`);
  if (p.verified && !p.safetyDocs) problems.push("verified but safetyDocs is empty");
  return problems;
}

// ---------- listing ----------
function descriptionHtml(p) {
  const li = (xs) => xs.map((x) => `<li>${inline(x)}</li>`).join("");
  return [
    `<p>${inline(p.lead)}</p>`,
    `<ul>${li(p.benefits)}</ul>`,
    `<h3>Age &amp; safety</h3><ul>${li([`Age grade: ${p.ageLabel}`, `Materials: ${p.materials}`, p.supervision])}</ul>`,
    `<h3>In the box</h3><p>${inline(p.inTheBox)}</p>`,
    `<h3>Shipping</h3><p>${inline(catalogue.defaults.shipping)}</p>`,
  ].join("\n");
}
const ageSafety = (p) => richText([
  { p: [{ text: "Age grade: ", bold: true }, { text: p.ageLabel }] },
  { p: [{ text: "Materials: ", bold: true }, { text: p.materials }] },
  { p: p.supervision },
  { p: "Sourced only from suppliers who provide US safety documentation (CPSIA / ASTM F963) for this item." },
]);
const tagsFor = (p, existing = []) => [...new Set([p.collection, p.age, ...(p.extraTags || []), ...catalogue.defaults.launchTags, ...existing.filter((t) => t === "bestseller")])];

// ---------- store ----------
const PRODUCT_FIELDS = `id handle title status tags productType vendor descriptionHtml variants(first:50){ nodes{ id price title } } ageSafety: metafield(namespace:"${META.namespace}", key:"${META.key}"){ id }`;
const fetchProducts = () => paginate(`query($first:Int!,$after:String){ products(first:$first, after:$after){ nodes{ ${PRODUCT_FIELDS} } pageInfo{ hasNextPage endCursor } } }`, {}, (d) => d.products);

const isPlaceholder = (x) => (x.tags || []).includes("placeholder");
function findMatch(p, products) {
  const real = products.filter((x) => !isPlaceholder(x));
  if (p.match?.handle) return real.filter((x) => x.handle === p.match.handle);
  if (p.match?.titleIncludes) { const needle = p.match.titleIncludes.toLowerCase(); return real.filter((x) => x.title.toLowerCase().includes(needle)); }
  return [];
}
const findPlaceholder = (p, products) => products.find((x) => isPlaceholder(x) && (x.tags || []).includes(`slot:${p.slot}`));

async function createPlaceholder(p, pubId) {
  const input = {
    title: p.title, descriptionHtml: descriptionHtml(p), tags: [...tagsFor(p), "placeholder", `slot:${p.slot}`], productType: p.type,
    vendor: catalogue.defaults.vendor, status: "ACTIVE",
    seo: { title: plainText(p.title + SEO_SUFFIX, 70), description: plainText(p.lead, 160) },
    metafields: [{ namespace: META.namespace, key: META.key, type: META.type, value: ageSafety(p) }],
  };
  const d = await gql(`mutation($p:ProductCreateInput!){ productCreate(product:$p){ product{ id handle variants(first:1){ nodes{ id } } } userErrors{ field message } } }`, { p: input });
  const product = d.productCreate.product;
  const variant = product.variants.nodes[0];
  if (variant) await gql(`mutation($id:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$id, variants:$v){ productVariants{ id } userErrors{ field message } } }`,
    { id: product.id, v: [{ id: variant.id, price: p.price.toFixed(2) }] });
  if (pubId) await gql(`mutation($id:ID!,$pub:ID!){ publishablePublish(id:$id,input:{publicationId:$pub}){ userErrors{ field message } } }`, { id: product.id, pub: pubId });
  return product;
}
async function archive(product) {
  await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ product{ id } userErrors{ field message } } }`, { p: { id: product.id, status: "ARCHIVED" } });
}

async function ensureMetafieldDefinition() {
  const d = await gql(`mutation($d:MetafieldDefinitionInput!){ metafieldDefinitionCreate(definition:$d){ createdDefinition{ id } userErrors{ code message } } }`,
    { d: { name: META.name, namespace: META.namespace, key: META.key, type: META.type, ownerType: "PRODUCT", pin: true, description: "Shown in the Age & safety tab on the product page" } },
    { allowUserErrors: true });
  const errs = d.metafieldDefinitionCreate?.userErrors || [];
  if (errs.length && !errs.every((e) => e.code === "TAKEN")) throw new Error(`metafieldDefinitionCreate: ${errs.map((e) => e.message).join("; ")}`);
}

async function rewrite(p, product, pubId) {
  const input = {
    id: product.id, title: p.title, descriptionHtml: descriptionHtml(p), tags: tagsFor(p, product.tags), productType: p.type,
    vendor: catalogue.defaults.vendor, status: "ACTIVE",
    seo: { title: plainText(p.title + SEO_SUFFIX, 70), description: plainText(p.lead, 160) },
    metafields: [{ namespace: META.namespace, key: META.key, type: META.type, value: ageSafety(p) }],
  };
  await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ product{ id } userErrors{ field message } } }`, { p: input });
  const variants = (product.variants?.nodes || []).map((v) => ({ id: v.id, price: p.price.toFixed(2), compareAtPrice: p.compareAt ? p.compareAt.toFixed(2) : null }));
  if (variants.length) await gql(`mutation($id:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$id, variants:$v){ productVariants{ id } userErrors{ field message } } }`, { id: product.id, v: variants });
  if (pubId) await gql(`mutation($id:ID!,$pub:ID!){ publishablePublish(id:$id,input:{publicationId:$pub}){ userErrors{ field message } } }`, { id: product.id, pub: pubId });
}

// ---------- audit ----------
function auditProduct(x) {
  const issues = [];
  const tags = x.tags || [];
  if (!tags.some((t) => TYPE_TAGS.includes(t))) issues.push("no type tag");
  if (!tags.some((t) => AGE_TAGS.includes(t))) issues.push("no age tag");
  for (const v of x.variants?.nodes || []) { const price = Number(v.price); if (price < 9.95) issues.push(`variant ${v.title} $${price} under $9.95`); else if (!charm(price)) issues.push(`variant ${v.title} $${price} not x.95/x.99`); }
  if (!x.descriptionHtml || !/Age &amp; safety|Age & safety/.test(x.descriptionHtml)) issues.push("description lacks Age & safety");
  if (!x.ageSafety) issues.push("no Age & safety metafield");
  if (!x.productType) issues.push("no product type");
  if (x.status !== "ACTIVE") issues.push(`status ${x.status}`);
  if (isPlaceholder(x) && x.status === "ACTIVE") issues.push("placeholder, not linked to a supplier: import the real product and re-run, or archive it before launch");
  return issues;
}

// ---------- main ----------
console.log(`== catalogue check (${slots.length} slot${slots.length === 1 ? "" : "s"}) ==`);
let bad = 0;
for (const p of slots) {
  const problems = checkSlot(p);
  if (problems.length) { bad++; console.log(`  ${p.slot}  ${p.title}\n    - ${problems.join("\n    - ")}`); }
}
console.log(bad ? `  ${bad} slot(s) break the rules; fix store/products.json first.` : "  all slots follow the sourcing rules");
if (bad) process.exit(1);
const mix = {};
for (const p of slots) mix[p.collection] = (mix[p.collection] || 0) + 1;
console.log(`  mix: ${Object.entries(mix).map(([k, v]) => `${k} ${v}`).join(", ")}; under $15: ${slots.filter((p) => p.price < 15).length}; verified: ${slots.filter((p) => p.verified).length}/${slots.length}`);

await connect();
const products = DRY ? [] : await fetchProducts();
if (!DRY) console.log(`\n== store: ${products.length} product(s) ==`);

if (flag("--audit")) {
  for (const x of products) { const issues = auditProduct(x); if (issues.length) console.log(`  ${x.handle}: ${issues.join("; ")}`); }
  const unmatched = slots.filter((p) => findMatch(p, products).length === 0);
  console.log(`\n  ${slots.length - unmatched.length}/${slots.length} catalogue slots have a product in the store`);
  for (const p of unmatched) console.log(`  not imported yet: ${p.slot}  ${p.title}  (search: "${p.supplier.search}")`);
  process.exit(0);
}

if (!DRY) await ensureMetafieldDefinition();
const pubId = await onlineStorePublicationId();
const CREATE = flag("--create-placeholders");
const report = { pushed: [], unverified: [], missing: [], ambiguous: [], created: [], archived: [] };
for (const p of slots) {
  const matches = findMatch(p, products);
  const placeholder = findPlaceholder(p, products);
  if (DRY) { console.log(`  [dry-run] ${p.slot} → "${p.title}" $${p.price} tags=${tagsFor(p).join(",")}${p.verified ? "" : " (unverified: would skip)"}${CREATE ? " (would create placeholder if missing)" : ""}`); continue; }
  if (matches.length === 0) {
    if (CREATE && !placeholder) { const x = await createPlaceholder(p, pubId); console.log(`  ${p.slot} placeholder created: ${x.handle}`); report.created.push(p); }
    else if (CREATE && placeholder?.status === "ACTIVE") console.log(`  ${p.slot} placeholder exists: ${placeholder.handle}`);
    else report.missing.push(p);
    continue;
  }
  if (matches.length > 1) { report.ambiguous.push([p, matches]); continue; }
  if (!p.verified) { report.unverified.push([p, matches[0]]); continue; }
  console.log(`  ${p.slot} → ${matches[0].handle}: "${p.title}" $${p.price}`);
  await rewrite(p, matches[0], pubId);
  report.pushed.push(p);
  if (placeholder && placeholder.status !== "ARCHIVED") { await archive(placeholder); console.log(`    archived placeholder ${placeholder.handle}`); report.archived.push(placeholder); }
}
if (!DRY) {
  console.log(`\n== result ==\n  rewritten: ${report.pushed.length}, placeholders created: ${report.created.length}, placeholders archived: ${report.archived.length}`);
  for (const [p, x] of report.unverified) console.log(`  skipped (set verified:true after checking the supplier listing): ${p.slot} ↔ ${x.handle}`);
  for (const [p, xs] of report.ambiguous) console.log(`  ambiguous (set match.handle): ${p.slot} ↔ ${xs.map((x) => x.handle).join(", ")}`);
  for (const p of report.missing) console.log(`  not imported yet: ${p.slot}  (search: "${p.supplier.search}")`);
}
console.log(DRY ? "\nDry run complete." : "\nDone.");
