import type { DistributionManifest } from "./manifest.mjs";

type ImageInspection = {
  image?: Record<
    string,
    {
      config?: {
        Labels?: Record<string, string>;
        labels?: Record<string, string>;
      };
    }
  >;
  manifest?: {
    digest?: string;
  };
};

export type DistributionVerification = {
  revision: string;
  webDigest: string;
  workerDigest: string;
};

export function verifyDistribution(
  manifest: DistributionManifest,
  options?: {
    expectedRevision?: string;
    inspect?: (reference: string) => ImageInspection;
  },
): DistributionVerification;

export function verifyArtifacts(manifest: DistributionManifest, artifactRoot: string): void;
