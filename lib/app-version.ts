import packageJson from "@/package.json";

/**
 * Single source for the shipped version string. Server-side only: it reads the package manifest,
 * which must not travel into the client bundle. Pass the result down as a prop.
 */
export function appVersion(): string {
  return process.env.npm_package_version?.trim() || packageJson.version;
}
