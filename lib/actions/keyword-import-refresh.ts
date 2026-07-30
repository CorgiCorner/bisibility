"use server";

import { revalidateKeywordViews } from "./_shared";

export async function refreshKeywordViewsAfterImport() {
  revalidateKeywordViews();
}
