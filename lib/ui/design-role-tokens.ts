export const UI_TYPE_ROLES = {
  "ui-h1": ["21px", { lineHeight: "1.25", fontWeight: "600" }],
  "ui-section": ["15px", { lineHeight: "1.35", fontWeight: "600" }],
  "ui-body": ["13px", { lineHeight: "1.5" }],
  "ui-body-relaxed": ["14px", { lineHeight: "1.5" }],
  "ui-caption": ["12px", { lineHeight: "1.45" }],
  "ui-micro": ["10px", { lineHeight: "1.4" }],
} as const;

// Two steps only. Anything fully round uses rounded-full, which is a shape, not a size.
export const UI_RADIUS_ROLES = {
  control: "6px",
  card: "12px",
} as const;

export const UI_MAX_WIDTH_ROLES = {
  content: "1200px",
  settings: "780px",
} as const;
