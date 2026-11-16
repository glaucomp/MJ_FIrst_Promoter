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

const getSugarMakePackageUrl = (): string =>
  (
    process.env.SUGAR_MAKE_PACKAGE_URL ||
    `${getSugarApiBaseUrl()}/api/promoter/pre-influencers/make-package`
  ).replace(/\/$/, "");

const getSugarPackageWorkspaceUrl = (): string =>
  (
    process.env.SUGAR_PACKAGE_WORKSPACE_URL ||
    `${getSugarApiBaseUrl()}/api/promoter/pre-influencers/package-workspace`
  ).replace(/\/$/, "");

const getSugarOperatorPublicUrl = (): string =>
  (
    process.env.SUGAR_OPERATOR_PUBLIC_URL ||
    process.env.SUGAR_OPERATOR_URL ||
    "https://localhost:5080"
  ).replace(/\/$/, "");

const getSugarInternalToken = (): string =>
  (process.env.SUGAR_INTERNAL_TOKEN || "").trim();

const SUGAR_APPROVE_TIMEOUT_MS = 30_000;

export interface SugarPackageWorkspace {
  ok: boolean;
  modelId: string;
  packsUrl: string;
  packageReady: boolean;
  surveyStep: number;
  error?: string | null;
  statusCode?: number;
}

export interface SugarActionResult {
  ok: boolean;
  status?: string | null;
  assetLink?: string | null;
  surveyStep?: number | null;
  modelId?: string | null;
  error?: string | null;
  statusCode?: number;
  raw?: unknown;
}

/** True when the campaign is the Sugar Scratchie influencer funnel. */
export const isSugarScratchCampaign = (name?: string | null): boolean =>
  (name || "").toLowerCase().includes("sugar scratch");

/**
 * Resolve the operator packs page for this invite (no step advance).
 * Used to iframe / open Create with n8n before Order LP.
 */
export const getSugarPackageWorkspace = async (params: {
  inviteCode: string;
  email: string;
}): Promise<SugarPackageWorkspace | null> => {
  if (!params.inviteCode || !params.email) {
    throw new Error("getSugarPackageWorkspace requires inviteCode and email");
  }
  const token = getSugarInternalToken();
  if (!token) {
    console.warn("[sugar.package-workspace] SUGAR_INTERNAL_TOKEN unset");
    return null;
  }

  let res: Response;
  try {
    res = await fetch(getSugarPackageWorkspaceUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify({
        invite_code: params.inviteCode,
        invitee_email: params.email,
      }),
      signal: AbortSignal.timeout(SUGAR_APPROVE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[sugar.package-workspace] request failed", {
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
  const raw =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const detail =
    typeof raw.detail === "string" && raw.detail.trim()
      ? raw.detail.trim()
      : null;

  if (!res.ok || raw.ok === false) {
    return {
      ok: false,
      modelId: "",
      packsUrl: "",
      packageReady: false,
      surveyStep: 0,
      error: detail,
      statusCode: res.status,
    };
  }

  const modelId =
    typeof raw.model_id === "string" && raw.model_id ? raw.model_id : "";
  const packsPath =
    typeof raw.packs_path === "string" && raw.packs_path
      ? raw.packs_path
      : modelId
        ? `/dashboard/packs?model=${encodeURIComponent(modelId)}&embed=1`
        : "";
  const packsUrl = packsPath
    ? `${getSugarOperatorPublicUrl()}${packsPath.startsWith("/") ? "" : "/"}${packsPath}`
    : "";

  return {
    ok: true,
    modelId,
    packsUrl,
    packageReady: raw.package_ready === true,
    surveyStep: typeof raw.survey_step === "number" ? raw.survey_step : 0,
  };
};

/**
 * Ask Sugar Scratchie to complete Make package / n8n (survey step 2) and
 * notify this app's teaseme-step webhook.
 */
export const makeSugarPackage = async (params: {
  inviteCode: string;
  email: string;
}): Promise<SugarActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("makeSugarPackage requires inviteCode");
  }
  if (!params.email) {
    throw new Error("makeSugarPackage requires email");
  }
  const token = getSugarInternalToken();
  if (!token) {
    console.warn("[sugar.make-package] SUGAR_INTERNAL_TOKEN unset");
    return null;
  }

  let res: Response;
  try {
    res = await fetch(getSugarMakePackageUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify({
        invite_code: params.inviteCode,
        invitee_email: params.email,
      }),
      signal: AbortSignal.timeout(SUGAR_APPROVE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[sugar.make-package] request failed", {
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

  const raw =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const detail =
    typeof raw.detail === "string" && raw.detail.trim()
      ? raw.detail.trim()
      : null;

  if (!res.ok) {
    console.warn("[sugar.make-package] upstream non-2xx", {
      status: res.status,
      body: parsed,
    });
    return {
      ok: false,
      error: detail,
      statusCode: res.status,
      raw: parsed,
    };
  }

  if (raw.ok === false) {
    return { ok: false, error: detail, statusCode: res.status, raw: parsed };
  }
  const statusStr =
    typeof raw.status === "string" && raw.status ? raw.status : null;
  const surveyStep =
    typeof raw.survey_step === "number" ? raw.survey_step : null;
  const modelId =
    typeof raw.model_id === "string" && raw.model_id ? raw.model_id : null;
  return { ok: true, status: statusStr, surveyStep, modelId, raw: parsed };
};

/**
 * Ask Sugar Scratchie to publish the player /join freeplay LP (step 3) and
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
