import { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";

type StoryProps = {
  theme: "dark" | "light";
  verified: boolean;
};

const projectId = "prj_story";

function ConnectProviderStory({ theme, verified }: Readonly<StoryProps>) {
  return (
    <main className="min-h-dvh bg-bg p-4 text-fg sm:p-8" data-theme={theme}>
      <h1 className="sr-only">Connect a SERP provider</h1>
      <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-bg-elev p-6">
        <StepConnectProvider
          defaultValues={
            verified
              ? {
                  login: "provider-login",
                  projectId,
                  providerId: "dataforseo",
                  secret: "provider-password",
                }
              : undefined
          }
          flowState={{ projectId }}
          testProviderConnectionAction={async () => ({ message: "Connected", ok: true })}
        />
      </section>
    </main>
  );
}

const meta = {
  args: { theme: "light", verified: false },
  component: ConnectProviderStory,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Onboarding/Steps/ConnectProvider",
} satisfies Meta<typeof ConnectProviderStory>;

export default meta;

type Story = StoryObj<typeof meta>;

async function verifyProvider({ canvasElement }: { canvasElement: HTMLElement }) {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("radiogroup", { name: "SERP provider" })).toBeInTheDocument();
  await userEvent.click(canvas.getByRole("button", { name: "Test connection" }));
  await expect(await canvas.findByText("Verified")).toBeVisible();
  await expect(await canvas.findByLabelText("API password")).toBeVisible();
  await expect(await canvas.findByRole("button", { name: "Show password" })).toBeVisible();
}

export const EmptyLight: Story = {};
export const EmptyDark: Story = { args: { theme: "dark" } };
export const VerifiedLight: Story = { args: { verified: true }, play: verifyProvider };
export const VerifiedDark: Story = {
  args: { theme: "dark", verified: true },
  play: verifyProvider,
};
