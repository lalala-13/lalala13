// Pure functions that turn store/theme-settings.json into Dawn theme files.
// Input: { "config/settings_data.json": string, "config/settings_schema.json": string, "templates/index.json": string, ... }
// Output: the same keys with new JSON strings. Nothing here talks to Shopify, so it can be tested on a local Dawn copy.

export const THEME_FILES = [
  "config/settings_schema.json", "config/settings_data.json", "templates/index.json", "templates/product.json",
  "sections/header-group.json", "sections/footer-group.json",
];

const parse = (s, fallback) => (s ? JSON.parse(s) : fallback);
const html = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Builds `id -> {min, max}` for every range setting in settings_schema.json so values stay inside what the editor allows.
export function schemaRanges(schemaJson) {
  const ranges = {};
  for (const group of parse(schemaJson, [])) {
    for (const s of group.settings || []) if (s.type === "range") ranges[s.id] = { min: s.min, max: s.max, step: s.step || 1 };
  }
  return ranges;
}
const clamp = (ranges, id, v) => {
  const r = ranges[id];
  if (!r || typeof v !== "number") return v;
  const c = Math.min(r.max, Math.max(r.min, v));
  return Math.round(c / r.step) * r.step;
};

// Five colour schemes derived from the brand palette (Dawn's defaults use schemes 1–5 across its sections).
export function colorSchemes(c) {
  const white = "#FFFFFF";
  return {
    "scheme-1": { settings: { background: c.background, background_gradient: "", text: c.text, button: c.button, button_label: c.button_label, secondary_button_label: c.button, shadow: c.text } },
    "scheme-2": { settings: { background: c.secondary_background, background_gradient: "", text: c.text, button: c.button, button_label: c.button_label, secondary_button_label: c.text, shadow: c.text } },
    "scheme-3": { settings: { background: c.text, background_gradient: "", text: c.background, button: c.highlight, button_label: c.text, secondary_button_label: c.background, shadow: c.text } },
    "scheme-4": { settings: { background: c.accent, background_gradient: "", text: white, button: white, button_label: c.accent, secondary_button_label: white, shadow: c.text } },
    "scheme-5": { settings: { background: c.button, background_gradient: "", text: white, button: c.highlight, button_label: c.text, secondary_button_label: white, shadow: c.text } },
  };
}

export function mergeSettingsData(json, schemaJson, cfg) {
  const data = parse(json, { current: {} });
  // "current" may be the name of a preset; materialise it so edits do not touch the preset.
  const current = typeof data.current === "string" ? structuredClone(data.presets?.[data.current] || {}) : data.current || {};
  const ranges = schemaRanges(schemaJson);
  Object.assign(current, {
    color_schemes: { ...(current.color_schemes || {}), ...colorSchemes(cfg.colors) },
    type_header_font: cfg.typography.heading_font,
    type_body_font: cfg.typography.body_font,
    heading_scale: clamp(ranges, "heading_scale", cfg.typography.heading_scale),
    body_scale: clamp(ranges, "body_scale", cfg.typography.body_scale),
    page_width: clamp(ranges, "page_width", cfg.layout.page_width),
    buttons_radius: clamp(ranges, "buttons_radius", cfg.layout.button_radius),
    inputs_radius: clamp(ranges, "inputs_radius", cfg.layout.border_radius),
    text_boxes_radius: clamp(ranges, "text_boxes_radius", cfg.layout.border_radius),
    media_radius: clamp(ranges, "media_radius", cfg.layout.border_radius),
    popup_corner_radius: clamp(ranges, "popup_corner_radius", cfg.layout.border_radius),
    card_style: cfg.layout.card_style,
    card_image_padding: clamp(ranges, "card_image_padding", cfg.layout.card_image_padding),
    card_corner_radius: clamp(ranges, "card_corner_radius", cfg.layout.border_radius),
    card_color_scheme: "scheme-2",
    collection_card_style: cfg.layout.card_style,
    collection_card_image_padding: clamp(ranges, "collection_card_image_padding", cfg.layout.card_image_padding),
    collection_card_corner_radius: clamp(ranges, "collection_card_corner_radius", cfg.layout.border_radius),
    collection_card_color_scheme: "scheme-2",
    collection_card_text_alignment: "center",
    badge_corner_radius: clamp(ranges, "badge_corner_radius", 40),
    sale_badge_color_scheme: "scheme-4",
    sold_out_badge_color_scheme: "scheme-3",
    cart_type: "drawer",
    show_vendor: !!cfg.product_page.show_vendor,
    predictive_search_enabled: true,
    animations_hover_elements: "vertical-lift",
  });
  if (cfg.brand?.headline !== undefined) current.brand_headline = cfg.brand.headline;
  if (cfg.brand?.description !== undefined) current.brand_description = `<p>${html(cfg.brand.description)}</p>`;
  data.current = current;
  return JSON.stringify(data, null, 2);
}

// Homepage. Hero uses Dawn's rich-text section (a solid brand-colour block) until the owner uploads a banner image.
export function buildIndex(cfg) {
  const sections = {};
  const order = [];
  const add = (key, section) => { sections[key] = section; order.push(key); };
  cfg.homepage_sections.forEach((s, i) => {
    const key = `${s.type.replace(/-/g, "_")}_${i + 1}`;
    if (s.type === "image-banner") {
      add(key, {
        type: "rich-text",
        blocks: {
          heading: { type: "heading", settings: { heading: s.heading, heading_size: "hxl" } },
          text: { type: "text", settings: { text: `<p>${html(s.subheading)}</p>` } },
          button: { type: "button", settings: { button_label: s.cta.label, button_link: s.cta.url, button_style_secondary: false, button_label_2: "", button_link_2: "", button_style_secondary_2: false } },
        },
        block_order: ["heading", "text", "button"],
        settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "scheme-5", full_width: true, padding_top: 64, padding_bottom: 72 },
      });
    } else if (s.type === "collection-list") {
      const blocks = Object.fromEntries(s.collections.map((h, j) => [`collection_${j + 1}`, { type: "featured_collection", settings: { collection: h } }]));
      add(key, {
        type: "collection-list", blocks, block_order: Object.keys(blocks),
        settings: { title: s.heading || "Shop by type", heading_size: "h1", image_ratio: "square", columns_desktop: 3, color_scheme: "scheme-1", show_view_all: false, columns_mobile: "2", swipe_on_mobile: true, padding_top: 36, padding_bottom: 36 },
      });
    } else if (s.type === "featured-collection") {
      add(key, {
        type: "featured-collection",
        settings: { collection: s.collection, products_to_show: 8, title: s.heading, heading_size: "h1", description: "", show_description: false, description_style: "body", columns_desktop: 4, enable_desktop_slider: false, full_width: false, show_view_all: true, view_all_style: "solid", color_scheme: "scheme-1", image_ratio: "square", image_shape: "default", show_secondary_image: true, show_vendor: false, show_rating: false, quick_add: "standard", columns_mobile: "2", swipe_on_mobile: true, padding_top: 36, padding_bottom: 36 },
      });
    } else if (s.type === "multicolumn") {
      const blocks = Object.fromEntries(s.columns.map((c, j) => [`column_${j + 1}`, { type: "column", settings: { title: c.title, text: `<p>${html(c.text)}</p>`, link_label: "", link: "" } }]));
      add(key, {
        type: "multicolumn", blocks, block_order: Object.keys(blocks),
        settings: { title: s.heading, heading_size: "h1", image_width: "third", image_ratio: "adapt", columns_desktop: 3, column_alignment: "center", background_style: "primary", button_label: "", button_link: "", color_scheme: "scheme-2", columns_mobile: "1", swipe_on_mobile: false, padding_top: 36, padding_bottom: 36 },
      });
    } else if (s.type === "newsletter") {
      add(key, {
        type: "newsletter",
        blocks: {
          heading: { type: "heading", settings: { heading: s.heading, heading_size: "h1" } },
          paragraph: { type: "paragraph", settings: { text: `<p>${html(s.text)}</p>` } },
          email_form: { type: "email_form", settings: {} },
        },
        block_order: ["heading", "paragraph", "email_form"],
        settings: { color_scheme: "scheme-2", full_width: true, padding_top: 40, padding_bottom: 52 },
      });
    } else throw new Error(`Unknown homepage section type: ${s.type}`);
  });
  return JSON.stringify({ sections, order }, null, 2);
}

// Product page: keep Dawn's section settings and the sections after "main", replace main's blocks with ours.
export function mergeProduct(json, cfg) {
  const t = parse(json, { sections: { main: { type: "main-product", settings: {} } }, order: ["main"] });
  const main = Object.values(t.sections).find((s) => s.type === "main-product");
  if (!main) throw new Error("templates/product.json has no main-product section");
  const pp = cfg.product_page;
  const blocks = {};
  for (const b of pp.blocks) {
    if (b === "buy_buttons" && pp.show_quantity) blocks.quantity_selector = { type: "quantity_selector" };
    if (b.startsWith("collapsible:")) {
      const heading = b.slice("collapsible:".length);
      const c = pp.collapsibles?.[heading] || {};
      const key = `collapsible_${Object.keys(blocks).filter((k) => k.startsWith("collapsible_")).length + 1}`;
      blocks[key] = { type: "collapsible_tab", settings: { heading, icon: c.icon || "check_mark", content: c.source ? `<p>{{ ${c.source}.value }}</p>` : c.content || "", page: "" } };
    } else if (b === "variant_picker") blocks[b] = { type: b, settings: { picker_type: "button", swatch_shape: "circle" } };
    else if (b === "buy_buttons") blocks[b] = { type: b, settings: { show_dynamic_checkout: true, show_gift_card_recipient: false } };
    else if (b === "share") { if (pp.show_share) blocks[b] = { type: b, settings: { share_label: "Share" } }; }
    else blocks[b] = { type: b };
  }
  if (pp.show_share && !blocks.share) blocks.share = { type: "share", settings: { share_label: "Share" } };
  main.blocks = blocks;
  main.block_order = Object.keys(blocks);
  main.settings = { ...main.settings, enable_sticky_info: !!pp.sticky_add_to_cart, hide_variants: true, media_size: "medium", image_zoom: "lightbox", gallery_layout: "thumbnail_slider", mobile_thumbnails: "show" };
  return JSON.stringify(t, null, 2);
}

// Header group: one announcement, US-only selectors off, main menu wired up.
export function mergeHeaderGroup(json, cfg) {
  const g = parse(json, { type: "header", sections: {}, order: [] });
  let bar = Object.entries(g.sections).find(([, s]) => s.type === "announcement-bar");
  if (!bar) { g.sections["announcement-bar"] = { type: "announcement-bar", settings: {} }; g.order.unshift("announcement-bar"); bar = ["announcement-bar", g.sections["announcement-bar"]]; }
  const [, barSection] = bar;
  barSection.blocks = { announcement_1: { type: "announcement", settings: { text: cfg.announcement_bar, link: "" } } };
  barSection.block_order = ["announcement_1"];
  barSection.settings = { ...barSection.settings, color_scheme: "scheme-5", show_line_separator: false, show_social: false, auto_rotate: false, enable_country_selector: false, enable_language_selector: false };
  const header = Object.values(g.sections).find((s) => s.type === "header");
  if (header) header.settings = { ...header.settings, menu: "main-menu", menu_type_desktop: "dropdown", logo_position: "middle-left", color_scheme: "scheme-1", menu_color_scheme: "scheme-1", enable_country_selector: false, enable_language_selector: false, sticky_header_type: "on-scroll-up" };
  return JSON.stringify(g, null, 2);
}

// Footer group: help links (footer menu), a short brand blurb, newsletter on, selectors off.
export function mergeFooterGroup(json, cfg) {
  const g = parse(json, { type: "footer", sections: { footer: { type: "footer", settings: {} } }, order: ["footer"] });
  const footer = Object.values(g.sections).find((s) => s.type === "footer");
  if (!footer) throw new Error("sections/footer-group.json has no footer section");
  const f = cfg.footer;
  footer.blocks = {
    links: { type: "link_list", settings: { heading: f.links_heading, menu: "footer" } },
    about: { type: "text", settings: { heading: f.about_heading, subtext: f.about_text.map((p) => `<p>${html(p)}</p>`).join("") } },
  };
  footer.block_order = ["links", "about"];
  footer.settings = { ...footer.settings, color_scheme: "scheme-3", newsletter_enable: true, newsletter_heading: f.newsletter_heading, enable_follow_on_shop: true, show_social: false, enable_country_selector: false, enable_language_selector: false, payment_enable: true, show_policy: true };
  return JSON.stringify(g, null, 2);
}

// Returns { filename: newContent } for every file we manage. `files` holds the theme's current content.
export function buildThemeFiles(files, cfg) {
  return {
    "config/settings_data.json": mergeSettingsData(files["config/settings_data.json"], files["config/settings_schema.json"], cfg),
    "templates/index.json": buildIndex(cfg),
    "templates/product.json": mergeProduct(files["templates/product.json"], cfg),
    "sections/header-group.json": mergeHeaderGroup(files["sections/header-group.json"], cfg),
    "sections/footer-group.json": mergeFooterGroup(files["sections/footer-group.json"], cfg),
  };
}
