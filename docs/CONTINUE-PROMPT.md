# Prompt for continuing the Bubble Sharks build on a local machine

Copy everything below the line into a new Claude Code session on your own
computer, inside a clone of this repository, after setting the three
environment variables described in step 1. Nothing in it is secret.

---

You are continuing the build of the Bubble Sharks Shopify store (a US toy
drop-shipping shop for ages 3–12, bubblesharks.com). A previous session built
most of it from this repository and pushed everything to the branch
`claude/elegant-archimedes-x96xuv` of `lalala-13/lalala13`. Work on that
branch, commit often with clear messages, and push to it.

## 1. Read first, then check the live store

1. Read `README.md`, `docs/HANDOFF-CHECKLIST.md` (the ordered launch
   checklist with live status), `docs/SETUP-GUIDE.md`, `brand/brand-kit.md`
   and `store/product-sourcing-rules.md`.
2. The scripts need three environment variables in this shell:
   `SHOPIFY_STORE` = `hd2ykn-1r.myshopify.com`, `SHOPIFY_CLIENT_ID` and
   `SHOPIFY_CLIENT_SECRET` from dev.shopify.com → app `claude-store-builder`
   → Settings. If they are not set, ask me to set them in the terminal
   (PowerShell: `$env:SHOPIFY_CLIENT_ID = "..."`); never ask me to paste
   secrets into the chat and never write them into a file.
3. Run `node scripts/status.mjs` and `node scripts/push-products.mjs --audit`
   and tell me, in a few lines, what is live and what is still missing. Do not
   assume the state described in the docs is current: the store may have
   changed since 2026-11-05.

## 2. What exists

- `scripts/push-store.mjs` pushes pages, policies, collections, menus,
  shipping, the WELCOME10 code, the Horizon theme branding and the Guides
  blog. Idempotent; `--dry-run` previews; `--only step,step` selects steps.
- `scripts/push-products.mjs` validates `store/products.json` (36 launch
  slots written to the sourcing rules), rewrites supplier-imported products
  that match a slot, creates placeholder products (`--create-placeholders`),
  archives a slot's placeholder once its real product is rewritten, and
  audits the store (`--audit`).
- `scripts/make-images.mjs` renders the brand PNGs (logo, favicon, hero,
  collection and placeholder images) with Playwright; `scripts/push-images.mjs`
  uploads them. Only needed if the brand images change.
- `store/theme-settings.json` is the source of truth for the theme; edit it
  and re-run `--only theme` instead of editing the theme in Shopify by hand.
- Content lives in `content/` (pages, policies, emails, blog) as Markdown.

As of 2026-11-05, live behind the store password: pages, 12 collections with
images and SEO, menus, shipping ($4.95 under $50, free from $50), WELCOME10,
Horizon branding with generated logo/favicon/hero, a branded password page,
three blog guides and 36 placeholder products with "photo coming soon"
images. Not done: policies (Shopify's automatic management must be switched
off by the owner), store name and email, the custom domain, real products,
pixels, checkout settings, notification emails, the test order, launch.

## 3. What to do next, in order

1. Policies: ask me to open Settings → Policies and switch off automatic
   management for Privacy, Refund, Shipping and Terms, then run
   `node scripts/push-store.mjs --only policies`.
2. Store details: ask me to rename the store to Bubble Sharks and set the
   customer email to support@bubblesharks.com (not possible through the API).
3. Products: for each slot in `store/products.json`, I import a matching
   listing from the supplier app (Zendrop). You then fill `match.handle`,
   `supplier.landedCost` and `safetyDocs`, correct `ageLabel`, `materials`,
   `inTheBox` and the supervision note against the supplier page, set
   `verified: true`, and run `node scripts/push-products.mjs`. Raise the price
   to the next x.95 when the landed cost is above `landedCostTarget` (the
   script tells you). Keep the store password on while any placeholder is
   active (`--audit` lists them).
4. Walk me through the admin-only items in `docs/HANDOFF-CHECKLIST.md`
   section 4 (homepage meta text from `store/seo.json`, taxes, checkout,
   notification emails from `content/emails/`, pixels via the Google &
   YouTube and Facebook & Instagram apps, the Shopify Forms pop-up), then
   the test order (section 5) and launch (section 6).
5. Once items carry the `bestseller` tag, point the homepage's first product
   row at `best-sellers` in `store/theme-settings.json` and re-run
   `--only theme`.

## 4. Rules

- Everything you change in the store should be reproducible from this
  repository: edit the JSON/Markdown sources and run the scripts.
- Never switch off the store password, delete the archived "Bubble Sharks
  brand assets" product (it holds the logo and hero in Files), or set
  `verified: true` on a slot you have not checked against the supplier page.
- Toy safety text must match the supplier's documentation; do not invent
  materials or certifications.
- Report test and script output honestly; if a step fails, show the error.
