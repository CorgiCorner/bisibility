export class SettingsHostError extends Error {
  constructor(
    readonly code:
      | "measurement_policy_unconfigured"
      | "measurement_policy_unsupported"
      | "source_unavailable"
      | "defaults_missing"
      | "default_geo_unavailable"
      | "provider_missing"
      | "provider_disabled"
      | "provider_disconnected"
      | "needs_reauth"
      | "settings_revision_unavailable"
      | "settings_conflict"
      | "unsupported_capability"
      | "invalid_settings"
      | "mutation_conflict",
  ) {
    super("Measurement settings require a current, supported source.");
  }
}
