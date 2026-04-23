// Single source of truth for the minimum password length enforced by the
// backend. Keep this in sync with the frontend validation in
// `frontend/src/pages/SetPassword.tsx` and any documentation that mentions
// the password rules.
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
