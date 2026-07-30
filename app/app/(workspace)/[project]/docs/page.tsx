import { resolveProjectAccess } from "@/lib/queries/_auth";
import { DOCS_URL } from "@/lib/site/site";
import { redirect } from "next/navigation";

type DocsPageProps = {
  params: Promise<{ project: string }>;
};

export default async function DocsPage({ params }: Readonly<DocsPageProps>) {
  const { project } = await params;
  await resolveProjectAccess(project);
  redirect(DOCS_URL);
}
