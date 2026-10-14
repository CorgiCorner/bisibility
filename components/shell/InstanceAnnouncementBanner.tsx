import { InlineNoticeBanner } from "@/components/ui/InlineNoticeBanner";
import type { AnnouncementContent } from "@/lib/instance-announcements/schema";

export function InstanceAnnouncementBanner({
  announcement,
  defaultLinkLabel,
  live = true,
}: Readonly<{
  announcement: AnnouncementContent;
  defaultLinkLabel: string;
  live?: boolean;
}>) {
  return (
    <InlineNoticeBanner
      testId="instance-announcement"
      live={live}
      regionLabel={announcement.title}
      fullText={`${announcement.title} ${announcement.message}`}
      link={
        announcement.href
          ? {
              href: announcement.href,
              label: announcement.linkLabel || defaultLinkLabel,
            }
          : undefined
      }
    >
      <strong className="font-medium text-fg">{announcement.title}</strong> {announcement.message}
    </InlineNoticeBanner>
  );
}
