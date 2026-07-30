import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isSelfHost } from "@/lib/deployment/deployment";
import { APIError } from "better-auth/api";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { firstRunCreationState, recordPendingFirstRunUser } from "./first-run-context";

export async function isFirstRun() {
  if (!isSelfHost) {
    return false;
  }

  const account = await prisma.user.findFirst({ select: { id: true } });
  return account === null;
}

export async function isFirstRunAdministratorPending() {
  if (!isSelfHost) {
    return false;
  }

  const administrator = await prisma.user.findFirst({
    select: { id: true },
    where: { isInstanceAdmin: true },
  });
  return administrator === null;
}

export async function redirectToSetupIfFirstRun() {
  if (!isSelfHost) {
    return;
  }

  // First-run state lives in the database and can only be evaluated for a live
  // request. This keeps static marketing pages safe to build without a database.
  await connection();

  if (await isFirstRun()) {
    redirect("/setup");
  }
}

type FirstRunUser = {
  email: string;
  id?: string;
  [key: string]: unknown;
};

type FirstRunHookContext = {
  context: {
    generateId: (options: { model: string; size?: number }) => false | string;
    internalAdapter: {
      countTotalUsers: () => Promise<number>;
    };
  };
};

export async function prepareFirstRunUserCreation(
  user: FirstRunUser,
  hookContext: FirstRunHookContext | null,
) {
  if (!isSelfHost) {
    return;
  }

  const creation = firstRunCreationState();
  const accountCount = await hookContext?.context.internalAdapter.countTotalUsers();

  if (accountCount !== 0) {
    if (!creation) {
      return;
    }

    const administrator = await prisma.user.findFirst({
      select: { id: true },
      where: { isInstanceAdmin: true },
    });
    if (administrator) {
      throw new APIError("CONFLICT", {
        code: "SETUP_ALREADY_COMPLETED",
        message: "Administrator setup is already complete.",
      });
    }
  }

  if (!creation || !hookContext) {
    throw new APIError("FORBIDDEN", {
      code: "SETUP_REQUIRED",
      message: "Complete administrator setup before creating an account.",
    });
  }

  const id = user.id ?? hookContext.context.generateId({ model: "user" });
  if (!id) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      code: "SETUP_ACCOUNT_ID_UNAVAILABLE",
      message: "Unable to create the administrator account.",
    });
  }

  recordPendingFirstRunUser({ email: user.email, id });
  return {
    data: {
      ...user,
      id,
      isInstanceAdmin: false,
    },
  };
}
