/**
 * Wise (TransferWise) API service
 *
 * Implements the exact flow from "5. Wise Send Money - Platform API's" Postman collection:
 *   1. GET  /v1/profiles                                                   → get profile IDs
 *   2. POST /v3/profiles/{profileId}/quotes                                → create quote (sourceAmount)
 *   3. POST /v1/accounts                                                   → create recipient account
 *   4. PATCH /v3/profiles/{profileId}/quotes/{quoteId}                    → attach recipient to quote
 *   5. POST /v1/transfers                                                  → create transfer
 *   6. POST /v3/profiles/{profileId}/transfers/{transferId}/payments       → fund from balance
 *   7. GET  /v1/transfers/{transferId}                                     → poll status
 *
 * Required env vars:
 *   WISE_API_TOKEN   – your Wise API token
 *   WISE_PROFILE_ID  – optional; auto-detected from /v1/profiles if omitted
 *   WISE_SANDBOX     – set to "true" for the sandbox environment
 */

import { createSign, createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadPrivateKey(): string | null {
  const keyPath = process.env.WISE_PRIVATE_KEY_PATH;
  if (!keyPath) return null;
  try {
    return readFileSync(resolve(keyPath), "utf8");
  } catch {
    return null;
  }
}

/**
 * Derive a deterministic UUID from an arbitrary string by hashing it with
 * SHA-1 and encoding the result as a UUID (version bits set to 5, variant
 * bits per RFC 4122).  Note: this is NOT a true RFC 4122 v5 UUID because no
 * namespace is prepended – it is a custom stable identifier suitable for use
 * as Wise's `customerTransactionId` idempotency key.
 */
function deterministicUUID(input: string): string {
  const hash = createHash("sha1").update(input).digest();
  // Set version bits (version 5) and variant bits per RFC 4122
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function signOtt(ott: string, privateKey: string): string {
  const signer = createSign("SHA256");
  signer.update(ott);
  signer.end();
  return signer.sign(privateKey, "base64");
}

const WISE_BASE_URL =
  process.env.WISE_SANDBOX === "true"
    ? "https://api.sandbox.transferwise.tech"
    : "https://api.wise.com";

const getToken = () => {
  const t = process.env.WISE_API_TOKEN;
  if (!t) throw new Error("WISE_API_TOKEN is not configured");
  return t;
};

// ─── Low-level fetch helper ───────────────────────────────────────────────────

async function wiseRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: object,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${WISE_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    // Log full Wise response server-side only — do not include in thrown message
    // to avoid leaking sensitive recipient/bank metadata to API clients.
    const detail =
      typeof data === "object" ? JSON.stringify(data) : String(data);
    console.error("Wise API error", { method, path, status: res.status, detail });
    throw new Error(`Wise API error: ${res.status} on ${method} ${path}`);
  }

  return data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WiseProfile {
  id: number;
  type: "personal" | "business";
  details: {
    firstName?: string;
    lastName?: string;
    name?: string;
    [key: string]: unknown;
  };
}

export interface WiseQuote {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  targetAmount: number;
  rate: number;
  status: string;
  expirationTime: string;
  paymentOptions?: Array<{
    payIn: string;
    payOut: string;
    disabled: boolean;
    sourceAmount: number;
    targetAmount: number;
    fee: { total: number };
  }>;
}

export interface WiseRecipientAccount {
  id: number;
  profile: number;
  accountHolderName: string;
  currency: string;
  type: string;
  active: boolean;
  details: {
    email?: string;
    abartn?: string;
    accountNumber?: string;
    accountType?: string;
    IBAN?: string;
    legalType?: string;
    [key: string]: unknown;
  };
}

export interface WiseTransfer {
  id: number;
  targetAccount: number;
  quoteUuid: string;
  status: string;
  reference: string;
  targetValue: number;
  targetCurrency: string;
  created: string;
  hasActiveIssues: boolean;
}

export interface WiseFundResult {
  type: string;
  status: string;
  errorCode: string | null;
  errorMessage?: string | null;
  balanceTransactionId?: number;
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: { value: number; currency: string };
  reservedAmount: { value: number; currency: string };
  cashAmount: { value: number; currency: string };
  totalWorth: { value: number; currency: string };
}

// Recipient creation inputs
export interface AbaRecipientInput {
  type: "aba";
  accountHolderName: string;
  currency: "USD";
  abartn: string; // ABA routing number
  accountNumber: string;
  accountType: "CHECKING" | "SAVINGS";
  email?: string;
  address: {
    firstLine: string;
    city: string;
    state: string; // 2-letter US state
    postCode: string;
    countryCode: "US";
  };
}

export interface EmailRecipientInput {
  type: "email";
  accountHolderName: string;
  currency: string;
  email: string;
}

export interface IbanRecipientInput {
  type: "iban";
  accountHolderName: string;
  currency: string;
  iban: string;
  bicSwift?: string; // Optional BIC/SWIFT code
  address?: {
    firstLine: string;
    city: string;
    postCode: string;
    countryCode: string;
  };
}

export interface AustralianRecipientInput {
  type: "australian";
  accountHolderName: string;
  currency: "AUD";
  bsb: string;        // 6-digit Bank State Branch code (e.g. "063000")
  accountNumber: string;
}

export type RecipientInput =
  | AbaRecipientInput
  | EmailRecipientInput
  | IbanRecipientInput
  | AustralianRecipientInput;

// ─── Step 1: Profiles ─────────────────────────────────────────────────────────

/** Return all profiles linked to the API token. */
export async function getProfiles(): Promise<WiseProfile[]> {
  return wiseRequest<WiseProfile[]>("GET", "/v1/profiles");
}

/**
 * Resolve the Wise profile ID.
 * Uses WISE_PROFILE_ID env var if set; otherwise picks the first business profile,
 * then falls back to the first personal profile.
 */
export async function getProfileId(): Promise<number> {
  if (process.env.WISE_PROFILE_ID) return Number(process.env.WISE_PROFILE_ID);
  const profiles = await getProfiles();
  const business = profiles.find((p) => p.type === "business");
  const profile = business ?? profiles[0];
  if (!profile) throw new Error("No Wise profiles found for this API token");
  return profile.id;
}

// ─── Step 2: Create quote ─────────────────────────────────────────────────────

/**
 * Create a quote using v3 (profile-scoped) endpoint.
 * Pass `sourceAmount` — how much YOUR account will send.
 */
export async function createQuote(
  profileId: number,
  sourceCurrency: string,
  targetCurrency: string,
  sourceAmount: number,
): Promise<WiseQuote> {
  return wiseRequest<WiseQuote>("POST", `/v3/profiles/${profileId}/quotes`, {
    sourceCurrency,
    targetCurrency,
    sourceAmount,
    targetAmount: null,
    profile: profileId,
    preferredPayIn: "BALANCE",
  });
}

// ─── Step 3: Create recipient ─────────────────────────────────────────────────

/**
 * Create a recipient account via POST /v1/accounts.
 * Supports "aba" (USD ACH), "iban" (EUR/GBP etc.), "australian" (AUD/BSB), and "email" (Wise-to-Wise) types.
 */
export async function createRecipientAccount(
  profileId: number,
  input: RecipientInput,
): Promise<WiseRecipientAccount> {
  let body: object;

  if (input.type === "aba") {
    body = {
      accountHolderName: input.accountHolderName,
      currency: "USD",
      type: "aba",
      profile: profileId,
      details: {
        legalType: "PRIVATE",
        abartn: input.abartn,
        accountType: input.accountType,
        accountNumber: input.accountNumber,
        ...(input.email ? { email: input.email } : {}),
        address: {
          countryCode: "US",
          firstLine: input.address.firstLine,
          city: input.address.city,
          state: input.address.state,
          postCode: input.address.postCode,
        },
      },
    };
  } else if (input.type === "iban") {
    body = {
      accountHolderName: input.accountHolderName,
      currency: input.currency,
      type: "iban",
      profile: profileId,
      details: {
        legalType: "PRIVATE",
        IBAN: input.iban,
        ...(input.bicSwift ? { BIC: input.bicSwift } : {}),
        ...(input.address
          ? {
              address: {
                countryCode: input.address.countryCode,
                firstLine: input.address.firstLine,
                city: input.address.city,
                postCode: input.address.postCode,
              },
            }
          : {}),
      },
    };
  } else if (input.type === "australian") {
    body = {
      accountHolderName: input.accountHolderName,
      currency: "AUD",
      type: "australian",
      profile: profileId,
      details: {
        legalType: "PRIVATE",
        bsbCode: input.bsb,
        accountNumber: input.accountNumber,
      },
    };
  } else {
    // email type (Wise-to-Wise)
    body = {
      accountHolderName: input.accountHolderName,
      currency: input.currency,
      type: "email",
      profile: profileId,
      details: { email: input.email },
    };
  }

  return wiseRequest<WiseRecipientAccount>("POST", "/v1/accounts", body);
}

// ─── Step 4: Update quote with recipient ──────────────────────────────────────

/**
 * Attach a recipient account to an existing quote.
 * MUST use Content-Type: application/merge-patch+json.
 */
export async function updateQuoteWithRecipient(
  profileId: number,
  quoteId: string,
  targetAccountId: number,
): Promise<WiseQuote> {
  return wiseRequest<WiseQuote>(
    "PATCH",
    `/v3/profiles/${profileId}/quotes/${quoteId}`,
    { targetAccount: targetAccountId },
    { "Content-Type": "application/merge-patch+json" },
  );
}

// ─── Step 5: Create transfer ──────────────────────────────────────────────────

/**
 * Create a transfer from the (updated) quote.
 * `customerTransactionId` is your idempotency key — use the commission ID.
 */
export async function createTransfer(
  targetAccountId: number,
  quoteUuid: string,
  customerTransactionId: string,
  reference = "Commission payout",
): Promise<WiseTransfer> {
  return wiseRequest<WiseTransfer>("POST", "/v1/transfers", {
    targetAccount: targetAccountId,
    quoteUuid,
    customerTransactionId,
    details: { reference },
  });
}

// ─── Step 6: Fund transfer ────────────────────────────────────────────────────

/**
 * Fund an approved transfer from the Wise BALANCE.
 *
 * Wise Business accounts require SCA (Strong Customer Authentication):
 *   1st call → 403 with x-2fa-approval OTT token
 *   Sign OTT with RSA private key (WISE_PRIVATE_KEY_PATH)
 *   2nd call → same request + x-2fa-approval + x-signature headers
 */
export async function fundTransfer(
  profileId: number,
  transferId: number,
): Promise<WiseFundResult> {
  const path = `/v3/profiles/${profileId}/transfers/${transferId}/payments`;
  const body = { type: "BALANCE" };
  const url = `${WISE_BASE_URL}${path}`;
  const token = getToken();

  const firstRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (firstRes.ok) {
    return firstRes.json() as Promise<WiseFundResult>;
  }

  const ott = firstRes.headers.get("x-2fa-approval");
  if (firstRes.status === 403 && ott) {
    const privateKey = loadPrivateKey();
    if (!privateKey) {
      throw new Error(
        "Wise SCA required but WISE_PRIVATE_KEY_PATH is not set. " +
          "Generate an RSA key pair and register the public key in Wise settings.",
      );
    }

    const signature = signOtt(ott, privateKey);
    const secondRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-2fa-approval": ott,
        "x-signature": signature,
      },
      body: JSON.stringify(body),
    });

    const text = await secondRes.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!secondRes.ok) {
      const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
      console.error("Wise SCA funding error", { path, status: secondRes.status, detail });
      throw new Error(`Wise API error: ${secondRes.status} on SCA POST ${path}`);
    }

    return data as WiseFundResult;
  }

  const errText = await firstRes.text();
  console.error("Wise funding error", { path, status: firstRes.status, detail: errText });
  throw new Error(`Wise API error: ${firstRes.status} on POST ${path}`);
}

// ─── Step 7: Status polling ───────────────────────────────────────────────────

/** Fetch the current state of a transfer. */
export async function getTransfer(transferId: number): Promise<WiseTransfer> {
  return wiseRequest<WiseTransfer>("GET", `/v1/transfers/${transferId}`);
}

/** Fetch all account balances for the given profile. */
export async function getBalances(profileId: number): Promise<WiseBalance[]> {
  return wiseRequest<WiseBalance[]>(
    "GET",
    `/v4/profiles/${profileId}/balances?types=STANDARD`,
  );
}

// ─── Simulation helpers (sandbox only) ───────────────────────────────────────

/**
 * Advance the sandbox transfer through its status lifecycle.
 * Steps: processing → funds_converted → outgoing_payment_sent
 */
export async function simulateTransferStatus(
  transferId: number,
  status: "processing" | "funds_converted" | "outgoing_payment_sent",
): Promise<WiseTransfer> {
  return wiseRequest<WiseTransfer>(
    "GET",
    `/v1/simulation/transfers/${transferId}/${status}`,
  );
}

// ─── High-level: full end-to-end payout ──────────────────────────────────────

export interface PayoutOptions {
  amount: number;
  sourceCurrency?: string;
  targetCurrency?: string;
  commissionId: string; // used as the idempotency key
  reference?: string;
}

/**
 * Execute the full payout flow for an existing Wise recipient account:
 *   quote → update quote with recipient → transfer → fund.
 *
 * @param recipientAccountId  Wise recipient account ID (stored on User.wiseRecipientId)
 * @param opts                amount, currencies, commissionId (idempotency key), reference
 */
export async function payExistingRecipient(
  recipientAccountId: number,
  opts: PayoutOptions,
): Promise<WiseTransfer> {
  const sourceCurrency = opts.sourceCurrency ?? "USD";
  const targetCurrency = opts.targetCurrency ?? "USD";
  const profileId = await getProfileId();

  // 2. Create quote
  const quote = await createQuote(
    profileId,
    sourceCurrency,
    targetCurrency,
    opts.amount,
  );

  // 4. Attach recipient to quote
  await updateQuoteWithRecipient(profileId, quote.id, recipientAccountId);

  // 5. Create transfer  (Wise requires customerTransactionId as UUID; derive
  //    it deterministically from commissionId so retries are idempotent)
  const transfer = await createTransfer(
    recipientAccountId,
    quote.id,
    deterministicUUID(opts.commissionId),
    opts.reference ?? "Commission payout",
  );

  // 6. Fund from balance
  const fundResult = await fundTransfer(profileId, transfer.id);
  if (fundResult.errorCode) {
    throw new Error(
      `Wise funding failed: ${fundResult.errorCode} – ${fundResult.errorMessage ?? ""}`,
    );
  }
  if (fundResult.status !== "COMPLETED") {
    // Funding is in an intermediate state (e.g. pending/requires_action).
    // Log it and continue — callers should inspect the returned transfer status
    // and record the commission as "pending" rather than "paid".
    console.warn(
      `Wise funding not yet COMPLETED (status: ${fundResult.status}) for transfer ${transfer.id}`,
    );
  }

  // 7. Return latest state
  return getTransfer(transfer.id);
}

/**
 * Full payout creating a brand-new recipient account first:
 *   create recipient → quote → update quote → transfer → fund.
 */
export async function payNewRecipient(
  recipientInput: RecipientInput,
  opts: PayoutOptions,
): Promise<{ recipient: WiseRecipientAccount; transfer: WiseTransfer }> {
  const sourceCurrency = opts.sourceCurrency ?? "USD";
  const targetCurrency = opts.targetCurrency ?? "USD";
  const profileId = await getProfileId();

  // 3. Create recipient
  const recipient = await createRecipientAccount(profileId, recipientInput);

  // 2. Create quote
  const quote = await createQuote(
    profileId,
    sourceCurrency,
    targetCurrency,
    opts.amount,
  );

  // 4. Attach recipient to quote
  await updateQuoteWithRecipient(profileId, quote.id, recipient.id);

  // 5. Create transfer  (Wise requires customerTransactionId as UUID; derive
  //    it deterministically from commissionId so retries are idempotent)
  const transfer = await createTransfer(
    recipient.id,
    quote.id,
    deterministicUUID(opts.commissionId),
    opts.reference ?? "Commission payout",
  );

  // 6. Fund from balance
  const fundResult = await fundTransfer(profileId, transfer.id);
  if (fundResult.errorCode) {
    throw new Error(
      `Wise funding failed: ${fundResult.errorCode} – ${fundResult.errorMessage ?? ""}`,
    );
  }
  if (fundResult.status !== "COMPLETED") {
    console.warn(
      `Wise funding not yet COMPLETED (status: ${fundResult.status}) for transfer ${transfer.id}`,
    );
  }

  // 7. Return latest state
  const finalTransfer = await getTransfer(transfer.id);
  return { recipient, transfer: finalTransfer };
}
