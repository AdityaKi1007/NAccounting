/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("organizations", {
    accent_color: { type: "text", notNull: true, default: "blue" }, // blue | green | red | orange | custom
    accent_custom_hex: { type: "text" }, // used when accent_color = 'custom'
    theme_preference: { type: "text", notNull: true, default: "light" }, // light | dark (stored only; see BrandingForm)
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("organizations", ["accent_color", "accent_custom_hex", "theme_preference"]);
};
