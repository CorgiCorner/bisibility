"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { trackingTopicForm } from "@/lib/ai-tracking/projections/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
export function TrackingTopicDrawer({
  open,
  onClose,
  onSave,
  pending,
  error,
  topic,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onSave: (data: z.infer<typeof trackingTopicForm>) => Promise<void>;
  pending: boolean;
  error?: string | null;
  topic?: { name: string; description: string | null };
}>) {
  const t = useTranslations("projectAiTracking");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof trackingTopicForm>>({
    resolver: zodResolver(trackingTopicForm),
    defaultValues: { name: topic?.name ?? "", description: topic?.description ?? "" },
  });
  return (
    <AppDrawer
      title={topic ? t("editTopic") : t("addTopic")}
      open={open}
      onClose={onClose}
      description={t("groupPromptsAroundAQuestionYourCustomersAsk")}
      sheetOnMobile
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSave)}>
        {error && (
          <p role="alert" className="text-sm text-red-text">
            {error}
          </p>
        )}
        <label htmlFor="tracking-name" className="flex flex-col gap-2 text-sm">
          {t("topicName")}
          <Input
            id="tracking-name"
            {...register("name")}
            autoFocus
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <span role="alert">{errors.name.message}</span>}
        </label>
        <label htmlFor="tracking-description" className="flex flex-col gap-2 text-sm">
          {t("description")}
          <Textarea id="tracking-description" {...register("description")} rows={4} />
        </label>
        <Button type="submit" loading={pending || isSubmitting}>
          {t("addTopic")}
        </Button>
      </form>
    </AppDrawer>
  );
}
