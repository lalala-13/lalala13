#!/usr/bin/env node
// Read-only snapshot of the live store: what is set up, what is still missing. Safe to run any time.
//   SHOPIFY_STORE=... SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... node scripts/status.mjs
import { connect, gql } from "./lib/shopify.mjs";

await connect();
const d = await gql(`{
  shop { name myshopifyDomain primaryDomain { host } currencyCode email }
  productsCount { count }
  placeholders: productsCount(query:"tag:placeholder status:active") { count }
  real: productsCount(query:"-tag:placeholder -tag:internal status:active") { count }
  pages(first:20){ nodes{ handle isPublished } }
  menus(first:10){ nodes{ handle items { title } } }
  collections(first:30){ nodes{ handle productsCount { count } image { url } } }
  blogs(first:5){ nodes{ handle articles(first:20){ nodes{ handle } } } }
  deliveryProfiles(first:5){ nodes{ name default profileLocationGroups{ locationGroupZones(first:10){ nodes{ zone{ name } methodDefinitions(first:10){ nodes{ name active rateProvider { ... on DeliveryRateDefinition { price { amount } } } } } } } } } }
  codeDiscountNodeByCode(code:"WELCOME10"){ codeDiscount { ... on DiscountCodeBasic { status } } }
  themes(first:5){ nodes{ name role } }
  metafieldDefinitions(first:5, ownerType:PRODUCT, namespace:"custom"){ nodes{ key } }
}`);
const s = d.shop;
console.log(`Store: ${s.name} (${s.myshopifyDomain}) → ${s.primaryDomain.host} | ${s.currencyCode} | ${s.email}`);
console.log(`Theme: ${d.themes.nodes.map((t) => `${t.name}:${t.role}`).join(", ")}`);
console.log(`Products: ${d.productsCount.count} total, ${d.real.count} real, ${d.placeholders.count} placeholders still active`);
console.log(`Pages: ${d.pages.nodes.map((p) => p.handle + (p.isPublished ? "" : " (unpublished)")).join(", ")}`);
for (const m of d.menus.nodes) console.log(`Menu ${m.handle}: ${m.items.map((i) => i.title).join(" | ")}`);
console.log(`Collections: ${d.collections.nodes.map((c) => `${c.handle}(${c.productsCount.count}${c.image ? "" : ", no image"})`).join(" ")}`);
for (const b of d.blogs.nodes) console.log(`Blog ${b.handle}: ${b.articles.nodes.length} post(s)`);
for (const p of d.deliveryProfiles.nodes) for (const g of p.profileLocationGroups) for (const z of g.locationGroupZones.nodes)
  console.log(`Shipping (${p.name}${p.default ? ", default" : ""}) ${z.zone.name}: ${z.methodDefinitions.nodes.map((m) => `${m.name} $${m.rateProvider.price?.amount}${m.active ? "" : " (inactive)"}`).join(" | ")}`);
console.log(`WELCOME10: ${d.codeDiscountNodeByCode?.codeDiscount?.status || "missing"} | Age & safety metafield: ${d.metafieldDefinitions.nodes.some((m) => m.key === "age_safety") ? "defined" : "missing"}`);
console.log(`\nStill owner-only: store name/email (Settings → Store details), policies (Settings → Policies → turn off automatic management, then push-store --only policies), domain (Settings → Domains), supplier imports, pixels, checkout settings, notification emails, test order, password off. See docs/HANDOFF-CHECKLIST.md.`);
