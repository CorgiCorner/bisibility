import { brandVisibilityRedirectPath } from "@/lib/ai-tracking/ai-visibility-paths";
import { redirect } from "next/navigation";

export default async function BrandVisibilityRedirect({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  redirect(brandVisibilityRedirectPath(project, query ?? {}));
}
