"use client";

import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
import type { IntegrationCategoryData } from "@/lib/integrations/types";
import { useState } from "react";
import { IntegrationCategory, type IntegrationCategoryProps } from "./IntegrationCategory";

type Props = Omit<IntegrationCategoryProps, "category" | "projectId" | "cardOrder"> & {
  categories: readonly IntegrationCategoryData[];
  projectId: string;
};

export function IntegrationCategories({ categories, projectId, ...props }: Readonly<Props>) {
  const [orders] = useState(() =>
    Object.fromEntries(
      categories.map((category) => [
        category.id,
        category.providers.map((provider) => provider.id),
      ]),
    ),
  );
  return (
    <ProviderUiProvider projectId={projectId}>
      <div className="flex flex-col gap-5 scroll-mt-6" id="all-providers">
        {categories.map((category) => (
          <IntegrationCategory
            {...props}
            cardOrder={orders[category.id]}
            category={category}
            key={category.id}
            projectId={projectId}
          />
        ))}
      </div>
    </ProviderUiProvider>
  );
}
