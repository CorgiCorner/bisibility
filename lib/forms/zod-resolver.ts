import { zodResolver as baseZodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * Forms model post-coercion values, not the resolver's exposed pre-coercion input.
 */
export function zodResolver(schema: z.ZodType) {
  // The surrounding useForm<T> remains the source of truth for form-state
  // typing; this boundary only reconciles Zod's distinct input/output types.
  return baseZodResolver(schema as never) as never;
}
