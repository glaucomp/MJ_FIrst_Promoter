/** Placeholder domain for track/sale customers without a real payer email. */
export const SYNTHETIC_PAYER_EMAIL_DOMAIN = "@temp.com";

/** True for uid-*@temp.com and event-*@temp.com placeholders from track/sale. */
export function isSyntheticPayerEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.endsWith(SYNTHETIC_PAYER_EMAIL_DOMAIN)) return false;
  const local = trimmed.slice(0, -SYNTHETIC_PAYER_EMAIL_DOMAIN.length);
  return local.startsWith("event-") || local.startsWith("uid-");
}

/** Returns the email TeaseMe can redeem against, or null when only a placeholder exists. */
export function resolveRedeemablePayerEmail(
  email: string | null | undefined,
): string | null {
  const trimmed = (email ?? "").trim();
  if (!trimmed || isSyntheticPayerEmail(trimmed)) return null;
  return trimmed;
}
