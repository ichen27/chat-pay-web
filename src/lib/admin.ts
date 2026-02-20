export function isAdminEmail(email: string): boolean {
  const allowList = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowList.includes(email.toLowerCase());
}
