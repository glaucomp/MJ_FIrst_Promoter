/**
 * Drop SMTP passwords from anything about to be sent as JSON.
 * Objects that had `mailPassword` gain `mailPasswordSet` instead.
 */
export function stripMailSecrets<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = stripMailSecrets(value[i], seen);
    }
    return value;
  }

  const record = value as Record<string, unknown>;
  if ("mailPassword" in record) {
    record.mailPasswordSet = Boolean(record.mailPassword);
    delete record.mailPassword;
  }

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child && typeof child === "object") {
      stripMailSecrets(child, seen);
    }
  }

  return value;
}
