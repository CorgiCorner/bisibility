/** Serializable Cloud plan badge. Self-hosted builds pass nothing. */
export type PlanStatus =
  | { readonly kind: "pro" }
  | { readonly kind: "trial"; readonly days: number };
