import { canonicalKeySchema } from "@/lib/schemas/keyword";
import type { SerpDepth } from "@/lib/serp/constants";
import { z } from "zod";
import { comparisonProviders } from "./types";

export const playgroundInputSchema = z
  .object({
    depth: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(20),
    query: z.string().trim().min(1).max(500),
    locationKey: canonicalKeySchema,
    device: z.enum(["desktop", "mobile"]),
    providers: z
      .array(z.enum(comparisonProviders))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export type PlaygroundInput = z.infer<typeof playgroundInputSchema>;
export type PlaygroundSource = {
  aiOverview?: true;
  depth?: SerpDepth;
  query: string;
  locationId: string;
  device: "desktop" | "mobile";
  providers: PlaygroundInput["providers"];
};

export type PlaygroundPageData = {
  canRun: boolean;
  providers: {
    provider: (typeof comparisonProviders)[number];
    ready: boolean;
    selectedByDefault?: boolean;
  }[];
  location: {
    kind: "country" | "region" | "city";
    canonicalKey: string;
    countryCode: string;
    displayName: string;
    languageCode: string;
    languageLabel: string;
  };
  history: import("./types").ComparisonRun[];
};
