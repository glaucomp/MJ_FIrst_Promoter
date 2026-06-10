const INSTAGRAM_USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;

/** Strip leading @ and lowercase for storage/upstream. */
export const normalizeInstagramUsername = (raw: string): string =>
  raw.trim().replace(/^@+/, "").toLowerCase();

export const isValidInstagramUsername = (username: string): boolean =>
  INSTAGRAM_USERNAME_PATTERN.test(username);
