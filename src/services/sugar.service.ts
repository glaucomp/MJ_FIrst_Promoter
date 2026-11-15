/**
 * Sugar Scratchie pre-influencer upstream (operator dashboard + API).
 *
 * Used for Sugar Scratchie campaigns instead of TeaseMe approve when the AM
 * clicks Order Landing Page. Auth is X-Internal-Token (SUGAR_INTERNAL_TOKEN),
 * matching Sugar's MJPROMOTER_INTERNAL_TOKEN.
 */

const getSugarApiBaseUrl = (): string =>
  (
    process.env.SUGAR_API_URL ||
    process.env.SUGAR_SCRATCHIE_API_URL ||
    "http://localhost:8090"
  ).replace(/\/$/, "");

const getSugarOrderLandingPageUrl = (): string =>
  (
    process.env.SUGAR_ORDER_LP_URL ||
    `${getSugarApiBaseUrl()}/api/promoter/pre-influencers/order-landing-page`
  ).replace(/\/$/, "");

const getSugarInternalToken = (): string =>
  (process.env.SUGAR_INTERNAL_TOKEN || "").trim();

const SUGAR_APPROVE_TIMEOUT_MS = 30_000;

export interface SugarActionResult {
  ok: boolean;
  status?: string | null;
  assetLink?: string | null;
  raw?: unknown;
}

/** True when the campaign is the Sugar Scratchie influencer funnel. */
export const isSugarScratchCampaign = (name?: string | null): boolean =>
  (name || "").toLowerCase().includes("sugar scratch");

/**
 * Ask Sugar Scratchie to publish the player /join freeplay LP (step 2) and
 * notify this app's teaseme-step webhook with assetLink.
 */
export const orderSugarLandingPage = async (params: {
  inviteCode: string;
  email: string;
  model?: string;
  card?: string;
}): Promise<SugarActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("orderSugarLandingPage requires inviteCode");
  }
  if (!params.email) {
    throw new Error("orderSugarLandingPage requires email");
  }
  const token = getSugarInternalToken();
  if (!token) {
    console.warn("[sugar.order-lp] SUGAR_INTERNAL_TOKEN unset");
    return null;
  }

  const payload: Record<string, string> = {
    invite_code: params.inviteCode,
    invitee_email: params.email,
  };
  if (params.model?.trim()) payload.model = params.model.trim();
  if (params.card?.trim()) payload.card = params.card.trim();

  let res: Response;
  try {
    res = await fetch(getSugarOrderLandingPageUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SUGAR_APPROVE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[sugar.order-lp] request failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    console.warn("[sugar.order-lp] upstream non-2xx", {
      status: res.status,
      body: parsed,
    });
    return null;
  }

  const raw =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  if (raw.ok === false) return null;
  const statusStr =
    typeof raw.status === "string" && raw.status ? raw.status : null;
  const assetLink =
    typeof raw.asset_link === "string" && raw.asset_link
      ? raw.asset_link
      : null;
  return { ok: true, status: statusStr, assetLink, raw: parsed };
};
