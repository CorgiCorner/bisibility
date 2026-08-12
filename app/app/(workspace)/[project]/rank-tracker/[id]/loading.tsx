import { KeywordDetailPageSkeleton } from "@/components/keyword-detail/shared/KeywordDetailPageSkeleton";
import { PageContent } from "@/components/shell/PageContent";

// Keep route loading geometry in lockstep with the keyword-detail Storybook skeleton.
export default function KeywordDetailLoading() {
  return (
    <PageContent>
      <KeywordDetailPageSkeleton />
    </PageContent>
  );
}
