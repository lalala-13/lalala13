# Bubble Sharks — Shopify toy drop-shipping store

Store kit for **bubblesharks.com**: setup guide, brand, page copy, policies,
store configuration (collections, navigation, theme settings) and a script that
pushes all of it into Shopify through the Admin API.

Start with [`docs/SETUP-GUIDE.md`](docs/SETUP-GUIDE.md). It splits the work
into the few things only the store owner can do (account, domain DNS, payments,
supplier app) and everything Claude does once it has API access.

| Folder | What is in it |
| --- | --- |
| `docs/` | Owner setup guide (`SETUP-GUIDE.md`) and the launch hand-off checklist (`HANDOFF-CHECKLIST.md`) |
| `brand/` | Brand kit (name, voice, colours, fonts, logo brief), SVG logo drafts and the generated PNG set in `images/` (logo, favicon, hero, collection and placeholder images) |
| `content/pages/` | About, FAQ, Contact, Shipping & Returns page copy |
| `content/policies/` | Privacy, Refund, Shipping and Terms policy drafts |
| `content/emails/` | Abandoned-checkout and order-confirmation email copy (pasted into Shopify by hand) |
| `content/blog/` | Launch guides for the Guides blog (front matter: handle, title, summary, tags) |
| `store/` | Collections, navigation, theme settings, shipping rates, discount codes, SEO text, product sourcing rules and the 36-slot launch catalogue (`products.json`) |
| `scripts/` | `push-store.mjs` pushes `store/` and `content/` to Shopify; `push-products.mjs` creates placeholders, rewrites imported products and audits the store; `make-images.mjs` renders the brand PNGs; `push-images.mjs` uploads them; `lib/` shared helpers |

## Commands

```bash
node scripts/push-store.mjs --dry-run              # preview everything
node scripts/push-store.mjs                        # pages, policies, collections, menus, shipping, discount, theme, blog
node scripts/push-store.mjs --only shipping,theme  # a subset
node scripts/push-products.mjs --dry-run           # validate store/products.json against the sourcing rules
node scripts/push-products.mjs --create-placeholders  # one placeholder product per slot that has none yet
node scripts/push-products.mjs                     # rewrite verified, matched products, archive their placeholders
node scripts/push-products.mjs --audit             # list store products that break the rules or are placeholders
node scripts/make-images.mjs                       # render brand/images/*.png (needs Playwright + Chromium)
node scripts/push-images.mjs                       # upload them: logo, favicon, hero, collection and placeholder images
```

Needs Node 20+ and the `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`
environment variables (or `SHOPIFY_ADMIN_TOKEN`). No npm install.
