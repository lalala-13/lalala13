---
notification: Abandoned checkout
where: Shopify admin → Marketing → Automations → "Recover abandoned checkout" (or Settings → Notifications → Customer notifications → Abandoned checkout on older admins)
timing: 1 hour after abandonment, one email only
---
# Abandoned checkout email

Shopify's automation and notification editors have no API, so paste this in by
hand. Liquid tags such as `{{ customer.first_name }}` work in both editors.

**Subject:** Your toys are still in the cart

**Preview text:** Free US shipping over $50, and 10% off with WELCOME10.

**Body**

Hi {{ customer.first_name | default: "there" }},

You left a few things in your Bubble Sharks cart. We saved them for you.

[Your cart items block]

Finish your order and they ship in 1–3 business days with tracking. Orders
over $50 ship free, and first orders get 10% off with the code **WELCOME10**.

[Button: Return to your cart → {{ url }}]

Questions about an age grade or a delivery date? Reply to this email or write
to support@bubblesharks.com. A real person answers within one business day.

Bubble Sharks
Big fun, little prices.
