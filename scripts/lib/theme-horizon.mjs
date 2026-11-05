// Pure functions that turn store/theme-settings.json into Horizon theme files (Shopify's default theme since 2025).
// Same contract as theme.mjs (Dawn): input { filename: content }, output { filename: newContent }.
// Horizon pages are built from nested theme blocks, so the homepage is assembled from the theme's own presets.

export const HORIZON_FILES = [
  "config/settings_schema.json", "config/settings_data.json", "templates/index.json", "templates/product.json",
  "sections/header-group.json", "sections/footer-group.json",
];

const strip = (s) => s.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""); // Horizon files start with an auto-generated comment
const parse = (s, fallback) => (s ? JSON.parse(strip(s)) : fallback);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const WHITE = "#FFFFFF";

export function schemaRanges(schemaJson) {
  const ranges = {};
  for (const group of parse(schemaJson, [])) for (const s of group.settings || []) if (s.type === "range") ranges[s.id] = { min: s.min, max: s.max, step: s.step || 1 };
  return ranges;
}
const clamp = (ranges, id, v) => { const r = ranges[id]; if (!r) return v; const c = Math.min(r.max, Math.max(r.min, v)); return Math.round(c / r.step) * r.step; };

// ---------- building blocks (settings copied from Horizon's own presets) ----------
const PAD = { "padding-block-start": 0, "padding-block-end": 0, "padding-inline-start": 0, "padding-inline-end": 0 };
const text = (html, { preset = "rte", align = "left", width = "100%", color = "", max = "normal", padEnd = 0 } = {}) => ({
  type: "text",
  settings: { text: html, width, max_width: max, alignment: align, type_preset: preset, font: "var(--font-body--family)", font_size: "1rem", line_height: "normal",
    letter_spacing: "normal", case: "none", wrap: "pretty", text_color: color, background: false, background_color: "#00000026", corner_radius: 0, ...PAD, "padding-block-end": padEnd },
});
const button = (label, link, { bg, fg } = {}) => ({
  type: "button",
  settings: { label, link, open_in_new_tab: false, style_class: bg ? "button-custom" : "button", custom_button_background: bg || "{{ settings.color_palette.foreground }}",
    custom_button_text: fg || "{{ settings.color_palette.background }}", custom_button_border: bg || "{{ settings.color_palette.foreground }}",
    width: "fit-content", custom_width: 100, width_mobile: "fit-content", custom_width_mobile: 100 },
});
const group = (blocks, { direction = "column", align = "flex-start", gap = 12, width = "fill", bg = "", radius = 0, pad = 0 } = {}) => ({
  type: "group",
  settings: { content_direction: direction, vertical_on_mobile: true, horizontal_alignment: align, vertical_alignment: "center", align_baseline: false,
    horizontal_alignment_flex_direction_column: align, vertical_alignment_flex_direction_column: "center", gap, width, custom_width: 100, width_mobile: "fill", custom_width_mobile: 100,
    height: "fit", custom_height: 100, background_media: "none", background_color: bg, video_position: "cover", background_image_position: "cover", toggle_overlay: false,
    overlay_color: "#00000026", overlay_style: "solid", gradient_direction: "to top", border: "none", border_width: 1, border_opacity: 100, border_color: "", border_radius: radius,
    open_in_new_tab: false, placeholder: "", "padding-block-start": pad, "padding-block-end": pad, "padding-inline-start": pad, "padding-inline-end": pad },
  blocks, block_order: Object.keys(blocks),
});
const section = (blocks, { direction = "column", align = "flex-start", gap = 16, height = "", bg = "", padTop = 48, padBottom = 48 } = {}) => ({
  type: "section",
  blocks, block_order: Object.keys(blocks),
  settings: { content_direction: direction, vertical_on_mobile: true, horizontal_alignment: align, vertical_alignment: "center", align_baseline: false,
    horizontal_alignment_flex_direction_column: align, vertical_alignment_flex_direction_column: "center", gap, section_width: "page-width", section_height: height, section_height_custom: 50,
    background_media: "none", background_color: bg, video_position: "cover", background_image_position: "cover", toggle_overlay: false, overlay_color: "#00000026", overlay_style: "solid",
    gradient_direction: "to top", border: "none", border_width: 1, border_opacity: 100, border_color: "", border_radius: 0, "padding-block-start": padTop, "padding-block-end": padBottom },
});

// ---------- settings_data.json ----------
export function mergeSettingsData(json, schemaJson, cfg) {
  const data = parse(json, { current: {} });
  const current = typeof data.current === "string" ? structuredClone(data.presets?.[data.current] || {}) : data.current || {};
  const r = schemaRanges(schemaJson);
  const c = cfg.colors;
  const t = cfg.typography;
  Object.assign(current, {
    color_palette: { background: c.background, foreground: c.text, color1: c.button, color2: c.secondary_background },
    type_body_font: t.body_font, type_subheading_font: t.subheading_font, type_heading_font: t.heading_font, type_accent_font: t.heading_font,
    type_size_paragraph: "16", page_width: "normal",
    palette_primary_button_background: c.button, palette_primary_button_text: c.button_label, palette_primary_button_border: c.button, primary_button_border_width: 0,
    button_border_radius_primary: clamp(r, "button_border_radius_primary", 100),
    palette_secondary_button_background: "rgba(0,0,0,0)", palette_secondary_button_text: c.button, palette_secondary_button_border: c.button, secondary_button_border_width: 2,
    button_border_radius_secondary: clamp(r, "button_border_radius_secondary", 100),
    badge_corner_radius: clamp(r, "badge_corner_radius", 100), badge_sale_background_color: c.accent, badge_sale_text_color: WHITE,
    badge_sold_out_background_color: c.text, badge_sold_out_text_color: c.background,
    inputs_border_radius: clamp(r, "inputs_border_radius", cfg.layout.border_radius), popover_border_radius: clamp(r, "popover_border_radius", cfg.layout.border_radius),
    card_corner_radius: clamp(r, "card_corner_radius", cfg.layout.border_radius), product_corner_radius: clamp(r, "product_corner_radius", cfg.layout.border_radius),
    variant_button_radius: clamp(r, "variant_button_radius", 100), cart_type: "drawer", show_add_discount_code: true,
  });
  data.current = current;
  return JSON.stringify(data, null, 2);
}

// ---------- templates/index.json ----------
export function buildIndex(json, cfg) {
  const live = parse(json, { sections: {}, order: [] });
  const c = cfg.colors;
  // Horizon's product-list section needs its static header/card blocks; reuse the live one as a template.
  const productListTemplate = Object.values(live.sections).find((s) => s.type === "product-list");
  const sections = {};
  const order = [];
  const add = (key, s) => { sections[key] = s; order.push(key); };
  cfg.homepage_sections.forEach((s, i) => {
    const key = `${s.type.replace(/-/g, "_")}_${i + 1}`;
    if (s.type === "image-banner") { // solid brand-colour hero until the owner uploads a photo (Horizon's hero shows a placeholder image otherwise)
      add(key, section({
        heading: text(`<h1>${esc(s.heading)}</h1>`, { preset: "h1", align: "center", width: "100%", color: WHITE, max: "narrow" }),
        sub: text(`<p>${esc(s.subheading)}</p>`, { preset: "paragraph", align: "center", width: "100%", color: WHITE, max: "narrow", padEnd: 8 }),
        cta: button(s.cta.label, s.cta.url, { bg: c.highlight, fg: c.text }),
      }, { align: "center", gap: 20, height: "medium", bg: c.button, padTop: 64, padBottom: 64 }));
    } else if (s.type === "collection-list") {
      add(key, {
        type: "collection-list",
        blocks: {
          header: group({ title: text(`<h2>${esc(s.heading || "Shop by type")}</h2>`, { preset: "h3", width: "fit-content", padEnd: 16 }) }),
          "static-collection-card": { type: "_collection-card", static: true,
            settings: { horizontal_alignment: "flex-start", vertical_alignment: "flex-end", placement: "on_image", border: "none", border_width: 1, border_opacity: 100, border_radius: cfg.layout.border_radius },
            blocks: {
              "collection-card-image": { type: "_collection-card-image", static: true, settings: { image_ratio: "square" } },
              "collection-title": { type: "collection-title", settings: { type_preset: "h6", font: "var(--font-body--family)", font_size: "", line_height: "normal", letter_spacing: "normal", case: "none", wrap: "pretty",
                width: "fit-content", max_width: "normal", alignment: "left", background: true, background_color: c.background, text_color: c.text, corner_radius: 8,
                "padding-block-start": 6, "padding-block-end": 6, "padding-inline-start": 12, "padding-inline-end": 12 } },
            },
            block_order: ["collection-title"] },
        },
        block_order: ["header"],
        settings: { collection_list: s.collections, layout_type: "grid", carousel_on_mobile: false, columns: 3, mobile_columns: "2", mobile_card_size: "60cqw", columns_gap: 12, bento_gap: 8, rows_gap: 12,
          max_collections: s.collections.length, icons_style: "arrow", icons_shape: "none", section_width: "page-width", gap: 12, background_color: "", "padding-block-start": 48, "padding-block-end": 24 },
      });
    } else if (s.type === "featured-collection") {
      if (!productListTemplate) throw new Error("templates/index.json has no product-list section to copy");
      const pl = structuredClone(productListTemplate);
      pl.settings = { ...pl.settings, collection: s.collection, max_products: 8, columns: 4, layout_type: "grid", "padding-block-start": 24, "padding-block-end": 24 };
      const header = pl.blocks["static-header"];
      if (header) { const title = Object.values(header.blocks).find((b) => b.type === "_product-list-text"); if (title) title.settings.text = `<h2>${esc(s.heading)}</h2>`; }
      add(key, pl);
    } else if (s.type === "multicolumn") {
      const cols = Object.fromEntries(s.columns.map((col, j) => [`column_${j + 1}`, group({
        heading: text(`<h3>${esc(col.title)}</h3>`, { preset: "h5", align: "center" }),
        body: text(`<p>${esc(col.text)}</p>`, { align: "center" }),
      }, { align: "center", gap: 8, bg: c.background, radius: cfg.layout.border_radius, pad: 24 })]));
      add(key, section({
        title: text(`<h2>${esc(s.heading)}</h2>`, { preset: "h3", align: "center", padEnd: 8 }),
        columns: group(cols, { direction: "row", align: "center", gap: 16 }),
      }, { align: "center", gap: 16, bg: c.secondary_background, padTop: 48, padBottom: 48 }));
    } else if (s.type === "newsletter") {
      add(key, section({
        title: text(`<h2>${esc(s.heading)}</h2>`, { preset: "h3", align: "center" }),
        body: text(`<p>${esc(s.text)}</p>`, { preset: "paragraph", align: "center" }),
        signup: { type: "email-signup", settings: { width: "custom", custom_width: 50, heading: "", heading_preset: "h3", border_style: "all", input_style: "default", border_width: 1, border_radius: 100,
          input_type_preset: "paragraph", style_class: "button", display_type: "arrow", label: "Sign up", integrated_button: true, button_type_preset: "paragraph", ...PAD } },
      }, { align: "center", gap: 16, padTop: 48, padBottom: 56 }));
    } else throw new Error(`Unknown homepage section type: ${s.type}`);
  });
  return JSON.stringify({ sections, order }, null, 2);
}

// ---------- templates/product.json ----------
export function mergeProduct(json, cfg) {
  const t = parse(json, null);
  if (!t) throw new Error("templates/product.json missing");
  const main = Object.values(t.sections).find((s) => s.type === "product-information");
  const details = main?.blocks?.["product-details"];
  if (!details) throw new Error("templates/product.json has no product-details block");
  const pp = cfg.product_page;
  const rows = {};
  for (const b of pp.blocks) {
    if (!b.startsWith("collapsible:")) continue;
    const heading = b.slice("collapsible:".length);
    const cc = pp.collapsibles?.[heading] || {};
    const key = `row_${Object.keys(rows).length + 1}`;
    const body = cc.source ? `<p>{{ closest.${cc.source}.value }}</p>` : cc.content || "";
    rows[key] = { type: "_accordion-row", settings: { heading, open_by_default: false, icon: cc.icon === "truck" ? "truck" : "none", width: 20 },
      blocks: { body: text(body, { width: "100%" }) }, block_order: ["body"] };
  }
  details.blocks.bubble_accordion = { type: "accordion", settings: { icon: "plus", dividers: true, divider_color: "{{ settings.color_palette.color2 }}", type_preset: "h6", background_color: "", text_color: "",
    border: "none", border_width: 1, border_opacity: 100, border_color: "", border_radius: 0, ...PAD, "padding-block-start": 8 }, blocks: rows, block_order: Object.keys(rows) };
  details.block_order = [...details.block_order.filter((k) => k !== "bubble_accordion"), "bubble_accordion"];
  main.settings.enable_sticky_add_to_cart = !!pp.sticky_add_to_cart;
  return JSON.stringify(t, null, 2);
}

// ---------- sections/header-group.json ----------
export function mergeHeaderGroup(json, cfg) {
  const g = parse(json, null);
  if (!g) throw new Error("sections/header-group.json missing");
  const c = cfg.colors;
  const bar = Object.values(g.sections).find((s) => s.type === "header-announcements");
  if (bar) {
    bar.blocks = { announcement_1: { type: "_announcement", settings: { text: cfg.announcement_bar, link: "", font: "var(--font-subheading--family)", font_size: "0.875rem", letter_spacing: "normal", case: "none", text_color: WHITE }, blocks: {} } };
    bar.block_order = ["announcement_1"];
    bar.settings = { ...bar.settings, background_color: c.button, divider_width: 0, "padding-block-start": 12, "padding-block-end": 12 };
  }
  const header = Object.values(g.sections).find((s) => s.type === "header");
  if (header) {
    header.settings = { ...header.settings, show_country: false, show_language: false, enable_sticky_header: "always" };
    const menu = Object.values(header.blocks || {}).find((b) => b.type === "_header-menu");
    if (menu) menu.settings = { ...menu.settings, menu: "main-menu" };
  }
  return JSON.stringify(g, null, 2);
}

// ---------- sections/footer-group.json ----------
export function mergeFooterGroup(json, cfg) {
  const g = parse(json, null);
  if (!g) throw new Error("sections/footer-group.json missing");
  const c = cfg.colors;
  const f = cfg.footer;
  const footer = Object.values(g.sections).find((s) => s.type === "footer");
  if (footer) {
    const existingSignup = Object.values(footer.blocks || {}).find((b) => b.type === "email-signup");
    footer.blocks = {
      about: group({ heading: text(`<h3>${esc(f.about_heading)}</h3>`, { preset: "h5" }), body: text(f.about_text.map((p) => `<p>${esc(p)}</p>`).join(""), { max: "narrow" }) }, { gap: 8 }),
      help: { type: "menu", settings: { menu: "footer", heading: f.links_heading, menu_spacing: 10, show_as_accordion: false, accordion_icon: "caret", accordion_dividers: false, background_color: "", text_color: "", heading_preset: "h5", link_preset: "paragraph", ...PAD }, blocks: {} },
      newsletter: group({
        heading: text(`<h3>${esc(f.newsletter_heading)}</h3>`, { preset: "h5" }),
        signup: existingSignup ? { ...structuredClone(existingSignup), settings: { ...existingSignup.settings, heading: "" } }
          : { type: "email-signup", settings: { width: "fill", custom_width: 100, heading: "", heading_preset: "h3", border_style: "all", input_style: "default", border_width: 1, border_radius: 100, input_type_preset: "paragraph", style_class: "button-unstyled", display_type: "arrow", label: "Sign up", integrated_button: true, button_type_preset: "paragraph", ...PAD }, blocks: {} },
      }, { gap: 8 }),
    };
    footer.block_order = ["about", "help", "newsletter"];
    footer.settings = { ...footer.settings, background_color: c.secondary_background, gap: 32, "padding-block-start": 40, "padding-block-end": 32 };
  }
  const utilities = Object.values(g.sections).find((s) => s.type === "footer-utilities");
  if (utilities) {
    for (const [k, b] of Object.entries(utilities.blocks || {})) {
      if (b.type === "social-links") { delete utilities.blocks[k]; utilities.block_order = utilities.block_order.filter((x) => x !== k); } // no social accounts yet
      if (b.type === "footer-copyright") b.settings.show_powered_by = false;
    }
    utilities.settings = { ...utilities.settings, background_color: c.secondary_background, divider_color: c.background };
  }
  return JSON.stringify(g, null, 2);
}

export function buildHorizonFiles(files, cfg) {
  return {
    "config/settings_data.json": mergeSettingsData(files["config/settings_data.json"], files["config/settings_schema.json"], cfg),
    "templates/index.json": buildIndex(files["templates/index.json"], cfg),
    "templates/product.json": mergeProduct(files["templates/product.json"], cfg),
    "sections/header-group.json": mergeHeaderGroup(files["sections/header-group.json"], cfg),
    "sections/footer-group.json": mergeFooterGroup(files["sections/footer-group.json"], cfg),
  };
}
