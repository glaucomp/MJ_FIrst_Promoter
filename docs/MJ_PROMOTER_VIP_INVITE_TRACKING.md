# MJ Promoter — VIP invite tracking & email

## Overview

Chatters generate VIP preregister links for a group promoter. MJ Promoter stores invites in `vip_invites`, polls TeaseMe for status, and proxies **send email** to TeaseMe so the personal invite template and **preregister `verification_url`** are used.

**Do not** call TeaseMe `POST /auth/resend-verification-email` for VIP invites. That template uses `/verify-email?token=…` for post-profile verification, not the preregister link.

## TeaseMe (source of truth for email)

### `send_vip_invite_email` (`app/services/email/mailers.py`)

Personal invite copy (not generic platform verification):

| Field | Value |
|-------|--------|
| Subject | `An invite from {influencer first name}` |
| Greeting | `Hi {recipient_name},` — or `Hi there,` when name omitted |
| Body | Private invite + small gift framing |
| Button | **Accept my gift** → `verification_url` from preregister (`/{influencer}?t=token`) |
| Sign-off | `Can't wait to see what you think, {influencer first name}` |
| Header | Admin-uploaded banner → composed profile photo → default S3 verify header |

### MJ Promoter routes on TeaseMe

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/mjpromoter/influencers/{influencer_id}/vip-invite-email-assets` | Banner URL + subject/heading copy |
| `POST` | `/mjpromoter/vip-invites/send-email` | Send via TeaseMe SES |

**Send email body:**

```json
{
  "to_email": "fan@example.com",
  "verification_url": "https://www.teaseme.live/JulianaVal?t=abc123",
  "influencer_id": "JulianaVal",
  "recipient_name": "kako"
}
```

- `recipient_name` — first token of invitee `full_name` from GroupTools (e.g. `"kako"` from `"kako smith"`). Omit when empty; TeaseMe greets with `Hi there,`.

**Success:** `{ "ok": true, "message_id": "…", "email_subject": "…" }`  
**SES failure:** `502` with `"Failed to send VIP invite email. Check SES configuration."`

Restart the TeaseMe backend after deploying these routes.

## MJ Promoter API

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/api/chatters/preregister-vip` | Proxy preregister → upsert `vip_invites` |
| `GET` | `/api/chatters/vip-invites?groupId=` | List/search invites |
| `GET` | `/api/chatters/vip-invites/:inviteId/status` | Status + TeaseMe reconcile |
| `POST` | `/api/chatters/vip-invites/:inviteId/send-email` | Proxy to TeaseMe send-email |

### Send-email proxy

```
POST {TEASEME_HOST}/mjpromoter/vip-invites/send-email
X-Internal-Token: {MJFP_TOKEN}
Content-Type: application/json

{
  "to_email": "<vip_invites.email>",
  "verification_url": "<vip_invites.verificationUrl>",
  "influencer_id": "<vip_invites.influencerId>",
  "recipient_name": "<first token of vip_invites.fullName, optional>"
}
```

Implementation: `vipInviteRecipientName` + `sendVipInviteEmailViaTeaseme` in `src/services/`.

### Environment (optional overrides)

| Variable | Default |
|----------|---------|
| `PREREGISTER_VIP_TEASEME_USER` | Used to derive TeaseMe host |
| `TEASEME_MJPROMOTER_BASE_URL` | `{origin}/mjpromoter` from preregister URL |
| `TEASEME_VIP_INVITE_SEND_EMAIL_URL` | `{base}/vip-invites/send-email` |
| `TEASEME_VIP_USER_STATUS_URL` | Status polling |
| `TEASEME_VIP_WEBHOOK_SECRET` | Lifecycle webhooks |

## Database

Migration: `20260603000000_add_vip_invites` — table `vip_invites`.

```bash
npx prisma migrate deploy
npx prisma generate
```

## Invite status contract

| Status | Meaning |
|--------|---------|
| `pending` | Code generated; user has not finished the VIP profile form |
| `in_progress` | Profile completed; awaiting email verification |
| `completed` | Fully signed up (`is_verified=true` on TeaseMe) |
| `expired` | Never redeemed within 2 days of `created_at` / `expires_at` |

MJ Promoter stores `expires_at` from the TeaseMe preregister response and hides `expired` invites from the default list.

## TeaseMe batch status API

`POST /mjpromoter/vip-invites/status` (same `X-Internal-Token` auth).

**Request** — prefer persistent VIP codes; `user_ids` are a fallback:

```json
{ "invite_codes": ["75G9SU"], "user_ids": [110] }
```

TeaseMe resolves by `users.vip_invite_code` (set at preregister, never overwritten). Do not rely on `email_token` alone after signup — it is replaced during verification.

**Response** — rows in `items` (or legacy `invites` / `results`):

```json
{ "items": [{ "invite_code": "75G9SU", "user_id": 110, "status": "completed", "email": "…", "is_verified": true }] }
```

MJ Promoter calls this on tracked-invite list refresh and per-invite status poll to reconcile badges.

Env: `TEASEME_VIP_INVITES_STATUS_URL` (defaults to `{mjpromoter base}/vip-invites/status`).

## Webhook

`POST /api/webhooks/teaseme/vip-preregister` — updates invite status (`pending` → `in_progress` → `completed`).

Auth: `x-webhook-secret` header (`TEASEME_VIP_WEBHOOK_SECRET`).

Fire on TeaseMe when complete-profile succeeds (`in_progress`) and verify-email succeeds (`completed`).
