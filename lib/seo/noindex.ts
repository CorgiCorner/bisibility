import type { Metadata } from "next";

const noindexRobots = {
  follow: false,
  index: false,
} as const;

export function createNoindexMetadata(metadata: Metadata = {}): Metadata {
  return {
    ...metadata,
    robots: noindexRobots,
  };
}
