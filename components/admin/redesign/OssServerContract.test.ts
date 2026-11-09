import type { OssAdminData } from "@/components/admin/redesign/OssAdminViews";
import type { getOssAccount, getOssAccounts } from "@/lib/queries/admin/oss-accounts";
import type { getOssAudit } from "@/lib/queries/admin/oss-audit";
import type { getOssEmailSending, getOssEmailSettings } from "@/lib/queries/admin/oss-email";
import type { getOssOverview, getOssWorker } from "@/lib/queries/admin/oss-operations";
import type { getOssTasks } from "@/lib/queries/admin/oss-tasks";
import { expectTypeOf, it } from "vitest";

type Result<T extends (...args: never[]) => unknown> = NonNullable<Awaited<ReturnType<T>>>;
it("produces the composition data contracts without callbacks or component imports in the server layer", () => {
  expectTypeOf<Result<typeof getOssOverview>>().toExtend<
    Pick<NonNullable<OssAdminData["operations"]>, "data" | "emailAllowance">
  >();
  expectTypeOf<Result<typeof getOssWorker>>().toExtend<
    Pick<NonNullable<OssAdminData["operations"]>, "data">
  >();
  expectTypeOf<Result<typeof getOssAccounts>>().toExtend<
    Pick<NonNullable<OssAdminData["administration"]>, "account" | "accounts" | "accountTotalCount">
  >();
  expectTypeOf<Result<typeof getOssAccount>["account"]>().toExtend<
    NonNullable<OssAdminData["administration"]>["account"]
  >();
  expectTypeOf<Result<typeof getOssEmailSending>>().toEqualTypeOf<
    Pick<NonNullable<OssAdminData["emailAllowance"]>, "allowance">
  >();
  expectTypeOf<Result<typeof getOssEmailSettings>>().toExtend<
    Pick<
      NonNullable<OssAdminData["administration"]>,
      "mailSettings" | "mailerConfigured" | "twoFactorEnabled"
    >
  >();
  expectTypeOf<Result<typeof getOssTasks>>().toExtend<
    Pick<NonNullable<OssAdminData["recovery"]>, "page" | "twoFactorEnabled">
  >();
  expectTypeOf<Result<typeof getOssAudit>>().toExtend<
    Pick<NonNullable<OssAdminData["audit"]>, "entries" | "nextCursor">
  >();
});
