import { ExploreDemo } from "@/components/auth/ExploreDemo";
import Link from "next/link";

export function EditableDemoLogin() {
  return (
    <div className="flex flex-col gap-5">
      <ExploreDemo />
      <p className="m-0 text-center text-sm text-fg-muted">
        Managing this demo?{" "}
        <Link
          className="font-medium text-fg underline underline-offset-4"
          href="/login?owner=1&switch=1"
        >
          Owner sign-in
        </Link>
      </p>
    </div>
  );
}
