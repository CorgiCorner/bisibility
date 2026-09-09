import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { ToastProvider } from "./Toast";
import { useToast } from "./toast-context";
import type { ToastSeverity } from "./toast-presentation";

function ToastDemo({ severity }: Readonly<{ severity: ToastSeverity }>) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(`${severity} toast`, { severity })} type="button">
      Show {severity}
    </button>
  );
}

const meta = {
  title: "UI/Toast",
  component: ToastDemo,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="min-h-[220px] bg-bg p-6 text-fg">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ToastDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

function story(severity: ToastSeverity): Story {
  return {
    args: { severity },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByRole("button", { name: `Show ${severity}` }));
      await expect(canvas.getByText(`${severity} toast`)).toBeVisible();
    },
  };
}

export const Success = story("success");
// biome-ignore lint/suspicious/noShadowRestrictedNames: Storybook requires the binding name Error.
export const Error = story("error");
export const Warning = story("warning");
export const Info = story("info");
export const Connection = story("connection");
export const Progress = story("progress");
