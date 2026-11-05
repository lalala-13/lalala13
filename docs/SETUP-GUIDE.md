# Setup guide — bubblesharks.com on Shopify

Yes, this is doable. Shopify hosts the store, a supplier app ships the toys,
and your domain points at Shopify. Below is the minimum you have to do yourself
(roughly 45 minutes, spread over a day because of DNS and payment checks), and
what Claude does after that.

## Part A — Things only you can do

### A1. Create the Shopify store (10 min)
1. Go to <https://www.shopify.com> and start the free trial with your email.
   Store name: **Bubble Sharks**. Pick "I'm just starting" and "Dropshipping".
2. When asked, choose the **Basic** plan. Expect about $39/month billed monthly
   (cheaper yearly), after a short trial that is $1/month for the first months.
   Check the price on Shopify's own pricing page before you commit.
3. Note your `*.myshopify.com` address (Settings → Domains). You will need it later.

### A2. Point bubblesharks.com at Shopify (10 min, then wait)
1. In Shopify admin: **Settings → Domains → Connect existing domain**, enter
   `bubblesharks.com`, click Next. Shopify shows the exact DNS records to use.
2. At your domain registrar's DNS page add exactly what Shopify shows. Today
   that is normally:
   - `A` record, host `@`, value `23.227.38.65`
   - `CNAME` record, host `www`, value `shops.myshopify.com`
   Remove any other `A` or `AAAA` record on `@` first.
3. Back in Shopify click **Verify connection**. It can take a few hours
   (occasionally up to 48) to go green. Then set `bubblesharks.com` as the
   primary domain and leave "Redirect all traffic to this domain" on.

### A3. Turn on payments (10 min)
**Settings → Payments → Activate Shopify Payments.** It asks for your identity,
business details and a bank account. Only you can do this. Also tick PayPal
if you have an account; it raises conversion on toy stores.

### A4. Install the supplier app (10 min)
Pick one. Recommended default: **Zendrop** (faster US delivery, auto-fulfils
orders). Alternatives: **CJdropshipping** (biggest catalogue, custom sourcing),
**DSers** (AliExpress, cheapest, slowest shipping), **Spocket** (US/EU suppliers,
pricier). Install it from the Shopify App Store inside your admin, sign in, and
connect it to the store. Do nothing else in the app; Claude picks the products
against the rules in `store/product-sourcing-rules.md`.

### A5. Give Claude access (10 min)
Shopify no longer lets you create new custom apps inside the admin (since
January 2026). They are made in the **Dev Dashboard** instead.

1. Shopify admin → **Settings → Apps → Develop apps** (top right). It sends you
   to the Dev Dashboard (dev.shopify.com). Sign in with the same account.
2. **Create app** → "Start from Dev Dashboard" → name it `claude-store-builder`.
3. On the version screen, under **Access → Scopes**, add:
   `write_products, read_products, write_content, read_content, write_themes,
   read_themes, write_online_store_navigation, read_online_store_navigation,
   write_publications, read_publications, read_orders, write_inventory,
   read_inventory, write_metaobjects, read_metaobjects, read_locales,
   write_shipping, read_shipping, write_discounts, read_discounts,
   write_legal_policies, read_legal_policies`.
   Leave the App URL as is. Click **Release**.
4. Back on the app's **Home**, click **Install app**, pick your store
   (`hd2ykn-1r.myshopify.com`) and approve.
5. Open the app's **Settings**. Copy the **Client ID** and **Client secret**.
6. In the Claude Code cloud environment (title bar → environment menu → Edit):
   - Add three **secrets**: `SHOPIFY_STORE` = `hd2ykn-1r.myshopify.com`,
     `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`. Never paste the secret
     into chat.
   - Under **Network access**, allow `hd2ykn-1r.myshopify.com`,
     `admin.shopify.com`, `cdn.shopify.com` and `bubblesharks.com`, or choose
     unrestricted.
7. Start a **new** session and say "build the Bubble Sharks store". The script
   swaps the client ID and secret for a short-lived token each run.

## Part B — What Claude does next (no action from you)
1. Push brand, theme settings, collections, navigation, pages and policies
   (`scripts/push-store.mjs`).
2. Pick 30–50 launch products in the supplier app against the sourcing rules,
   rewrite titles and descriptions, set prices (2.5–3× landed cost, charm
   pricing), assign collections, add age grading and safety text.
3. Set shipping (free over $50, flat $4.95 under), taxes (automatic), checkout
   settings, abandoned-cart email, order-confirmation copy.
4. Set up SEO basics, Google and Meta pixels (once you give the IDs), a launch
   discount code and a welcome pop-up.
5. Test checkout with a Bogus Gateway order, then flip the store password off.

## Part C — Things to decide (defaults in brackets, say nothing to accept)
- Target market [United States, USD]
- Supplier app [Zendrop]
- Age range focus [3–12 years]
- Launch offer [10% off first order, code `WELCOME10`]
- Support email [support@bubblesharks.com, forwarded to your Gmail]

## Ongoing cost summary
| Item | Typical cost |
| --- | --- |
| Shopify Basic | ~$39/month (less yearly) |
| Supplier app | $0–$49/month depending on app and tier |
| Domain renewal | what you already pay |
| Payment fees | ~2.9% + 30¢ per order on Shopify Payments Basic |

Policies in `content/policies/` are drafts, not legal advice. Have them checked
if you sell outside the US or into the EU/UK, where toy safety marking
(CE/UKCA) and consumer-return rules are stricter.
