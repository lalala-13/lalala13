---
notification: Order confirmation
where: Shopify admin → Settings → Notifications → Customer notifications → Order confirmation → Edit (text blocks only; keep the order summary, address and payment blocks)
---
# Order confirmation email

**Subject:** Order {{ name }} is in. Thank you!

**Intro (above the order summary)**

Hi {{ customer.first_name | default: "there" }},

We got your order and the sharks are already circling the warehouse. Here is
what happens next:

- **Processing:** 1–3 business days.
- **Delivery:** 5–12 business days after dispatch. We email a tracking link
  the moment the parcel ships. Items in the same order can arrive separately;
  you pay shipping only once.
- **Changed your mind?** Reply to this email within 24 hours and we will try
  to catch it before it ships. After delivery you have 30 days to return
  unused items in their packaging.

**Footer (below the summary)**

Every toy says who it is for. Please check the age grade on the product page
before handing it over, and keep small parts away from younger siblings.

Questions: support@bubblesharks.com, answered within one business day.

Bubble Sharks · bubblesharks.com
