import MeteringPage from "@/app/(regional)/app/admin/metering/page";
/** Stable alert link: operational URL sanitization deliberately strips query strings. */
export default function RecoveryPage() {
  return MeteringPage({ searchParams: Promise.resolve({ tab: "incidents" }) });
}
