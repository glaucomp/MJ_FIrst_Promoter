/** Placeholder domain for track/sale customers without a real payer email. */
export const SYNTHETIC_PAYER_EMAIL_DOMAIN = "@temp.com";

/** True for uid-*@temp.com placeholders that merge in gift activity by email. */
export function isUidSyntheticPayerEmail(
  email: string | null | undefined,
): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!isSyntheticPayerEmail(normalized)) return false;
  const local = normalized.slice(0, -SYNTHETIC_PAYER_EMAIL_DOMAIN.length);
  return local.startsWith("uid-");
}

/** Real payer emails and uid-*@temp.com — one customer row across repeat sales. */
export function isStablePayerCustomerEmail(
  email: string | null | undefined,
): boolean {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return false;
  if (isUidSyntheticPayerEmail(trimmed)) return true;
  return !isSyntheticPayerEmail(trimmed);
}

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

/** When merging customer rows, keep a real payer email over a synthetic placeholder. */
export function preferStoredPayerEmail(
  left: string | null | undefined,
  right: string | null | undefined,
): string | null {
  const leftRedeemable = resolveRedeemablePayerEmail(left);
  const rightRedeemable = resolveRedeemablePayerEmail(right);
  if (rightRedeemable && right) return right.trim();
  if (leftRedeemable && left) return left.trim();
  const rightTrimmed = (right ?? "").trim();
  if (rightTrimmed) return rightTrimmed;
  const leftTrimmed = (left ?? "").trim();
  return leftTrimmed || null;
}

/**
 * Gift-activity row key: real emails merge payers; uid-*@temp.com merges by uid;
 * event-*@temp.com stays one row per sale (customer id).
 */
export function giftActivityDedupeKey(c: {
  email: string | null | undefined;
  id: string;
}): string {
  const redeemable = resolveRedeemablePayerEmail(c.email);
  if (redeemable) return redeemable.toLowerCase();
  const email = (c.email ?? "").trim().toLowerCase();
  if (isSyntheticPayerEmail(email)) {
    const local = email.slice(0, -SYNTHETIC_PAYER_EMAIL_DOMAIN.length);
    if (local.startsWith("uid-")) return email;
    return c.id.toLowerCase();
  }
  return (email || c.id).toLowerCase();
}
