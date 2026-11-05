# Bubble Sharks — Shopify toy drop-shipping store

Store kit for **bubblesharks.com**: setup guide, brand, page copy, policies,
store configuration (collections, navigation, theme settings) and a script that
pushes all of it into Shopify through the Admin API.

Start with [`docs/SETUP-GUIDE.md`](docs/SETUP-GUIDE.md). It splits the work
into the few things only the store owner can do (account, domain DNS, payments,
supplier app) and everything Claude does once it has API access.

| Folder | What is in it |
| --- | --- |
| `docs/` | Owner setup guide and the hand-off checklist |
| `brand/` | Brand kit: name, voice, colours, fonts, logo brief |
| `content/pages/` | About, FAQ, Contact, Shipping & Returns page copy |
| `content/policies/` | Privacy, Refund, Shipping and Terms policy drafts |
| `store/` | Collections, navigation, theme settings, product sourcing rules |
| `scripts/` | `push-store.mjs` pushes `store/` and `content/` to Shopify |
