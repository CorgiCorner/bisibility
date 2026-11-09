import { z } from "zod";

export const accountSearchInput = z.object({ search: z.string().trim().max(320) });
export const accountListInput = accountSearchInput
  .extend({
    search: accountSearchInput.shape.search.default(""),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    sort: z.enum(["email", "status", "created", "lastActive", "projects"]).default("created"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
export type AccountListInput = z.input<typeof accountListInput>;
