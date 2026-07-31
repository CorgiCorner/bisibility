export type DistributionManifest = {
  schemaVersion: 2;
  release: string;
  source: {
    repository: string;
    tag: string;
  };
  images: {
    web: string;
    worker: string;
  };
  artifacts: Record<
    "compose" | "environment" | "generator",
    { name: string; sha256: string }
  >;
};

export function normalizeVersion(value: string): string;
export function distributionManifest(
  versionValue: string,
  artifactSha256: Record<"compose" | "environment" | "generator", string>,
): DistributionManifest;
export function parseDistributionManifest(contents: string): DistributionManifest;

export const distributionContract: {
  imageRepositories: {
    web: string;
    worker: string;
  };
  publicRepository: string;
  artifacts: Record<"compose" | "environment" | "generator", string>;
};
