/**
 * Username on a promoter invite.
 *
 * Not tied to one product. TeaseMe, Sugar Scratchie, and later integrations
 * all receive this same value as `inviteeUsername`. Instagram's 30-character
 * handle rules stay on the VIP preregister path.
 */
const INVITE_USERNAME_PATTERN = /^(?=.*[a-z0-9])[a-z0-9._-]{1,80}$/;

/** Strip a leading @ and lowercase so "@Glau" and "glau" are one invite. */
export const normalizeInviteUsername = (raw: string): string =>
  raw.trim().replace(/^@+/, "").toLowerCase();

export const isValidInviteUsername = (username: string): boolean =>
  INVITE_USERNAME_PATTERN.test(username);

export const INVITE_USERNAME_ERROR =
  "Enter a username using letters, numbers, dots, underscores, or hyphens (up to 80 characters).";
