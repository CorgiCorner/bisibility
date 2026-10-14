"use client";
import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
/** Synchronize the external RHF field subscription so an edited draft invalidates its old review. */
export function useDefaultsFormReview<T extends FieldValues>(
  form: UseFormReturn<T>,
  invalidate: () => void,
) {
  useEffect(() => {
    const subscription = form.watch(invalidate);
    return () => subscription.unsubscribe();
  }, [form, invalidate]);
}
