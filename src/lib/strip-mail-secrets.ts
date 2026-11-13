/**
 * Drop mailbox secrets from anything about to be sent as JSON.
 * Objects that had `mailPassword` gain `mailPasswordSet` instead.
 * `mailHost`, `mailUser`, and `mailPort` are removed unless the caller is an
 * admin editing a hidden campaign. From address and provider stay, because
 * invite screens show who the message is from.
 */
const MAILBOX_LOGIN_KEYS = ["mailHost", "mailUser", "mailPort"] as const;

type StripMailOptions = {
  keepMailboxLogin?: boolean;
};

export function stripMailSecrets<T>(
  value: T,
  seen = new WeakSet<object>(),
  options: StripMailOptions = {},
): T {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = stripMailSecrets(value[i], seen, options);
    }
    return value;
  }

  const record = value as Record<string, unknown>;
  if ("mailPassword" in record) {
    record.mailPasswordSet = Boolean(record.mailPassword);
    delete record.mailPassword;
  }
  if (!options.keepMailboxLogin) {
    for (const key of MAILBOX_LOGIN_KEYS) {
      delete record[key];
    }
  }

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child && typeof child === "object") {
      stripMailSecrets(child, seen, options);
    }
  }

  return value;
}
