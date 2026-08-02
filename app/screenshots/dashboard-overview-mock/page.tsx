import { DashboardOverviewScreenshotMock } from "@/components/overview/DashboardOverviewScreenshotMock";
import { dashboardOverviewScreenshot } from "@/components/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  alternates: { canonical: "/screenshots/dashboard-overview-mock" },
  description:
    "Internal bisibility dashboard screenshot source rendered from the overview mock fixture.",
  robots: { follow: false, index: false },
  title: "Dashboard overview mock screenshot",
};

export default function DashboardOverviewMockScreenshotPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-bg px-10 py-10 text-fg">
      <DashboardOverviewScreenshotMock />
      <div className="sr-only">
        Screenshot target: {dashboardOverviewScreenshot.width} by{" "}
        {dashboardOverviewScreenshot.height}
      </div>
    </main>
  );
}
