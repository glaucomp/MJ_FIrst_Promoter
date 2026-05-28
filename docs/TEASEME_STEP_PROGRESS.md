# TeaseMe ↔ MJ Promoter: `/step-progress` contract

This document is the **backend ticket** for TeaseMe (`MJPreInfluencerStepProgressOut`) and the **integration checklist** for this repo (MJ Promoter UI + mirror layer).

MJ Promoter does **not** own onboarding rules. It mirrors `POST /mjpromoter/pre-influencers/step-progress` and renders a 3-step checklist on My Promoters (Models) cards.

---

## What MJ Promoter does **not** need

| Item | Reason |
|------|--------|
| New public TeaseMe endpoints | Existing `step-progress`, `approve`, `deny`, etc. are enough |
| A 4th UI step for social | Social is collected on TeaseMe register step **01 Email & Name** (`social_*` in `survey_answers`) |
| A copy of the personality survey | Removed from the TeaseMe funnel; no quiz in MJ Promoter |
| Duplicate survey UX in MJ Promoter | Resume via `survey_link` only |

---

## Backend ticket (TeaseMe): `MJPreInfluencerStepProgressOut`

**Endpoint:** `POST /mjpromoter/pre-influencers/step-progress`  
**Body:** `{ invite_code?, invitee_email? }`  
**Auth:** `X-Internal-Token` (MJFP token)

### `survey_step` semantics (1/3 – 3/3)

`survey_step` is the **count of completed onboarding milestones** (0–3), not the “current active section index”.

| `survey_step` | Meaning (all conditions required) |
|---------------|-----------------------------------|
| **0** | Register / survey not complete |
| **1** | Register complete: `survey_answers` includes `country`, `languages`, and **at least one** `social_*` field |
| **2** | Step 1 **plus** profile picture on pre-influencer **and** at least one audio on pre-influencer |
| **3** | Step 2 **plus** `terms_agreement === true` **and** `assets_complete === true` |

**`asset_link` vs step 3:**  
`assets_complete` gates **3/3**. `asset_link` is the **published landing-page URL** once the LP exists. Do **not** require `asset_link` for `survey_step === 3`. MJ Promoter uses `status` (`order_lp` → `building` → `live`) and `asset_link` for LP copy/open, not for milestone counting.

### `survey_link`

- Resume URL for the invitee’s **in-flight** onboarding.
- Must open TeaseMe onboarding at the **photo** step: `start_step=picture` (or equivalent).
- Must **not** point at the personality quiz (removed from funnel).

### `status` (lifecycle, unchanged conceptually)

Expected strings MJ Promoter already mirrors: `pending` → `order_lp` → `building` / `approved` → `live`.

After AM clicks **Order Landing Page**, upstream should move toward `building` without requiring a 4th or 5th `survey_step`.

### Optional sub-flags (UI-only on MJ Promoter)

Expose on the response when cheap to compute (MJ Promoter will pass through when present):

```ts
photo_complete?: boolean;   // profile picture present
voice_complete?: boolean;   // ≥1 audio present
social_complete?: boolean;  // ≥1 social_* in survey_answers
```

Used only for a sub-checklist under steps **01** / **02** on the card—not for chip state or approve.

### Suggested response shape

```json
{
  "ok": true,
  "exists": true,
  "pre_influencer_id": "...",
  "username": "...",
  "survey_step": 2,
  "status": "pending",
  "survey_link": "https://.../onboarding?...&start_step=picture",
  "asset_link": null,
  "photo_complete": true,
  "voice_complete": false,
  "social_complete": true
}
```

### Publish / terminal step (≠ onboarding 3/3)

| Concept | Typical signal | MJ Promoter use |
|---------|----------------|-----------------|
| Onboarding complete (3/3) | `survey_step >= 3`, `status: order_lp` or `pending` | **Order Landing Page** chip + button |
| LP published / live | `status: live` or `survey_step >= 5` | Stop polling, LP Live chip, welcome email |

Do **not** set `TEASEME_PUBLISHED_SURVEY_STEP` to `3` — that skips Order LP and jumps invites to LP Live. Default remains **5** (override via env only when upstream changes the terminal step).

---

## MJ Promoter integration checklist

### UI (Models / My Promoters)

- [x] Keep **3-step** checklist: Email & Name → Photo & Voice → Assets  
- [ ] Optionally note under step **01** that social is part of register (copy only)  
- [ ] Rely on mirrored `preUser.currentStep` for **N/3**, not local heuristics (once upstream uses completion count)  
- [x] **Open** icon uses `preUser.surveyLink` (resume onboarding)  
- [x] **Copy / open LP** uses `preUser.assetLink` when it is a real LP URL (not a raw image upload)  
- [ ] **Order Landing Page** enablement: wait for TeaseMe `survey_step` / `status` rules before tightening beyond `chipState === order_lp`  

### Backend mirror (`src/services/teaseme.service.ts`, `referral.controller.ts`)

- [x] Document contract in service header + this file  
- [ ] Parse optional `photo_complete`, `voice_complete`, `social_complete` when upstream sends them  
- [ ] Default `TEASEME_PUBLISHED_SURVEY_STEP` / `MJ_PROMOTER_PUBLISHED_SURVEY_STEP` to **3**  
- [x] Never null out `survey_link` / `asset_link` on poll miss; monotonic `currentStep`  

### Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEASEME_STATUS_URL` | `.../step-progress` | Upstream URL |
| `TEASEME_PUBLISHED_SURVEY_STEP` | `5` | LP published — stop polling, auto-accept, welcome email |
| `MJ_PROMOTER_SURVEY_STEP_MODE` | `completion` | `completion` = N/3 count; `section-index` = legacy “active section” (−1 for display) |

---

## Approval / Order LP (do not guess)

Chip **Order LP** should follow mirrored `preUser.status === "order_lp"` (preferred) or `survey_step >= 3` after TeaseMe defines completion. Do not require `asset_link` for 3/3 or for enabling **Order Landing Page**.

---

## Ownership

| Layer | Owns |
|-------|------|
| TeaseMe | `survey_step` rules, `survey_link` target, `assets_complete`, lifecycle `status` |
| MJ Promoter (this repo) | Poll, mirror to `PreUser`, SSE, 3-step UI, LP approve button orchestration |

If MJ Promoter were a separate repo from TeaseMe, the only shared contract is this document + the JSON fields above; **TeaseMe must ship the rules first**, then MJ Promoter adjusts display defaults (completion count vs section index).
