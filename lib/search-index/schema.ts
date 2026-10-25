import { z } from "zod";

export const searchIndexSitemapPathSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((path) => {
    try {
      const url = new URL(path);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Expected an absolute HTTP or HTTPS sitemap URL of 1-2048 characters.");

export const searchIndexInspectionSchema = z
  .object({
    urls: z.array(z.string().min(1).max(2048)).min(1).max(10),
  })
  .strict();
