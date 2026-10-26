export const inputClassName =
  "border border-border-control bg-transparent text-fg outline-none transition-colors placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted focus:border-accent disabled:cursor-not-allowed disabled:border-dashed disabled:bg-bg-sunken disabled:text-fg-muted";

/** Standard form-field geometry, shared by inputs and adjacent actions. */
export const inputControlSizeClassName =
  "min-h-10 max-sm:min-h-11 px-[13px] py-[9px] text-ui-body leading-5";

// A fixed 20px line keeps fields and actions at 40px desktop and 44px below sm.
export const inputActionSizeClassName = inputControlSizeClassName;

/** Shared value and placeholder typography for compact search and toolbar controls. */
export const compactInputTypographyClassName =
  "compact-text-12 text-[12px] leading-4 placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted";

/** Geometry for compact standalone controls such as toolbar inputs. */
export const compactInputGeometryClassName = "min-h-[34px] max-sm:min-h-[34px] py-1";

export const compactInputClassName = `${compactInputGeometryClassName} ${compactInputTypographyClassName}`;
