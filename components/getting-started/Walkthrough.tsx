import { Button } from "@/components/ui/Button";
import type { SetupCta, SetupStepId, SetupStepState } from "@/lib/getting-started/setup-steps";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { useTranslations } from "next-intl";
import { walkthroughMessageKey } from "./walkthrough-copy";

type WalkthroughStepId = Exclude<SetupStepId, "confirm_competitors">;

type WalkthroughProps = {
  expanded?: boolean;
  id: WalkthroughStepId;
  onCta: (cta: SetupCta) => void;
  state: SetupStepState;
};

function stateCta(state: SetupStepState) {
  return state.family === "action" ? state.cta : undefined;
}

export function Walkthrough({ expanded = true, id, onCta, state }: Readonly<WalkthroughProps>) {
  const t = useTranslations("projectGettingStarted");
  const cta = stateCta(state);
  const copy = t(walkthroughMessageKey(id, state));
  return (
    <div className="max-w-[440px]">
      <p className={`m-0 text-[13px] leading-[1.55] text-fg-muted ${cta ? "mb-3" : ""}`}>{copy}</p>
      {cta ? (
        <Button
          className="text-[12.5px]"
          endIcon={
            cta.id === "run_first_check" ? undefined : (
              <ArrowRight aria-hidden size={11} weight="regular" />
            )
          }
          onClick={() => onCta(cta)}
          size="sm"
          tabIndex={expanded ? undefined : -1}
          variant="secondary"
        >
          {t(`cta.${cta.id}`)}
        </Button>
      ) : null}
    </div>
  );
}
