export const CLOUD_MIGRATION_PACKAGE_VERSION = 7 as const;
export const PREVIOUS_CLOUD_MIGRATION_PACKAGE_VERSION = 6 as const;
export const LEGACY_CLOUD_MIGRATION_PACKAGE_VERSION = 5 as const;

/** Full package versions a current instance can import and use for sessions. */
export const CLOUD_MIGRATION_PACKAGE_VERSIONS = [
  CLOUD_MIGRATION_PACKAGE_VERSION,
  PREVIOUS_CLOUD_MIGRATION_PACKAGE_VERSION,
] as const;

/** Version 5 is only retained for metadata-only packages and in-flight chunk checksums. */
export const CLOUD_MIGRATION_CHECKSUM_VERSIONS = [
  ...CLOUD_MIGRATION_PACKAGE_VERSIONS,
  LEGACY_CLOUD_MIGRATION_PACKAGE_VERSION,
] as const;
