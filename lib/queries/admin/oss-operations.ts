import "server-only";
import { getInstanceAdminEmailAllowance } from "@/lib/email/allowance";
import { getInstanceAdminOperationalData } from "@/lib/queries/instance-admin-operational";
import { ossAdminSession } from "./oss-access";

export async function getOssOverview(now = new Date()) {
  if (!(await ossAdminSession())) return null;
  const [data, emailAllowance] = await Promise.all([
    getInstanceAdminOperationalData(now),
    getInstanceAdminEmailAllowance(now),
  ]);
  return { data, emailAllowance };
}

export async function getOssWorker(now = new Date()) {
  if (!(await ossAdminSession())) return null;
  return { data: await getInstanceAdminOperationalData(now) };
}

export async function getOssChecks(now = new Date()) {
  if (!(await ossAdminSession())) return null;
  return { data: await getInstanceAdminOperationalData(now) };
}

export async function getOssDataSources(now = new Date()) {
  if (!(await ossAdminSession())) return null;
  return { data: await getInstanceAdminOperationalData(now) };
}

export async function getOssNotifications(now = new Date()) {
  if (!(await ossAdminSession())) return null;
  return { data: await getInstanceAdminOperationalData(now) };
}
