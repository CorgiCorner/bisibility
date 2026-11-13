import { promptTrackerRedirectPath } from "@/lib/ai-tracking/ai-visibility-paths";
import { redirect } from "next/navigation";

export default async function PromptTrackerRedirect({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  redirect(promptTrackerRedirectPath(project, query ?? {}));
}
