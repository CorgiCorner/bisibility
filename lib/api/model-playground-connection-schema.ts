import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

export const modelPlaygroundConnectionSchema = z
  .string()
  .regex(/^conn_[a-z][a-z0-9]{23}$/)
  .refine((value) => isPublicIdOfType(value, "conn"));
