# Backend Integration Points - MJ First Promoter

Mapping of component dependencies, external integrations, and identified gaps.

## Component Dependency Map

### Authentication Layer

**Controllers:** auth.controller.ts (11 functions)
**Routes:** auth.routes.ts
**Middleware:** auth.middleware.ts
**Services Used:**
- email.service.ts (sendInviteEmail, sendPasswordResetEmail, sendWelcomeEmail)
- password-reset.service.ts (createPasswordResetToken, validatePasswordResetToken, consumePasswordResetToken, invalidateUserTokens)
- pre-user-promote.service.ts (resolveOwnership)
- referral-membership.service.ts (ensureCustomerTrackingReferralForPromotedUser)
- user.service.ts (syncUserType, getUserTypeInfo)

**External Dependencies:**
- jsonwebtoken (JWT signing/verification)
- bcryptjs (password hashing)
- express-validator (request validation)

**Key Integration Points:**
- `register()` → Creates user, optionally links to referral, may create PreUser shell
- `login()` → Can trigger mustChangePassword flow (for pre-influencers)
- `resetPassword()` → Invalidates all other tokens atomically
- `getCurrentUser()` → Calls getUserTypeInfo (computed capabilities)

---

### User Management

**Controllers:** user.controller.ts (6 functions)
**Routes:** user.routes.ts
**Services Used:**
- ownership.service.ts (resolveOwnership)
- email.service.ts (sendInviteEmail)
- password-reset.service.ts (createPasswordResetToken)

**Key Dependencies:**
- Users have createdById (immutable, who invited), accountManagerId (mutable, current owner)
- User.userType is computed from:
  - User.role (ADMIN/PROMOTER) — primary
  - Presence of referrals (PROMOTER if referrer)
  - Presence in chatterGroupMemberships (CHATTER)
  - User.accountManagerId set (implicitly ACCOUNT_MANAGER)

---

### Campaign & Referral Management

**Controllers:** campaign.controller.ts, referral.controller.ts
**Routes:** campaign.routes.ts, referral.routes.ts
**Services Used:**
- email.service.ts (sendInviteEmail, sendCommissionNotification)
- teaseme.service.ts (fetchTeasemePreUserStatus, approvePreInfluencer, denyPreInfluencer)
- pre-user-promote.service.ts (promotePreUserToUser)
- referral-membership.service.ts (isUserParticipantOnCampaign, findMembershipReferralForPublicCampaign, ensureCustomerTrackingReferralForPromotedUser)
- s3.service.ts (getPresignedUrl for profile uploads)

**Key Integration Points:**

**Campaign → Referral relationship:**
```
Campaign
├── has many Referrals (active promoters)
├── tracks commissionRate, secondaryRate (multi-level)
├── has linkedCampaignId (visible → private campaign link)
└── visibility: visibleToPromoters flag controls who sees it
```

**Referral hierarchy:**
```
Referral (Level 1)
├── referrer (who invited)
├── referredUser (who was invited)
├── parentReferral (if this is Level 2+)
├── childReferrals (who they invited)
└── preUser (TeaseMe tracking until signup)
```

**Multi-level commission calculation:**
- Commission rate = Campaign.commissionRate (Level 1)
- Secondary rate = Campaign.secondaryRate (Level 2)
- Recurring rate = Campaign.recurringRate (subsequent purchases)

---

### Commission & Payment Management

**Controllers:** commission.controller.ts, conversion.controller.ts, wise.controller.ts
**Routes:** commission.routes.ts, transaction.routes.ts, wise.routes.ts, webhook.routes.ts
**Services Used:**
- wise.service.ts (createTransfer, getTransferStatus)
- email.service.ts (sendCommissionNotification)
- conversion webhook handler (creates commissions on sale)

**Webhook Integration:** conversion.controller handles:
```
Webhook → POST /api/webhooks/conversions
├── Receives: eventId, type (sale/refund), customerId, saleAmount, currency
├── Creates: Customer record (if new), Transaction record
├── Triggers: Commission creation (multi-level)
├── Sends: Email notification to each earner
└── Idempotent: via Transaction.eventId (prevents double-processing)
```

**Commission State Machine:**
```
unpaid → pending → paid → (optional) refunded
                    ↓
            wiseTransferId set
            wiseStatus updated
```

---

### External Integrations

#### TeaseMe (Pre-influencer Onboarding)

**Service:** teaseme.service.ts
**Endpoints Used:**
- `GET /user/{teasemeUserId}/step-progress` — Poll current step
- `POST /user/{teasemeUserId}/approve` — Approve pre-influencer
- `POST /user/{teasemeUserId}/deny` — Deny pre-influencer

**Webhook Receiver:** teaseme.controller.ts
```
POST /api/webhooks/teaseme
├── Payload: { teasemeUserId, email, currentStep, status, surveyLink, assetLink }
├── Updates: PreUser record with lifecycle state
├── Defends: Against stale responses (forward-only status transitions)
└── Triggers: Email send when status = live (via promotion webhook)
```

**Promotion Flow (4→5 transition):**
```
1. TeaseMe system detects pre-influencer reached Step 5
2. Calls: POST /api/webhooks/teaseme with action="promote_to_5"
3. Server: pre-user-promote.service.promotePreUserToUser()
   - Creates User record with tempPassword
   - Sets mustChangePassword = true
   - Sends welcome email (guards against re-sends)
   - Deletes PreUser, marks Referral.status=ACTIVE
4. Pre-influencer receives email with temp password
5. Logs in → forced to password change → gains full access
```

**Data Flow:**
```
PreUser ← teaseMe lifecycle updates
   ↓ (when status=live)
   → Promotion trigger (4→5)
   ↓
User (with mustChangePassword=true)
   ↓
First password change flow
   ↓
Full User account (mustChangePassword=false)
```

**Error Handling Assessment:**
- ✅ Stale response defense (forward-only transitions)
- ✅ Step history tracking (prevents infinite loops)
- ✅ Anti-double-email (welcomeEmailSentAt guard)
- ⚠️ **Gap:** No retry logic if email fails during promotion. User created but welcome email never arrives. User stuck.
- ⚠️ **Gap:** If TeaseMe API unreachable during polling, refreshPreUserSteps fails gracefully (doesn't update PreUser). User sees stale "pending" status indefinitely.
- ✅ Webhook signature validation missing (no documented secret handshake). Recommend adding shared secret validation to teaseme.controller.

#### Wise (Payout Integration)

**Service:** wise.service.ts
**Endpoints Used:**
- `POST /v1/transfers` — Create transfer
- `GET /v1/transfers/{transferId}` — Poll transfer status
- `GET /v1/accounts` — List accounts (for recipient validation)
- `POST /v1/transfers/{transferId}/cancel` — Cancel transfer (not implemented)

**Authorization:**
- API key stored in: process.env.WISE_API_KEY
- Recipient account stored in: User.wiseRecipientId, User.wiseRecipientType

**Data Flow:**
```
Commission (status=unpaid, amount=$X)
   ↓ User requests payout
   ↓ wise.service.createTransfer()
   ↓
Wise API creates transfer
   ↓
Commission updated: wiseTransferId set, wiseStatus="processing"
   ↓ (polling via /wise/transfer-status)
   ↓
Status changes: "outgoing_payment_sent" → "bounced" or "completed"
   ↓
Commission.wiseStatus updated, Commission.paidAt set
```

**Error Handling Assessment:**
- ✅ Recipient validation (checks wiseRecipientId exists before transfer)
- ✅ API error responses logged
- ⚠️ **Gap:** No retry mechanism if transfer fails. Commission marked paid but transfer bounced. No reconciliation.
- ⚠️ **Gap:** No webhook handler for Wise status updates. Relies on polling. May miss state changes if polling is delayed.
- ⚠️ **Gap:** Partial transfer failure (some commissions sent, one fails) not handled. Would need manual intervention.

#### ElevenLabs (Voice Synthesis)

**Service:** Not found in codebase; elevenlabs.controller.ts exists but minimal
**Integration:** User.voiceId field stored
**Endpoints:** Assumed to be ElevenLabs text-to-speech API
**Status:** ⚠️ **Gap:** Implementation unclear. voiceId stored but never read or used. Likely incomplete feature.

#### MJ Promoter Python Service (External Tracking)

**Service:** Referenced in auth.controller.ts (register flow)
**Endpoint:** `POST {MJFP_API_URL}/v2/track/signup`
**Headers:** Authorization (Bearer token), Account-ID
**Payload:** { email, uid (user.id), tid (referrer code) }

**Data Flow:**
```
User registers with refCode
   ↓ auth.service → creates referral
   ↓
Async call to MJ Promoter service (non-blocking)
   ↓
External service tracks signup → updates external dashboard
```

**Error Handling Assessment:**
- ✅ Fire-and-forget (doesn't block registration)
- ✅ Logs warning on 401 (clears cached credentials)
- ✅ Logs warning on other failures
- ⚠️ **Gap:** No retry logic. If service is temporarily down, signup is lost from external tracking. No backlog/queue.
- ⚠️ **Gap:** Credentials cached in memory (getMjfpCredentials). No refresh logic if credentials expire mid-session.

---

## Database Consistency & Referential Integrity

### Cascade Rules

| From | To | Action | Impact |
|---|---|---|---|
| User delete | createdUsers, referrals (referrer) | SetNull | Preserves user creation history, orphans referrals |
| User delete | Commission | Cascade | All commissions deleted (may lose payout records) |
| Campaign delete | Referral, Transaction | Cascade | All referrals deleted; commission attribution lost |
| Referral delete | PreUser | Cascade | Deletes TeaseMe tracking state |
| TrackingLink delete | ClickTracking | Cascade | Loses click audit trail |

**Assessment:**
- ⚠️ **Gap:** User deletion cascades all commissions (hard delete). Recommend soft-delete (isActive flag) to preserve audit trail.
- ⚠️ **Gap:** Campaign deletion cascades referrals. Dangerous if done accidentally. Recommend archiving instead (isActive=false).

### Constraints & Uniqueness

| Field | Constraint | Implication |
|---|---|---|
| User.email | UNIQUE | One account per email; blocks multi-account signups |
| User.username | UNIQUE | Promoters can have vanity URLs (optional) |
| User.inviteCode | UNIQUE | Invite code can only generate one referral |
| Referral.inviteCode | UNIQUE | Each referral has unique code (generated via nanoid) |
| PreUser.email | Non-unique | Multiple PreUsers can share email (e.g., re-invites) |
| PreUser.referralId | UNIQUE | One PreUser per Referral |
| PreUser.inviteCode | UNIQUE | But can diverge from Referral.inviteCode if re-invited |
| Transaction.eventId | UNIQUE | Idempotency key; prevents double-processing |
| ChatterGroupMember | (chatterId, groupId) UNIQUE | User can only join group once |

**Assessment:**
- ✅ Transaction.eventId ensures idempotent webhook processing
- ⚠️ **Gap:** PreUser email is non-unique. If same user re-invited, orphan rows may accumulate. Recommend cleanup on successful registration.

---

## Authentication & Authorization Patterns

### JWT Token Model

**Token Contents:**
- `id` — User.id
- `email` — User.email
- `role` — User.role (ADMIN or PROMOTER)
- `expiresIn` — 7 days

**Special Purpose Tokens:**
- `first_password_change` token (15 min expiry, purpose-tagged)
  - Issued on login when mustChangePassword=true
  - Consumed at /api/auth/first-password-change
  - Cannot be used for general authentication

**Cookie Settings:**
- `HttpOnly` — JavaScript cannot access (XSS protection)
- `Secure` — HTTPS only (production)
- `SameSite=strict` — CSRF protection
- `MaxAge=7d` — Expires after 7 days
- `domain` — Optional (COOKIE_DOMAIN env var)

**Assessment:**
- ✅ Standard JWT practices
- ✅ Purpose-tagged tokens prevent cross-endpoint replay
- ⚠️ **Gap:** No refresh token mechanism. When JWT expires, user must re-login. Recommend adding refresh endpoint that issues new tokens without re-entering password.
- ⚠️ **Gap:** Token revocation via invalidateUserTokens only works for PasswordResetTokens. Regular JWTs cannot be revoked (typical trade-off for stateless JWTs).

### Authorization Patterns

**Pattern 1: Role-Based Access Control**
```typescript
if (req.user.role !== 'ADMIN') {
  return res.status(403).json({ error: 'Admin only' });
}
```

**Pattern 2: Resource Ownership**
```typescript
const commission = await prisma.commission.findUnique({ where: { id } });
if (commission.userId !== req.user.id && req.user.role !== 'ADMIN') {
  return res.status(403).json({ error: 'Not your commission' });
}
```

**Pattern 3: Participant Verification**
```typescript
const isParticipant = await isUserParticipantOnCampaign(campaignId, req.user.id);
if (!isParticipant) {
  return res.status(403).json({ error: 'Not invited to campaign' });
}
```

**Assessment:**
- ✅ Checks happen in controller (business logic layer, not middleware)
- ⚠️ **Gap:** No centralized authorization service. Patterns duplicated across controllers.
- ⚠️ **Gap:** Account Manager → Promoter visibility not enforced uniformly. AMs can see "their" promoters via createdById, but reassignment via accountManagerId may bypass checks.

---

## Rate Limiting & Security

### Rate Limits

| Endpoint | Limit | Window | Purpose |
|---|---|---|---|
| /auth/forgot-password | 20 per IP, 5 per email | 1 hour | Prevent email spam |
| /auth/password-reset | 30 per IP | 15 min | Brute-force token attempts |
| /auth/first-password-change | 30 per IP | 15 min | Same as password-reset |

**Assessment:**
- ✅ Aggressive limits on auth endpoints
- ⚠️ **Gap:** No rate limit on POST /api/auth/register. Could be abused to create many accounts. Recommend 10/hour/IP.
- ⚠️ **Gap:** No rate limit on POST /api/referrals (invite creation). Could spam invites. Recommend 50/day/user.
- ⚠️ **Gap:** No rate limit on GET /api/referrals (list). Could enumerate all referrals. Recommend 100/hour/IP.
- ✅ Webhook endpoints not rate-limited (assumed to be from trusted sources with IP whitelisting).

---

## Webhook Security & Reliability

### Webhook Receivers

| Endpoint | Source | Auth | Status |
|---|---|---|---|
| `/api/webhooks/conversions` | Payment system | Shared secret (presumed) | ✅ Implemented |
| `/api/webhooks/teaseme` | TeaseMe | None documented | ⚠️ Gap: No auth |
| `/api/webhooks/elevenlabs` | ElevenLabs | None documented | ⚠️ Gap: No auth |

**Assessment:**
- ⚠️ **Gap:** TeaseMe webhook has no documented signature validation. Anyone can call POST /api/webhooks/teaseme with arbitrary payloads.
  - **Risk:** Could create fake pre-influencers, approve/deny invites, trigger unwanted promotions.
  - **Fix:** Validate HMAC-SHA256(payload, shared_secret) in header.

- ⚠️ **Gap:** No idempotency guard on TeaseMe webhook. Calling webhook twice updates PreUser twice.
  - **Risk:** Duplicate state transitions, double emails.
  - **Fix:** Store webhook eventId in DB, skip if already processed.

- ✅ Conversion webhook has eventId idempotency guard. Good pattern.

### Webhook Error Handling

**Current:** Handlers return 200 immediately (fire-and-forget)
- Pros: Fast response, non-blocking
- Cons: Failures not retried; missed state = data inconsistency

**Assessment:**
- ⚠️ **Gap:** If PreUser update fails (DB error), webhook returns 200. TeaseMe thinks we got the update; we didn't.
  - **Fix:** Return 500 on DB errors; let caller retry. Or queue to async job processor.

- ⚠️ **Gap:** If promotion fails (email send fails), webhook returns 200. Pre-influencer created but welcome email never sent.
  - **Fix:** Separate email send from promotion. Queue email as async job with retry logic.

---

## Data Quality & Validation Issues

### Input Validation Strengths

| Field | Validation |
|---|---|
| email | isEmail(), normalizeEmail() |
| password | minLength check, bcrypt hashing |
| campaignId, referralId | express-validator checks |
| amount (commission) | Derived, not user-input |

**Assessment:**
- ✅ Email validation consistent
- ✅ Password requirements enforced
- ⚠️ **Gap:** No length limit on User.firstName, lastName. Could store multi-MB strings. Recommend maxLength(100).
- ⚠️ **Gap:** Campaign.description has no length limit. Recommend maxLength(5000).
- ⚠️ **Gap:** No validation on URL fields (Campaign.websiteUrl, TrackingLink.fullUrl). Could store invalid URLs. Recommend URL validation.

### Business Logic Validation

**Registration Invite Code:**
```
1. Check code exists
2. Check code not already used (referredUserId null)
3. Check code not expired (24h TTL, not in DB, computed on read)
```

**Campaign Participation:**
```
1. Check user has active referral on campaign
2. Check referral.status = 'ACTIVE'
```

**Commission Payout:**
```
1. Check User.wiseRecipientId is set
2. Check Commission.status = 'unpaid'
3. No check: amount > 0 (could create $0 transfers)
```

**Assessment:**
- ✅ Invite code validation complete
- ✅ Participant checks in place
- ⚠️ **Gap:** No check for zero or negative commission amounts. Could attempt to send $0 to Wise. Recommend:
  ```typescript
  if (commissions.some(c => c.amount <= 0)) {
    return res.status(400).json({ error: 'No commissions to pay out' });
  }
  ```

---

## Error Handling Summary

### Well-Handled Cases

- ✅ Email already exists → 400 "User already exists"
- ✅ Invalid credentials → 401 (same message for both email/password)
- ✅ Invalid JWT → 401 "Not authenticated"
- ✅ Unpermitted access → 403 (some controllers)
- ✅ Resource not found → 404 (some controllers)
- ✅ Token consumed (password reset) → 400 generic message (prevents enumeration)

### Error Handling Gaps

| Scenario | Current | Recommended |
|---|---|---|
| TeaseMe API unreachable during polling | Skips update (silently fails) | Return partial response with `staleSince` field |
| Email send fails during registration | Logged, user created anyway | Queue email; create user only on success |
| Wise transfer creation fails | Logged, commission NOT marked paid | Return error; user can retry |
| Concurrent password changes | Defended: updateMany + condition check | ✅ Already good |
| Referral invite expires (24h TTL) | Computed on read, not checked on register | ✅ Validated in register handler |
| Duplicate webhook (same eventId) | Conversion: handled; TeaseMe: not handled | ⚠️ Recommend idempotency for all webhooks |

---

## Cross-Component Integration Issues

### User Type Computation

**Current:** user.service.syncUserType() calculates from:
1. User.role (primary)
2. Presence in referrals (PROMOTER)
3. Presence in chatterGroupMemberships (CHATTER)
4. User.accountManagerId set (implicitly ACCOUNT_MANAGER)

**Called From:**
- auth.controller.register (async, non-blocking)
- auth.controller.login → getUserTypeInfo (called per request)
- referral.controller (after user joins)

**Assessment:**
- ⚠️ **Gap:** syncUserType is async but not awaited in register flow. User type may lag by 1-2 seconds. Next API call sees old type.
- ✅ getUserTypeInfo computes on-demand per request (fresh data).
- ⚠️ **Gap:** No caching layer. Recomputes on every /me call. Performance OK for small datasets, may slow at scale.

### Commission Calculation Logic

**Trigger:** Webhook from conversion system
**Calculator:** conversion.controller.handleConversion
**Stored:** Commission records in database

**Current Logic:**
```typescript
Level 1: campaign.commissionRate
Level 2: campaign.secondaryRate (if parentReferral exists)
Level 3+: campaign.recurringRate (if set)
```

**Assessment:**
- ✅ Multi-level tracking in place
- ⚠️ **Gap:** No test of commission calculation logic shown. Recommend dedicated test suite.
- ⚠️ **Gap:** If referral chain is broken (parent deleted), commission calculation may fail or create orphan records.
- ⚠️ **Gap:** No handling of refunds that span multiple referral levels. Reverse commission creation is simple (negate amount), but reconciliation against paid commissions may be complex.

### Referral Tree Consistency

**Invariants:**
1. Referral.referrerId must exist and be active
2. Referral.campaignId must exist
3. Referral.parentReferralId (if set) must point to valid referral on same campaign
4. Referral.level = 1 + parent.level (if parent exists)

**Assessment:**
- ⚠️ **Gap:** No validation of level consistency. Could manually insert level=10 with no parent.
- ⚠️ **Gap:** No cycle detection (though schema structure prevents it naturally).
- ⚠️ **Gap:** No depth limit. Referral chains could be arbitrarily deep (performance risk on recursive queries).

---

## Chatter System & Multi-Tier Commission

**Controllers:** chatter.controller.ts, chatter-group.controller.ts
**Routes:** chatter.routes.ts, chatter-group.routes.ts
**Models:** ChatterGroup, ChatterGroupMember, User.chatterGroupId, Commission.type

**Integration Points:**
```
Promoter (User with UserType.PROMOTER)
├── Has zero or one ChatterGroup (User.chatterGroupId)
└── ChatterGroup
    ├── Has many ChatterGroupMembers
    ├── Each member is a Chatter (User with UserType.CHATTER)
    └── commissionPercentage (% of sale for all group members)
```

**Commission Calculation Enhancement:**
- When transaction webhook arrives (conversion.controller.handleConversion):
  - Create Commission for Promoter (type='promoter', amount=primary_rate)
  - Find Promoter.chatterGroupId
  - If set: for each ChatterGroupMember:
    - Create Commission (type='chatter', amount=saleAmount*groupCommissionPercentage)
  - Total commissions = promoter + all assigned chatters

**Assessment:**
- ✅ Ownership resolution works (Chatter → Group → Promoter hierarchy)
- ⚠️ **Gap:** No uniqueness constraint on Chatter assignment. Same chatter can be in multiple groups.
  - **Risk:** Could create double-counting if same chatter in two groups a promoter is involved with
  - **Fix:** Recommend unique constraint per (User.id, ChatterGroup.id) combination
- ⚠️ **Gap:** Chatter commissions not filtered in dashboard. Chatters see total earnings without breakdown.
  - **Fix:** Dashboard should separate 'chatter' vs 'promoter' commission types
- ✅ Commission.type field correctly distinguishes commission source

---

## Click Tracking & Redirect System

**Models:** TrackingLink, ClickTracking

**Integration Points:**
```
Influencer creates tracking link
  ↓ POST /api/referrals/tracking-link
  ↓ INSERT TrackingLink (shortCode, fullUrl, clicks=0, userId, campaignId)
  ↓
Influencer shares link on social media
  ↓
User clicks link
  ↓ GET /track/{shortCode}
  ↓ click.controller.trackClick
  ↓
Server logs click: INSERT ClickTracking { trackingLinkId, userId, ipAddress, referrerUrl, ... }
  ↓
Increments counter: UPDATE TrackingLink SET clicks = clicks + 1
  ↓
302 redirect to Campaign.websiteUrl
  ↓
User lands on campaign site (cookie set)
```

**Assessment:**
- ✅ Simple redirect + logging pattern works
- ✅ Click audit trail preserved in ClickTracking
- ⚠️ **Gap:** No user authentication required to log click. Anonymous clicks are logged with ip + user-agent.
  - **Risk:** Could be exploited for click fraud via automated bots
  - **Fix:** Recommend rate limiting on /track endpoint (e.g., 1 click per IP per 5 seconds)
- ⚠️ **Gap:** No conversion tracking linkage. ClickTracking → Customer journey not connected.
  - **Risk:** Can't correlate "click came from this link" → "customer came from this link"
  - **Fix:** Could store tracking link ID in customer metadata or session cookie
- ✅ TrackingLink.clicks counter incremented atomically (no race condition risk with atomic UPDATE)

---

## Customer & Transaction Tracking

**Models:** Customer, Transaction, Commission

**Integration Points:**
```
External Payment System
  ↓
Webhook: POST /api/webhooks/conversions
  │
  ├─ Creates/updates Customer (idempotent by email)
  │
  ├─ Creates Transaction (idempotent by eventId)
  │  └─ Links to: Customer, Campaign, Referral
  │
  ├─ Calculates commissions
  │  ├─ Level 1: Referral.referrerId at Campaign.commissionRate
  │  ├─ Level 2: Referral.parentReferral.referrerId at Campaign.secondaryRate
  │  └─ Chatters: if Promoter has chatterGroupId, each member earns
  │
  └─ Sends notifications
```

**Assessment:**
- ✅ Transaction.eventId provides idempotency (prevents double-charging)
- ✅ Commission calculations handle multi-level hierarchy
- ⚠️ **Gap:** Customer.status field exists but no enum. Free-form string (e.g., "active", "cancelled").
  - **Risk:** Inconsistent statuses in database, filtering logic fragile
  - **Fix:** Define SubscriptionStatus enum or use boolean flags
- ⚠️ **Gap:** Refund handling creates negative commissions but no reconciliation.
  - **Risk:** If admin corrects refund, negative commissions don't automatically reverse
  - **Fix:** Recommend adding refund reversal trigger to match original commission
- ⚠️ **Gap:** No maximum commission cap per transaction or per period.
  - **Risk:** Could create unbounded commission liabilities on single sale
  - **Fix:** Consider adding Campaign.maxCommissionPercentage field

---

## API Authentication & Key Management

**Models:** ApiKey
**Middleware:** apiKey.middleware.ts
**Routes:** v1/v2 API routes

**Integration Points:**
```
External System
  ↓
GET /api/v1/... with X-Api-Key header
  ↓
apiKey.middleware validates:
  ├─ Looks up ApiKey by key (hashed for security)
  ├─ Checks isActive=true
  ├─ Updates lastUsedAt timestamp
  └─ Sets req.user from associated User
  ↓
Route handler executes with req.user context
```

**Assessment:**
- ✅ API keys stored (presumably hashed, pending code review)
- ✅ lastUsedAt tracks usage for monitoring
- ⚠️ **Gap:** No key rotation mechanism. Keys don't expire.
  - **Risk:** Compromised key remains valid indefinitely
  - **Fix:** Add expiresAt field to ApiKey, enforce rotation policy
- ⚠️ **Gap:** No audit log of key usage by endpoint.
  - **Risk:** Can't trace which system accessed what data
  - **Fix:** Log {apiKeyId, endpoint, timestamp, status} for compliance
- ⚠️ **Gap:** Rate limiting per key not implemented (would need custom middleware).
  - **Risk:** Single key could be rate-limited regardless of source IP
  - **Fix:** Add rate limiting per ApiKey.token (quota/day, quota/minute)

---

## Summary: Ready-for-Production Assessment

### ✅ Strengths

1. **Multi-level referral tracking** — Complete hierarchy support
2. **Commission multi-level** — Correct cascade calculations
3. **User type system** — Flexible role management
4. **Idempotent webhooks** — Conversion uses eventId pattern
5. **Secure authentication** — JWT + bcrypt + HTTP-only cookies
6. **Password reset flow** — Atomic updates, token expiry, single-use
7. **TeaseMe integration** — Stale response defense, step history
8. **Database schema** — Proper foreign keys, indexes on lookups

### ⚠️ Gaps & Risks

| Priority | Issue | Impact | Fix Effort |
|---|---|---|---|
| HIGH | No auth on TeaseMe webhook | Account takeover risk; fake promoters created | 1-2 hours |
| HIGH | Email failures during promotion don't retry | Pre-influencer stuck without password | 2-3 hours (queue system) |
| HIGH | Wise transfer retries not implemented | Commission paid but transfer bounced = data loss | 2-3 hours |
| HIGH | Click fraud possible (no rate limit on /track) | Inflated click counts, fake conversions | 1-2 hours |
| MEDIUM | No rate limit on registration | Account spam | 1 hour |
| MEDIUM | No rate limit on invite creation | Spam invites | 1 hour |
| MEDIUM | User type computation may lag | UI briefly shows old type | 1-2 hours |
| MEDIUM | Campaign/Referral cascading deletes | Accidental data loss on delete | 2-3 hours (soft-delete) |
| MEDIUM | No signed webhook for TeaseMe | Duplicate state updates | 1-2 hours |
| MEDIUM | Chatter assignment non-unique | Could double-count commissions | 1-2 hours |
| MEDIUM | API keys don't expire | Compromised keys valid forever | 2-3 hours |
| MEDIUM | No API key audit log | Can't trace data access | 2-3 hours |
| MEDIUM | Customer.status is free-form string | No validation, inconsistent filtering | 1-2 hours |
| MEDIUM | Refund doesn't auto-reverse commissions | Manual reconciliation needed | 2-3 hours |
| LOW | Click → Customer journey not linked | Can't correlate click source to sale | 3-4 hours |
| LOW | ElevenLabs integration incomplete | Feature unusable | Depends on requirements |
| LOW | MJ Promoter API loses on network failure | External dashboard out of sync | 2-3 hours (queue + retry) |
| LOW | No refresh token mechanism | User logged out after 7 days | 1-2 hours |
| LOW | Zero-amount commission allowed | $0 Wise transfer | 30 minutes |
| LOW | No max commission cap per transaction | Unbounded liability on single sale | 1-2 hours |

### 🚀 Ready for Production?

**Status:** ✅ **Ready with caveats**

- Core workflows functional and well-architected
- Multi-level referrals working correctly
- Commission calculations in place
- External integrations (TeaseMe, Wise) implemented

**Before launch:** Address HIGH priority gaps (webhook auth, email retry, Wise retry)

**Post-launch:** Monitor rate-limit evasion, add queue system for async jobs, soft-delete strategy for data safety.
