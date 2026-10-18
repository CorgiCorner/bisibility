import "server-only";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { parseActiveLocale } from "@/i18n/config";
import { prisma } from "@/lib/db/prisma";
import { escapeHtml } from "@/lib/email/escape-html";
import { refreshInstanceMailRuntime } from "@/lib/email/instance-mail-store";
import { isEmailConfigured } from "@/lib/email/registry";
import { EmailBudgetExceededError, sendEmail } from "@/lib/email/send";
import { normalizeOrigin } from "@/lib/seo/origin";
import { createTranslator } from "next-intl";
import { calendarDay, nextMorning } from "./calendar";
import { achievementEmailsEnabled } from "./config";
import { createAchievementUnsubscribeToken } from "./unsubscribe";

export async function sweepAchievementMail(limit = 10, now = new Date()) {
  if (!achievementEmailsEnabled()) return { sent: 0 };
  // An interrupted submission has unknown delivery, so it is never automatically sent again.
  await prisma.achievementMail.updateMany({
    where: { status: "sending", claimedAt: { lt: new Date(now.getTime() - 600000) } },
    data: { status: "unknown", reason: "delivery_unconfirmed" },
  });
  const origin = normalizeOrigin(process.env.SITE_URL);
  if (!origin || !/^https?:\/\//.test(origin)) {
    await prisma.achievementMail.updateMany({
      where: { status: "queued", dueAt: { lte: now } },
      data: { dueAt: new Date(now.getTime() + 21600000), reason: "origin_unconfigured" },
    });
    return { sent: 0 };
  }
  await refreshInstanceMailRuntime();
  if (!isEmailConfigured()) {
    await prisma.achievementMail.updateMany({
      where: { status: "queued", dueAt: { lte: now } },
      data: { dueAt: new Date(now.getTime() + 21600000), reason: "transport_unconfigured" },
    });
    return { sent: 0 };
  }
  const pending = await prisma.achievementMail.findMany({
    where: { status: "queued", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const mail of pending) {
    let claimed = false;
    try {
      if (now.getTime() - nextMorning(mail.awardDay, mail.timeZone).getTime() > 72 * 3600000) {
        await prisma.achievementMail.updateMany({
          where: { id: mail.id, status: "queued" },
          data: { status: "skipped", finishedAt: now, reason: "stale" },
        });
        continue;
      }
      const state = await prisma.achievementState.findUnique({
        where: { userId: mail.userId },
        include: {
          user: {
            select: {
              email: true,
              emailVerified: true,
              uiLocale: true,
              deactivatedAt: true,
              marketingEmailUnsubscribedAt: true,
            },
          },
        },
      });
      if (
        !state?.enabled ||
        !state.emailEnabled ||
        !state.user.emailVerified ||
        state.user.deactivatedAt ||
        state.user.marketingEmailUnsubscribedAt
      ) {
        await prisma.achievementMail.updateMany({
          where: { id: mail.id, status: "queued" },
          data: { status: "skipped", finishedAt: now, reason: "recipient_ineligible" },
        });
        continue;
      }
      const locale = parseActiveLocale(state.user.uiLocale) ?? "en";
      const messages = await loadCoreMessages(locale, ["account"]);
      const t = createTranslator({ locale, messages, namespace: "account.achievements" });
      const awards = await prisma.achievementAward.findMany({
        where: { userId: mail.userId, epoch: mail.epoch, earnedDay: mail.awardDay },
        select: { kind: true },
      });
      if (!awards.length) {
        await prisma.achievementMail.updateMany({
          where: { id: mail.id, status: "queued" },
          data: { status: "skipped", finishedAt: now, reason: "award_missing" },
        });
        continue;
      }
      const link = `${origin}/app/account/activity`;
      const unsubscribe = `${origin}/activity/unsubscribe?token=${createAchievementUnsubscribeToken(mail.userId)}`;
      const titles = awards
        .map((a) => t(a.kind === "presence" ? "presenceTitle" : "practiceTitle"))
        .join(" · ");
      const text = `${t("emailIntro")}\n${titles}\n${t("emailCta")}: ${link}\n${t("emailUnsubscribe")}: ${unsubscribe}\n${t("emailNotice")}`;
      const html = `<p>${escapeHtml(t("emailIntro"))}</p><p><strong>${escapeHtml(titles)}</strong></p><p><a href="${escapeHtml(link)}">${escapeHtml(t("emailCta"))}</a></p><p><a href="${escapeHtml(unsubscribe)}">${escapeHtml(t("emailUnsubscribe"))}</a></p><p>${escapeHtml(t("emailNotice"))}</p>`;
      const claim = await prisma.achievementMail.updateMany({
        where: { id: mail.id, status: "queued" },
        data: { status: "sending", claimedAt: now },
      });
      if (!claim.count) continue;
      claimed = true;
      // Recheck opt-out after claiming, immediately before the external send.
      const eligible = await prisma.achievementState.findFirst({
        where: {
          userId: mail.userId,
          enabled: true,
          emailEnabled: true,
          user: { deactivatedAt: null, emailVerified: true, marketingEmailUnsubscribedAt: null },
        },
        select: { user: { select: { email: true } } },
      });
      if (!eligible) {
        await prisma.achievementMail.update({
          where: { id: mail.id },
          data: { status: "skipped", finishedAt: now, reason: "recipient_ineligible" },
        });
        continue;
      }
      try {
        await sendEmail({
          category: "bulk",
          to: eligible.user.email,
          subject: t("emailSubject"),
          text,
          html,
        });
        await prisma.achievementMail.update({
          where: { id: mail.id },
          data: { status: "sent", finishedAt: new Date() },
        });
        sent++;
      } catch (error) {
        const budget = error instanceof EmailBudgetExceededError;
        await prisma.achievementMail.update({
          where: { id: mail.id },
          data: budget
            ? {
                status: "queued",
                dueAt: nextMorning(calendarDay(now, mail.timeZone), mail.timeZone),
                reason: "daily_limit",
              }
            : { status: "unknown", finishedAt: new Date(), reason: "delivery_unconfirmed" },
        });
      }
    } catch {
      if (!claimed) {
        await prisma.achievementMail
          .updateMany({
            where: { id: mail.id, status: "queued" },
            data: { dueAt: new Date(now.getTime() + 21600000), reason: "preparation_failed" },
          })
          .catch(() => {});
      }
      // Claimed submissions remain uncertain; a broken recipient must not starve later rows.
      console.error("[achievements] milestone mail processing failed");
    }
  }
  return { sent };
}
