import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function PersonalViewScopeNotice({
  status,
  href,
}: Readonly<{
  status: "unavailable_view" | "unavailable_scope" | "invalid_url";
  href: string;
}>) {
  const t = await getTranslations("shared.personalViews");
  return (
    <Card size="md" className="p-4">
      <p role="status" className="text-sm text-fg-muted">
        {t(status)}
      </p>
      <Link href={href} className="mt-3 inline-block text-sm underline underline-offset-4">
        {t("general")}
      </Link>
    </Card>
  );
}
