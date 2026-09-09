import "server-only";
import { assertDemoAccountMutable } from "@/lib/demo/config";
import { prepareFirstRunUserCreation } from "./first-run";
import { addAuthPublicId } from "./public-id-hooks";
import { sendCloudWelcomeSequence } from "./welcome-signup";

type UserCreationInput = Parameters<typeof prepareFirstRunUserCreation>[0];
type UserCreationContext = Parameters<typeof prepareFirstRunUserCreation>[1];

export async function prepareUserCreation(user: UserCreationInput, context: UserCreationContext) {
  assertDemoAccountMutable();
  const prepared = await prepareFirstRunUserCreation(user, context);
  const identified = addAuthPublicId(user, "usr", prepared);
  return (await sendCloudWelcomeSequence(identified.data)) ?? identified;
}
