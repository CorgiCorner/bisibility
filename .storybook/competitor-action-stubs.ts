import { z } from "zod";

export const competitorDetailsFormSchema = z.object({
  aliases: z.string().transform((value) =>
    value
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean),
  ),
  domain: z.string().trim().min(1, "Add a domain."),
});
