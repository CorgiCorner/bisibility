import type { IntegrationCategoryData } from "./types";

/** Group SEO cards for display without changing provider capabilities or fallback membership. */
export function groupIntegrationCategories(
  categories: readonly IntegrationCategoryData[],
): IntegrationCategoryData[] {
  if (!categories.some((category) => category.id === "serp")) return [...categories];
  const enrichment = categories
    .filter((category) => category.id === "enrichment")
    .flatMap((category) => category.providers);
  return categories
    .filter((category) => category.id !== "enrichment")
    .map((category) =>
      category.id === "serp"
        ? { ...category, providers: [...category.providers, ...enrichment] }
        : category,
    );
}
