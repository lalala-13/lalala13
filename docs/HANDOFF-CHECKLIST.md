# Hand-off checklist — Bubble Sharks launch

What is automated, what the owner still has to click, and in which order.
Companion to `SETUP-GUIDE.md`. Tick items top to bottom.

## 0. Status (2026-11-05, night)

Live on `hd2ykn-1r.myshopify.com`, behind the store password: the four pages
with meta titles, the 12 collections with SEO, both menus, US shipping
($4.95 up to $49.99, free from $50), the `WELCOME10` code, the Age & safety
product metafield, the Horizon theme branding (palette, Fredoka/Nunito,
announcement bar, homepage, product-page tabs, footer) and **36 placeholder
products**, one per catalogue slot, with the final copy, prices and tags so
every collection and the homepage can be reviewed.

Placeholders are tagged `placeholder` and `slot:<slot>`, have no images and
no supplier behind them. **Keep the store password on until each one is
replaced** (section 3): when a real supplier product for a slot is rewritten,
the script archives the placeholder itself. Not yet: policies (1), the
admin-only settings (4), the test order and launch (5, 6).

## 1. Policies and store name (owner, 3 minutes)

New stores let Shopify generate the policies ("automatic management"), which
blocks the API from replacing them with ours.

- [x] Install the Dev Dashboard app on the store (done 2026-11-05).
- [ ] **Settings → Policies:** open Privacy, Refund, Shipping and Terms in
      turn and switch off automatic management. Then Claude runs
      `node scripts/push-store.mjs --only policies`, or run it yourself.
- [ ] **Settings → Store details:** store name `Bubble Sharks` (it is still
      "My Store"), customer-facing email `support@bubblesharks.com`. Neither
      is reachable through the API.

## 2. One command pushes the store skeleton (Claude, 1 minute)

```bash
node scripts/push-store.mjs
```

Idempotent, safe to re-run. It sets:

| Step | What it writes | Source |
| --- | --- | --- |
| pages | About, FAQ, Contact (contact form template), Shipping & Returns, with meta titles | `content/pages/`, `store/seo.json` |
| policies | Privacy, Refund, Shipping, Terms | `content/policies/` |
| collections | 12 automated collections (by tag / price) with SEO, published to Online Store | `store/collections.json` |
| menus | Main menu (by type, by age, Under $15, New, About) and footer menu | `store/navigation.json` |
| shipping | US zone: $4.95 flat up to $49.99, free from $50; existing rates in that zone are replaced | `store/shipping.json` |
| discount | `WELCOME10`, 10% off, once per customer, stacks with shipping discounts only | `store/discounts.json` |
| theme | Brand colours, Fredoka/Nunito, rounded corners, announcement bar, homepage sections, product page tabs, footer; Horizon (the store's theme) and Dawn are supported | `store/theme-settings.json` |

The theme step edits the live theme's JSON files and keeps the originals in
`.backup/theme/<timestamp>/`. To preview the merge without a store:
`node scripts/push-store.mjs --dry-run --only theme --theme-dir <theme checkout>`.

- [ ] Run it. Check `bubblesharks.com` (or the `.myshopify.com` preview with
      the password) for: menu, footer links, policies in the footer, the
      announcement bar, the About page.

## 3. Products (owner in the supplier app + Claude, 1–2 hours)

`store/products.json` holds 36 launch slots that follow
`store/product-sourcing-rules.md` (7 bath, 5 outdoor, 7 STEM, 5 plush,
6 sensory, 6 games; 16 under $15; every title, price, tag and description is
written). Each slot names what to search for in Zendrop and the highest landed
cost that keeps the price inside 2.5–3× with a $6 margin after fees.

Per slot (the placeholder product in the store shows the finished listing):
- [ ] Search the supplier app with `supplier.search`; keep only a listing that
      passes every **Must** rule (age grade, US safety docs, ≤ 12 business
      days shipping with tracking, supplier rating, no licensed characters,
      4+ photos). Import it to the store. It arrives as a second product with
      the supplier's title; leave the placeholder alone.
- [ ] In `store/products.json` fill `match.handle`, `supplier.landedCost` and
      `safetyDocs`; correct `ageLabel`, `materials`, `inTheBox` and the
      supervision note if the supplier page says otherwise; set
      `verified: true`. If the landed cost is above `landedCostTarget`, raise
      `price` to the next x.95 (the script tells you).
- [ ] `node scripts/push-products.mjs` rewrites every verified, matched product
      (title, description, tags, type, price on all variants, SEO, the
      Age & safety tab), publishes it and archives that slot's placeholder.
      Unverified or unmatched slots are listed, nothing else is touched.
- [ ] `node scripts/push-products.mjs --audit` lists any store product that
      breaks the rules (missing tags, odd prices, no Age & safety) and every
      placeholder still live. It must list no placeholders before launch.
      A slot you decide not to stock: archive its placeholder in the admin.

Claude can do the JSON edits and both commands; only the supplier-app browsing
and import need the owner's login. Products carry the `new` tag at launch; add
`bestseller` by hand once an item has 10+ orders (it feeds the Best Sellers
collection and the homepage).

## 4. Settings only the admin UI can change (owner, 20 minutes)

- [ ] **Online Store → Preferences:** paste the homepage title and meta
      description from `store/seo.json` → `homepage`. Leave the password page
      on until step 6.
- [ ] **Settings → Taxes and duties → United States:** "Collect sales tax" in
      the state where the business is registered; Shopify calculates the rest
      automatically. No action for other states until you cross their
      thresholds.
- [ ] **Settings → Checkout:** phone number optional, tipping off, customer
      accounts optional, address autocompletion on. **Customize** the checkout:
      logo centred, accent `#0E6BA8` (the app scopes do not cover checkout
      branding).
- [ ] **Settings → Notifications → Order confirmation:** paste the copy from
      `content/emails/order-confirmation.md` into the text blocks.
- [ ] **Marketing → Automations → Recover abandoned checkout:** turn on, one
      email after 1 hour, copy from `content/emails/abandoned-checkout.md`.
- [ ] **Pixels:** install the **Google & YouTube** and **Facebook & Instagram**
      apps from the App Store and sign in; they add the pixels without pasting
      IDs. If you already have a GA4 measurement ID or Meta pixel ID, give it
      to Claude and it goes into Settings → Customer events instead.
- [ ] **Welcome pop-up:** install **Shopify Forms** (free), create a pop-up
      offering 10% off with `WELCOME10`, show after 8 seconds, once per
      visitor. The homepage and footer newsletter blocks already collect
      emails without it.
- [ ] **Theme editor (Online Store → Themes → Customize):** upload the logo
      (brief in `brand/brand-kit.md`). The homepage opens with a solid
      blue block instead of a photo; once you have a hero image, add a
      Horizon "Hero" section above it and delete the blue block. Give each
      collection an image (automated collections otherwise show their first
      product's photo). The homepage's first product row shows New Arrivals;
      once items carry the `bestseller` tag, switch it to Best Sellers in
      `store/theme-settings.json` and re-run `--only theme`.
- [ ] **Settings → Store details:** support email `support@bubblesharks.com`,
      forwarded to your Gmail; customer-facing email the same.

## 5. Test order (owner, 10 minutes)

- [ ] **Settings → Payments → Shopify Payments → Manage → Test mode** on
      (or, if Shopify Payments is not active yet, add the **Bogus Gateway**
      under third-party providers).
- [ ] Place an order on the storefront: one product under $50 (expect $4.95
      shipping), then add items past $50 (expect free shipping), apply
      `WELCOME10`. Test card `4242 4242 4242 4242`, any future date, CVC 111
      (Bogus Gateway: card number `1`).
- [ ] Check the order confirmation email arrives with the copy from step 4,
      that the order appears in Zendrop for fulfilment, then cancel and
      refund the test order and turn test mode off.

## 6. Launch

- [ ] **Online Store → Preferences:** untick "Restrict access to visitors
      with the password".
- [ ] Open `https://bubblesharks.com` in a private window: homepage, a
      collection, a product page, the cart, checkout as far as payment.
- [ ] `node scripts/push-products.mjs --audit` one last time.

## Later

- Month two: replace supplier photos on the hero products with lifestyle
  shots (`brand/brand-kit.md` → Photography).
- Before selling outside the US: have the policies reviewed (CE/UKCA marking,
  EU/UK return rules) and add zones to `store/shipping.json`.
- When a slot sells out or a supplier fails the Must rules: pick a
  replacement, update the slot, re-run `push-products`.
