// Single source of truth for the express-validator `normalizeEmail()` options
// we use across every public-facing email field (auth, user creation, chatter
// creation, referral invites, etc).
//
// Why these flags? express-validator's default behavior strips dots from
// Gmail addresses and removes "+tag" subaddresses on multiple providers. That
// canonicalization breaks real-world flows where:
//
//   1. A user is stored with the dotted form (e.g. via an endpoint that
//      doesn't normalize) but logs in through one that does — the lookup
//      misses and they see "Invalid credentials" / "user not found".
//   2. A reset / forgot-password request silently 200s because the
//      normalized address doesn't match the stored one.
//   3. Two genuinely different mailboxes on non-Gmail providers collapse
//      onto the same canonical key.
//
// Lower-case-only normalization (which is all the underlying validator
// applies once these options are set) is what we actually want — it keeps
// `John.Doe@Gmail.com` and `john.doe@gmail.com` equivalent without ever
// dropping characters from the local-part.
export const EMAIL_NORMALIZE_OPTIONS = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  gmail_convert_googlemaildotcom: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
} as const;
