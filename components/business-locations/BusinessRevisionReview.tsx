import { Card } from "@/components/ui/Card";
import type { BusinessTranslator } from "./contracts";
import type { IdentityFormValues } from "./identity-form";

export function BusinessRevisionReview({
  current,
  draft,
  translate: t,
}: {
  current: IdentityFormValues;
  draft: IdentityFormValues;
  translate: BusinessTranslator;
}) {
  return (
    <Card className="mt-4 min-w-0">
      <h3 className="font-medium">{t("reviewCurrent")}</h3>
      <p className="mt-2 text-sm text-fg-muted">{t("reviewChangedFields")}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {(
          [
            { label: "current", values: current },
            { label: "yourDraft", values: draft },
          ] as const
        ).map(({ label, values }) => (
          <section key={label}>
            <h4 className="text-sm font-semibold">{t(label)}</h4>
            <dl className="mt-2 flex flex-col gap-2 text-sm">
              {(
                [
                  "name",
                  "address",
                  "domain",
                  "cid",
                  "placeId",
                  "mapsUrl",
                  "latitude",
                  "longitude",
                ] as const
              ).map((field) => (
                <div key={field}>
                  <dt className="text-fg-muted">{t(`fields.${field}`)}</dt>
                  <dd className="break-all">{values[field] || t("notProvided")}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Card>
  );
}
