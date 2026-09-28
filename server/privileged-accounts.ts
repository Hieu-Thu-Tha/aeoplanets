import type { User } from "@shared/schema";

type PrivilegedAccountUser = Pick<User, "email" | "emailVerified">;

// Keep privileged identities and organization domains in this module so
// authentication, application routes, and billing all apply the same policy.
const SUPER_ADMIN_EMAIL_ALLOWLIST = new Set([
  "adam.oldfield@force24.co.uk",
  "tech-enterprise@alpon.xyz",
]);

const COMPLIMENTARY_ACCESS_EMAIL_ALLOWLIST = new Set([
  "adam@force24.co.uk",
]);

const PRIVILEGED_ORGANIZATION_DOMAINS = new Set([
  "bobbledigital.com",
]);

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function getEmailDomain(email: string | null | undefined): string | null {
  const domain = normalizeEmail(email).split("@")[1];
  return domain || null;
}

export function isProtectedAccountEmail(email: string | null | undefined): boolean {
  const domain = getEmailDomain(email);
  return domain !== null && PRIVILEGED_ORGANIZATION_DOMAINS.has(domain);
}

export function hasSuperAdminAccess(user: PrivilegedAccountUser): boolean {
  const email = normalizeEmail(user.email);
  if (SUPER_ADMIN_EMAIL_ALLOWLIST.has(email)) return true;
  return user.emailVerified && isProtectedAccountEmail(email);
}

export function hasComplimentaryAccess(user: PrivilegedAccountUser): boolean {
  const email = normalizeEmail(user.email);
  if (COMPLIMENTARY_ACCESS_EMAIL_ALLOWLIST.has(email)) return true;
  return user.emailVerified && isProtectedAccountEmail(email);
}
