import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import { z } from "zod";

const [top10, top20, top50, top100] = serpDepthValues;

export const serpDepthSchema = z.union([
  z.literal(top10),
  z.literal(top20),
  z.literal(top50),
  z.literal(top100),
]);

export function serpDepthDecreaseWarning(depth: SerpDepth) {
  return `keywords ranking below ${depth} will be reported as not found; alerts deeper than ${depth} will not fire`;
}
