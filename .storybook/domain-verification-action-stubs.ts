const row = {
  domain: "example.com",
  method: "dns_txt",
  dns_host: "_bisibility.example.com",
  dns_value: "bisibility-site-verification=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST",
  verified_at: null,
  last_checked_at: null,
  last_check_result: null,
  failures: 0,
  revoked_at: null,
};
export async function startProjectDomainVerification(input: { method: string }) {
  return { ...row, method: input.method };
}
export async function checkProjectDomainVerification() {
  return { ...row, verified_at: "2026-11-06T00:00:00.000Z" };
}
