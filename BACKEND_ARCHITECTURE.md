# Backend Architecture - MJ First Promoter

Complete low-level architecture documentation showing how backend components interact.

## System Topology

### Express.js Application Structure

**Entry Point:** `src/server.ts`
- Configures Express app with CORS, JSON parsing, cookie handling
- Sets up trust proxy for production load balancers
- Mounts all route handlers
- Error handling middleware at the end

**Core Dependencies:**
- `express` — HTTP server framework
- `@prisma/client` — ORM for database operations
- `jsonwebtoken` — JWT authentication
- `bcryptjs` — Password hashing
- `express-validator` — Request validation
- `express-rate-limit` — Rate limiting for public endpoints

### Route Organization

Routes are mounted hierarchically in `src/server.ts`:

```
/api/auth → authRoutes
/api/campaigns → campaignRoutes
/api/chatters → chatterRoutes
/api/chatter-groups → chatterGroupRoutes
/api/referrals → referralRoutes
/api/users → userRoutes
/api/dashboard → dashboardRoutes
/api/commissions → commissionRoutes
/api/customers → customerRoutes
/api/transactions → transactionRoutes
/api/wise → wiseRoutes
/api/elevenlabs → elevenLabsRoutes
/api/public → publicRoutes (no auth required)
/api/webhooks → webhookRoutes (shared secret auth)
/api/v1 → apiV1Routes (FirstPromoter-compatible)
/api/v2 → apiV2Routes (FirstPromoter-compatible)
```

### Middleware Stack

**Global Middleware** (applied to all routes):
1. CORS configuration (`cors`) — restricts to FRONTEND_URL origins
2. Cookie parser (`cookie-parser`) — parses HTTP-only cookies
3. JSON body parser (`express.json()`) — parses `application/json`
4. URL-encoded parser (`express.urlencoded()`) — parses form data

**Per-Route Middleware:**
- `authenticate` (most protected routes) — validates JWT token, extracts user
- `apiKey.middleware` (v1/v2 routes) — validates API key or Bearer token
- `express-validator` — validates request bodies before controller execution
- `express-rate-limit` — rate limiting on password/auth endpoints

**Error Handling:**
- Global error handler at end of middleware stack — catches all errors, logs them, returns 500 with stack trace (dev only)

## Prisma Data Model

### Models & Relationships

**User** (Accounts for admin, account managers, promoters, chatters, payers)
- Has many: createdUsers, managedUsers, createdCampaigns, referralsMade, referralsReceived, commissions, trackingLinks, clickTracking, apiKeys, chatterGroupMemberships, createdChatterGroups, socialLinks, passwordResetTokens
- One chatterGroup (via chatterGroupId, one-to-one)
- Fields: id, email, username, password, firstName, lastName, inviteCode, role (ADMIN/PROMOTER), userType (ADMIN/ACCOUNT_MANAGER/TEAM_MANAGER/PROMOTER/CHATTER/PAYER), isActive, mustChangePassword, wiseEmail, wiseRecipientId, wiseRecipientType, voiceId, profilePhotoKey, profileVideoKey, teasemeSyncedAt, createdById, accountManagerId, createdAt, updatedAt
- Indexes: email, username, role, inviteCode, createdById, accountManagerId

**Campaign** (Promotional campaigns with commission rates)
- Has many: referrals, trackingLinks, commissions, customers, transactions
- BelongsTo: createdBy (User), linkedCampaign (Campaign)
- Fields: id, name, description, websiteUrl, commissionRate, secondaryRate, recurringRate, isActive, startDate, endDate, cookieLifeDays, autoApprove, defaultReferralUrl, visibleToPromoters, maxInvitesPerMonth, linkedCampaignId, createdById, createdAt, updatedAt
- Indexes: createdById, isActive, linkedCampaignId

**Referral** (Multi-level referral relationships)
- Has many: commissions, clicks, customers, transactions, childReferrals
- BelongsTo: campaign (Campaign), referrer (User), referredUser (User), parentReferral (Referral)
- Relationships: preUser (one-to-one)
- Fields: id, inviteCode (unique), status (PENDING/ACTIVE/COMPLETED/CANCELLED), level, metadata (JSON), createdAt, updatedAt, acceptedAt, campaignId, referrerId, referredUserId, parentReferralId
- Indexes: inviteCode, campaignId, referrerId, referredUserId, status

**PreUser** (TeaseMe onboarding state for pending invitees)
- BelongsTo: referral (Referral, via referralId, cascade on delete)
- Fields: id, email, referralId (unique), inviteCode (unique), teasemeUserId, currentStep, status, surveyLink, assetLink, stepHistory (JSON), lastCheckedAt, welcomeEmailSentAt, createdAt, updatedAt
- Indexes: email

**TrackingLink** (Unique URLs per user-campaign)
- Has many: clickTracking
- BelongsTo: user (User), campaign (Campaign)
- Fields: id, shortCode (unique), fullUrl, clicks, createdAt, updatedAt, userId, campaignId
- Indexes: shortCode, userId, campaignId

**ClickTracking** (Individual click events)
- BelongsTo: trackingLink (TrackingLink), user (User), referral (Referral)
- Fields: id, ipAddress, userAgent, referrerUrl, metadata (JSON), createdAt, trackingLinkId, userId, referralId
- Indexes: trackingLinkId, createdAt

**Customer** (End customers who made purchases)
- Has many: commissions, transactions
- BelongsTo: campaign (Campaign), referral (Referral)
- Fields: id, email, name, revenue, status, subscriptionType, metadata, createdAt, updatedAt, campaignId, referralId
- Indexes: campaignId, referralId, email

**Transaction** (Sale/refund events)
- Has many: commissions
- BelongsTo: customer (Customer), campaign (Campaign), referral (Referral)
- Fields: id, eventId (unique), type (sale/refund), saleAmount, currency, status, plan, createdAt, customerId, campaignId, referralId, originalTransactionId
- Indexes: eventId, customerId, campaignId

**Commission** (Earned commissions)
- BelongsTo: user (User), campaign (Campaign), referral (Referral), customer (Customer), transaction (Transaction)
- Fields: id, amount, percentage, saleAmount, status (unpaid/paid/pending), description, createdAt, paidAt, wiseTransferId, wiseStatus, type (promoter/chatter), userId, campaignId, referralId, customerId, transactionId
- Indexes: userId, campaignId, status, customerId, transactionId, type

**ChatterGroup** (Named group of chatters with commission %)
- Has many: members (ChatterGroupMember), promoter (User, one-to-one via User.chatterGroupId)
- BelongsTo: createdBy (User)
- Fields: id, name, tag, commissionPercentage, createdAt, updatedAt, createdById
- Indexes: createdById

**ChatterGroupMember** (Many-to-many: chatters ↔ groups)
- BelongsTo: chatter (User), group (ChatterGroup)
- Fields: id, assignedAt, chatterId, groupId
- Unique constraint: (chatterId, groupId)
- Indexes: chatterId, groupId

**ApiKey** (External integrations)
- BelongsTo: user (User)
- Fields: id, name, key (unique), token (unique), accountId, isActive, lastUsedAt, createdAt, updatedAt, userId
- Indexes: key, token

**SocialLink** (User social media profiles)
- BelongsTo: user (User)
- Fields: id, platform, url, createdAt, updatedAt, userId
- Unique constraint: (userId, platform)
- Indexes: userId

**PasswordResetToken** (One-time password reset/invite tokens)
- BelongsTo: user (User)
- Fields: id, userId, tokenHash (unique), purpose (INVITE/RESET), expiresAt, consumedAt, createdAt
- Indexes: userId

## Controllers & Their Responsibilities

### Authentication (auth.controller.ts)

**register(req, res)** — Create new user, optionally link to referral
- Validates email uniqueness, password strength
- If inviteCode provided: finds referral, validates it's unused, marks referral.referredUserId and status=ACTIVE
- Resolves ownership chain (createdById, accountManagerId) from referrer
- If refCode provided: finds referrer, creates new referral, syncs to MJ Promoter API
- Clears PreUser records for same email
- Creates customer tracking referral for proper commission attribution
- Mints JWT token, sets httpOnly cookie

**login(req, res)** — Authenticate user
- Finds user by email, verifies password (bcrypt)
- If mustChangePassword flag set: returns temporary JWT for password change flow
- Otherwise: mints regular session JWT, sets cookie

**firstPasswordChange(req, res)** — Consume temporary JWT, set real password
- Verifies changeToken JWT (purpose-tagged)
- Atomic updateMany with mustChangePassword guard (prevents race conditions)
- Sets new password, clears flag, mints session JWT

**forgotPassword(req, res)** — Send password reset email
- Always responds 200 (avoids account enumeration)
- Creates PasswordResetToken with hash, expiry
- Sends email with reset link
- Rate-limited by IP and email

**validateResetToken(req, res)** — Verify reset token before setting password
- Validates token exists, not expired, not consumed
- Returns email + firstName for UI

**resetPassword(req, res)** — Consume reset token, set new password
- Validates and consumes token atomically
- Hashes password, updates user, invalidates all other tokens
- Activates user if invite flow
- Mints session JWT

**logout(req, res)** — Clear auth cookie
- Works even if token invalid/expired
- Clears cookie with and without domain (for dev/prod compatibility)

**getCurrentUser(req, res)** — Fetch authenticated user profile
- Returns full user object + userTypeInfo (computed from referrals/groups)

**refreshToken(req, res)** — Renew JWT expiry
- Mints new JWT, updates cookie

**getUserType(req, res)** — Fetch computed user type info
- Returns capabilities based on role + referrals (promoter, account manager, chatter)

### Referral (referral.controller.ts)

**createReferralInvite(req, res)** — Generate invite for another user
- Validates campaignId, referrer is participant on campaign
- Creates referral with unique inviteCode, status=PENDING
- Creates PreUser record for TeaseMe tracking
- Sends invite email with registration link

**listReferrals(req, res)** — List referrals by campaign/filter
- Filters by campaignId, status, level
- Refreshes PreUser TeaseMe status (polling if TTL expired)
- Returns paginated list with computed expiryDate, progressChip

**getReferralDetails(req, res)** — Fetch single referral with full tree
- Returns referral + parent/child referrals + preUser state

**approvePreInfluencer(req, res)** — Mark pending TeaseMe user as approved
- Calls teaseme.service.approvePreInfluencer()
- Updates PreUser status to "order_lp"

**denyPreInfluencer(req, res)** — Reject pending TeaseMe user
- Calls teaseme.service.denyPreInfluencer()
- Deletes PreUser, marks referral status=CANCELLED

### User (user.controller.ts)

**listUsers(req, res)** — Paginated user list (admin/AM only)
- Filters by role, search term, createdById
- Excludes password

**getUserById(req, res)** — Fetch user details
- Authorization: admin, same user, or account manager of user

**updateUser(req, res)** — Modify user fields
- Validates email uniqueness, password (if changing)
- Sets accountManagerId if AM reassigning

**inviteUser(req, res)** — Invite new user (admin/AM only)
- Creates user with inviteCode, mustChangePassword=true
- Calls createPasswordResetToken
- Sends invite email
- Resolves ownership from inviter

**deactivateUser(req, res)** — Soft-delete user
- Sets isActive=false (preserves data for audit)

### Campaign (campaign.controller.ts)

**createCampaign(req, res)** — New campaign (admin only)
- Validates websiteUrl, commission rates
- Sets createdById=currentUser.id

**listCampaigns(req, res)** — Filter campaigns
- Admin sees all; AM sees only assigned; promoter sees visible=true

**getCampaignDetails(req, res)** — Fetch campaign + stats
- Returns campaign + referralCount, commissionTotal

**updateCampaign(req, res)** — Modify campaign (admin only)
- Updates fields, maintains createdBy

**addCampaignManager(req, res)** — Assign AM to campaign (admin only)
- Creates or updates assignment (no dedicated junction; AM tracks createdById)

### Commission (commission.controller.ts)

**listCommissions(req, res)** — Filter commissions
- Admin sees all; user sees own only
- Filters by status, dateRange, campaignId

**getCommissionDetails(req, res)** — Fetch commission details
- Returns commission + related transaction, referral, user

**updateCommissionStatus(req, res)** — Manually set status (admin only)
- Updates status (unpaid→pending→paid)
- Can set paidAt, wiseTransferId, wiseStatus

**approveCommission(req, res)** — Mark commission ready for payout
- Sets status=pending, paidAt timestamp

### Dashboard (dashboard.controller.ts)

**getDashboardStats(req, res)** — Role-specific summary
- Admin: totalCampaigns, totalAMs, totalPromoters, totalCommissions
- AM: managedCampaigns, myPromoters, myReferrals, myCommissions (sum)
- Promoter: myReferrals (direct + indirect), activeReferrals, earnings (paid/pending)

### External Integrations

**teaseme.controller.ts** — Webhooks from TeaseMe
- `POST /api/webhooks/teaseme` — Receives pre-influencer lifecycle updates
- Receives `userId`, `currentStep`, `status` → updates PreUser
- Triggers email send when status=live (via pre-user-promote.service)

**wise.controller.ts** — Payout management
- `POST /api/wise/create-transfer` — Initiate Wise transfer for commission
- `GET /api/wise/transfer-status/:transferId` — Poll transfer status
- Calls wise.service to communicate with Wise API

**elevenlabs.controller.ts** — Voice synthesis for promoters
- Updates user.voiceId field
- Calls ElevenLabs API to generate voice profiles

**conversion.controller.ts** — Transaction webhooks
- `POST /api/webhooks/conversions` — Receive sale/refund events from payment system
- Creates/updates Customer, Transaction, and cascades Commission calculations

## Services Layer

### email.service.ts

Centralized email dispatch using nodemailer/SendGrid:

**sendWelcomeEmail(user, campaign)** — New promoter welcome
**sendInviteEmail(referral, recipient, campaign)** — Invite to join campaign
**sendPasswordResetEmail(user, resetUrl, expiresAt)** — Password reset link
**sendInviteEmail(user, referral)** — Referral invite link
**sendCommissionNotification(commission, user)** — Commission earned

All emails include:
- Branded template (from email-compose.service)
- Unsubscribe link
- Timestamp for audit

### teaseme.service.ts

TeaseMe integration for pre-influencer onboarding:

**fetchTeasemePreUserStatus(teasemeUserId)** — Poll step-progress endpoint
**approvePreInfluencer(preUserId)** — Call approve endpoint, update status=order_lp
**denyPreInfluencer(preUserId)** — Call deny endpoint, delete PreUser
**reassignPreInfluencer(preUserId, newAMId)** — Change ownership
**notifyChattersAssigned(preUserId, chatterGroupIds)** — Assign to chatter groups

Handles:
- Stale response defense (forward-only status transitions)
- Step history tracking (up to 20 entries)
- Survey/asset link capture
- Welcome email delivery (anti-double-send via welcomeEmailSentAt)

### pre-user-promote.service.ts

Lifecycle promotion from TeaseMe (Step 4→5) to full User account:

**promotePreUserToUser(preUserId)** — Atomic creation + linkage
- Reads PreUser + linked Referral
- Creates User with inherited ownership (createdById, accountManagerId from referrer)
- Sets mustChangePassword=true (user receives temp password in welcome email)
- Deletes PreUser, marks Referral.status=ACTIVE, acceptedAt=now
- Sends welcome email once (guards with welcomeEmailSentAt)

**resolveOwnership(referralId)** — Walk referral chain to find AM
- If referrer is AM/Admin → createdById = referrer, accountManagerId = referrer
- Else → createdById = referrer, accountManagerId = referrer's accountManagerId
- Returns { createdById, accountManagerId } for new user creation

### wise.service.ts

Wise payout integration:

**createTransfer(userId, amount, currency)** — Initiate payout
- Reads User.wiseRecipientId + wiseRecipientType
- Calls Wise API createTransfer endpoint
- Stores transferId in Commission.wiseTransferId
- Sets Commission.wiseStatus = initial status

**getTransferStatus(transferId)** — Poll transfer state
- Calls Wise API getTransfer endpoint
- Updates Commission.wiseStatus, Commission.paidAt if completed
- Returns { status, statusReason, completionEstimate }

### user.service.ts

User-specific operations:

**syncUserType(userId)** — Compute userType from referrals + groups
- If user has referrals as referrer → PROMOTER
- If user has chatterGroupMemberships → CHATTER
- If user.accountManagerId set → also ACCOUNT_MANAGER (computed for API response)
- If user.role == ADMIN → ADMIN
- Updates user.userType field

**getUserTypeInfo(userId)** — Return computed type capabilities
- { isPromoter, isAccountManager, isChatter, isPayer, isAdmin }

### s3.service.ts

Profile media uploads:

**getPresignedUrl(userId, mediaType)** — Generate temporary upload URL
- Creates path like `influencers/<username>/profile.jpg`
- Returns presigned POST URL valid for 15min
- Frontend uploads directly to S3

### referral-membership.service.ts

Campaign membership management:

**findMembershipReferralForPublicCampaign(campaignId, promoterId)** — Find active referral on public campaign
**isUserParticipantOnCampaign(campaignId, userId)** — Check if user has active referral
**ensureCustomerTrackingReferralForPromotedUser(inviteReferralId, promotedUserId)** — Create shell referral
- If user registered via private invite, creates second referral on linked public campaign
- Ensures commission attribution for customer tracking

### password-reset.service.ts

Token lifecycle management:

**createPasswordResetToken(userId, purpose)** — Create one-time token
- Generates random token, hashes it (sha256), stores hash
- Sets expiry 24h out
- Returns { rawToken, expiresAt }

**validatePasswordResetToken(rawToken)** — Verify token validity
- Hashes raw token, checks hash exists and not expired/consumed
- Returns { userId, email, firstName, purpose }

**consumePasswordResetToken(rawToken)** — Mark token used
- Atomically sets consumedAt=now (prevents replay)
- Returns token record or null if invalid

**invalidateUserTokens(userId)** — Revoke all outstanding resets
- Sets consumedAt=now on all unconsumed tokens for user

### ownership.service.ts

Account manager assignment resolution:

**resolveOwnership(referralId, defaultAMId?)** — Walk ownership chain
- Starts at referral.referrerId
- If referrer is AM/Admin → returns referrer.id as accountManagerId
- If referrer is promoter → returns referrer.accountManagerId (inherits)
- Falls back to defaultAMId if chain broken
- Used during registration + invite to assign new users

## Middleware Chain Details

### auth.middleware.ts

**authenticate(req, res, next)** — Verify JWT token
- Reads JWT from cookies or Authorization header
- Verifies signature against JWT_SECRET
- Extracts user data (id, email, role)
- Attaches to `req.user`
- Calls next() if valid; returns 401 if invalid/expired

### apiKey.middleware.ts

**validateApiKey(req, res, next)** — Authenticate v1/v2 API
- Reads `X-Api-Key` header or `Authorization: Bearer` token
- Looks up ApiKey or User by key/token
- Validates isActive=true
- Updates lastUsedAt timestamp
- Attaches user to `req.user`
- Calls next() if valid; returns 401 if invalid

## Database Indexes & Performance

**High-Cardinality Indexes:**
- `users.email` — login, user lookups
- `users.inviteCode` — invite validation
- `referrals.inviteCode` — accept invite
- `referrals.campaignId` — list campaign referrals
- `referrals.referrerId` — list user's referrals made
- `commissions.userId` — list user's commissions
- `commissions.status` — filter pending/unpaid
- `transactions.eventId` — idempotency check
- `tracking_links.shortCode` — redirect resolution

**Foreign Key Cascade:**
- `Referral.campaignId` → Campaign (cascade delete)
- `PreUser.referralId` → Referral (cascade delete)
- `Commission.userId` → User (cascade delete)
- All track creation for audit

## Error Handling Patterns

**Validation Errors:**
- express-validator collects errors from middleware
- Controller checks `validationResult(req).isEmpty()`
- Returns 400 with error array before database writes

**Database Errors:**
- Prisma throws on constraint violations (unique, foreign key)
- Controllers catch and return appropriate status (400 for validation, 409 for conflict)

**Third-Party Failures:**
- TeaseMe polling failures logged, don't block workflow (graceful degradation)
- Wise transfer failures logged; commission stays unpaid until retry
- Email send failures logged; user still created (non-blocking)

**Authorization:**
- Authentication middleware blocks 401
- Controllers manually check role/ownership for 403
- No permission checks happen in middleware (authorization is business logic)

## Data Consistency Guarantees

**Atomic Operations:**
- User creation with owned records (referral linkage, PreUser creation) in single transaction where applicable
- Commission creation triggered by transaction webhook (idempotent via Transaction.eventId)

**Referential Integrity:**
- Foreign keys enforced by Postgres
- Cascades clean up PreUser when Referral deleted
- Cascades clean up TrackingLink when Campaign deleted

**Eventual Consistency:**
- Commission calculation happens asynchronously (via webhook)
- TeaseMe state is polled (not pushed), eventual updates on next list render
- Email sends are fire-and-forget (failures don't block response)

## Additional Controllers & Features

### Chatter System (chatter.controller.ts, chatter-group.controller.ts)

**Purpose:** Manage "chatters" — voice/content creators who can be assigned to promoters' campaigns

**User Type:** UserType.CHATTER (distinct from PROMOTER)

**ChatterGroup Model:**
- Has many members (ChatterGroupMember relation)
- Each chatter group has a `commissionPercentage` (earnings for this group)
- Groups are created by Account Managers and admins
- Promoters have a one-to-one link to a chatter group (via User.chatterGroupId)

**ChatterGroupMember Model:**
- Many-to-many relationship between Chatter (User) and ChatterGroup
- Unique constraint: (chatterId, groupId) — user can only join group once

**Controller Functions:**
- `createChatterGroup(req, res)` — Create group (AM/Admin only)
- `listChatterGroups(req, res)` — List groups (filtered by ownership)
- `addChatterToGroup(req, res)` — Assign chatter to group
- `removeChatterFromGroup(req, res)` — Unassign chatter
- `createChatter(req, res)` — Onboard new chatter (AM/Admin)
- `listChatters(req, res)` — List chatters (filtered by ownership)

**Integration with Commissions:**
- When a transaction occurs, commissions can be created for:
  - Promoter (Level 1 referral)
  - Chatter groups associated with promoter (separate `type: 'chatter'` commission records)
  - Commission.type field distinguishes: 'promoter' vs 'chatter'

---

### Customer & Transaction Management (customer.controller.ts, transaction.controller.ts)

**Purpose:** Track end-customer purchases and create transaction records for commission calculation

**Customer Model:**
- Represents an end-customer who made a purchase
- Links to Campaign, Referral (who invited them)
- Fields: email, name, revenue (sum of all transactions), status, subscriptionType

**Transaction Model:**
- Represents a single sale or refund event
- Idempotent via `eventId` (unique, from external payment system)
- Links to Customer, Campaign, Referral
- Types: 'sale', 'refund'
- Can reference `originalTransactionId` for refund reversals

**Controller Functions:**
- `getAllCustomers(req, res)` — Admin: list all customers
- `getCustomerById(req, res)` — Admin/Promoter: fetch customer details
- `updateCustomer(req, res)` — Admin: update customer status
- `getAllTransactions(req, res)` — Admin: list transactions
- `getTransactionById(req, res)` — Fetch transaction + related commissions

**Commission Trigger:**
- Conversion webhook → conversion.controller.handleConversion()
  - Creates/updates Customer
  - Creates Transaction (idempotent via eventId)
  - Calculates and inserts Commission records for all levels
  - Sends notifications

---

### Click Tracking (click.controller.ts)

**Purpose:** Track individual clicks on tracking links and redirect to campaign website

**ClickTracking Model:**
- Records: ipAddress, userAgent, referrerUrl, metadata (JSON)
- Links to: TrackingLink, User, Referral
- Created every time tracking link is clicked

**Flow:**
```
Client: GET /track/{shortCode}
  ↓
Server: Looks up TrackingLink by shortCode
  ↓
Logs click: INSERT ClickTracking { ipAddress, userAgent, referrerUrl, ... }
  ↓
Updates click count: UPDATE TrackingLink SET clicks = clicks + 1
  ↓
Redirects: HTTP 302 to Campaign.websiteUrl
```

**Controller Functions:**
- `trackClick(req, res)` — Main redirect + logging endpoint
- `getTrackingStats(req, res)` — Analytics for tracking link clicks

---

### First Promoter v1 & v2 API Compatibility (api.v1.routes.ts, api.v2.routes.ts, promoter.api.controller.ts)

**Purpose:** Provide FirstPromoter-compatible API endpoints for external integrations

**v1 API (Backward Compatibility):**
- Base: `/api/v1`
- Auth: API Key via `X-Api-Key` header or Bearer token
- Endpoints: Subset of main API for first-generation integrations

**v2 API (Extended Compatibility):**
- Base: `/api/v2`
- Auth: API Key + Account-ID header support
- Includes additional endpoints and fields
- More flexible filtering/pagination

**Authentication:**
- apiKey.middleware validates via ApiKey model
- Stores lastUsedAt timestamp for usage tracking
- Updates user via req.user for standard authorization checks

**Controller:**
- promoter.api.controller.ts implements v1/v2-specific logic
- Maps FirstPromoter concepts to MJ First Promoter models
- Handles legacy field naming differences

**Key Differences from v3 (main API):**
- Different response formats (FirstPromoter JSON schema)
- Reduced field exposure (some internal fields hidden)
- No JWT requirement (API key-based auth instead)
- Account isolation via Account-ID header (multi-tenant support)

---

### Promoter Link System (promoter-link.controller.ts)

**Purpose:** Generate and manage shareable links for promoters' landing pages or profiles

**Features:**
- Custom short URLs for promoter profiles
- Social sharing integration
- Click tracking on profile shares

**Controller Functions:**
- `createPromoterLink(req, res)` — Generate new link
- `getPromoterLink(req, res)` — Fetch link details
- `updatePromoterLink(req, res)` — Modify settings
- `deletePromoterLink(req, res)` — Remove link

---

## Cross-System Integration Patterns

### Multi-Tenant Support
- ApiKey.accountId field enables account isolation in v2 API
- Queries filtered by accountId for multi-organization deployments
- Users belong to logical "accounts"; admins manage multiple accounts

### User Type Computation
- User.userType can be:
  - ADMIN (User.role = ADMIN)
  - ACCOUNT_MANAGER (User has accountManagerId set OR createdById with owned users)
  - PROMOTER (User has referrals as referrer)
  - CHATTER (User in ChatterGroupMember)
  - TEAM_MANAGER (Legacy; not actively used)
  - PAYER (User with payment gateway integration)
- Computed via user.service.syncUserType() or getUserTypeInfo()
- Affects dashboard views and available actions

### Ownership Resolution
- User.createdById — immutable, marks who originally invited them
- User.accountManagerId — mutable, current owner (AM reassignment)
- ownership.service.resolveOwnership() handles complex chains
- Used to determine visibility and access for cascading features
