import "server-only";
import { hostedAssistantProviderKey } from "./funding-extension";
import { type AssistantStepInput, refused, runAssistantAttempt } from "./run-attempt";

/** Most platform keys one step may try; each one is a separate, fully metered attempt. */
export const MAX_KEY_ATTEMPTS = 5;

/**
 * One model call of a turn. On Credits, a platform key the provider refused before running
 * anything (invalid key, no permission, quota or credits exhausted) moves the step to the next
 * key as a new attempt: the refused attempt was already closed at zero, and the next one goes
 * through admission again (kill switch, budgets, wallet) under its own operation id. Nothing
 * moves after a timeout, a stop, a server error, a plain rate limit or any response, and a
 * team's own key never moves to a platform key. When no untried key is left, the refusal stands.
 */
export async function runAssistantStep(input: AssistantStepInput) {
  const tried: string[] = [];
  let result = await runAssistantAttempt({ ...input, exclude: tried });
  for (let keyAttempt = 1; result.keyRefusal && keyAttempt < MAX_KEY_ATTEMPTS; keyAttempt++) {
    tried.push(result.keyRefusal.keyId);
    if (input.signal.aborted) return refused("cancelled");
    if (!(await nextKeyExists(input, tried))) break;
    const binding = {
      ...input.binding,
      operationId: `${input.binding.operationId}:key${keyAttempt}`,
      keyAttempt,
    };
    result = await runAssistantAttempt({ ...input, binding, exclude: tried });
  }
  const { keyRefusal: _keyRefusal, ...step } = result;
  return step;
}

/** A failed key read ends the failover: the original refusal is reported. */
async function nextKeyExists(input: AssistantStepInput, tried: readonly string[]) {
  try {
    return (
      (await hostedAssistantProviderKey(input.binding.model.provider, { exclude: tried })) !== null
    );
  } catch {
    return false;
  }
}
