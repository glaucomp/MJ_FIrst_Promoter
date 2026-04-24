// Single source of truth for the frontend base URL used to build invite /
// password-reset links that ship in outbound emails. Keep the fallback in
// sync with `.env.example` (http://localhost:3000) so links don't break in
// local/staging when FRONTEND_URL is unset.
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

export const getFrontendUrl = (): string => {
  const raw = process.env.FRONTEND_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_FRONTEND_URL;
  return base.replace(/\/+$/, '');
};

export const buildSetPasswordUrl = (rawToken: string): string =>
  `${getFrontendUrl()}/set-password/${rawToken}`;
