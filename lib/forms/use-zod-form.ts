"use client";

import { type FieldValues, type UseFormProps, useForm } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "./zod-resolver";

export function useZodForm<T extends FieldValues>(
  schema: z.ZodType,
  options: Omit<UseFormProps<T>, "resolver">,
) {
  return useForm<T>({ ...options, resolver: zodResolver(schema) });
}
