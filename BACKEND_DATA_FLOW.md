# Backend Data Flows - MJ First Promoter

Detailed workflows showing how data moves through key operations.

## 1. User Registration Flow

### Scenario A: Register with Invite Code (Direct Invite from AM)

**User Action:** POST /api/auth/register with inviteCode

```
1. CLIENT: POST /api/auth/register
   {
     email: "luke@example.com",
     password: "...",
     firstName: "Luke",
     inviteCode: "ABC123XYZ"
   }

2. ROUTE: auth.routes.ts → authController.register
   - Validates email format, password strength via express-validator
   - Returns 400 if validation fails

3. CONTROLLER: auth.controller.register
   a) Check email uniqueness
      → SELECT * FROM users WHERE email = 'luke@example.com'
      → If exists: return 400 "User already exists"
   
   b) Hash password
      → bcrypt.hash(password, 10) → hashed_password
   
   c) Resolve referral by inviteCode
      → SELECT referral, campaign, referrer FROM referrals
         WHERE inviteCode = 'ABC123XYZ'
      → If not found: return 400 "Invalid invite code"
      → If referredUserId NOT NULL: return 400 "Invite already used"
   
   d) Determine user role/type
      → If referrer.role == ADMIN:
         userType = ACCOUNT_MANAGER (new AM being invited)
      → Else:
         userType = PROMOTER
   
   e) Resolve ownership chain via resolveOwnership(referral.id)
      SERVICE: ownership.service.resolveOwnership
      → Reads: referrer.role, referrer.accountManagerId
      → If referrer is AM/ADMIN:
         Return { createdById: referrer.id, accountManagerId: referrer.id }
      → Else (referrer is promoter):
         Return { createdById: referrer.id, accountManagerId: referrer.accountManagerId }
      → createdById always set (marks who invited)
      → accountManagerId may be null if userType=ACCOUNT_MANAGER (AMs don't have an AM)
      → accountManagerId inherited from referrer if userType=PROMOTER
   
   f) Create user in database
      → INSERT INTO users (email, password, firstName, lastName, role, userType, createdById, accountManagerId)
         VALUES ('luke@example.com', hashed_password, 'Luke', NULL, 'PROMOTER', 'PROMOTER', referrer.id, referrer.accountManagerId)
      → Returns new user record
   
   g) Update referral to mark accepted
      → UPDATE referrals
         SET referredUserId = user.id, status = 'ACTIVE', acceptedAt = now()
         WHERE id = referral.id
   
   h) Sync referrer type
      ASYNC SERVICE: user.service.syncUserType(referrer.id)
      → Recalculate referrer's userType (may now be PROMOTER if this was first referral)
      → Update referrer's userType field if changed
   
   i) Delete TeaseMe tracking records
      → DELETE FROM pre_users
         WHERE referralId = referral.id OR email = user.email
   
   j) Ensure customer tracking referral
      SERVICE: referral-membership.service.ensureCustomerTrackingReferralForPromotedUser
      → If invite referral is on hidden campaign:
         → Find linkedCampaignId on that campaign
         → Create shell referral on public campaign for customer tracking
      → Else: no-op (referral is already on public campaign)
   
   k) Generate JWT token
      → jwt.sign({ id: user.id, email, role }, JWT_SECRET, { expiresIn: '7d' })
      → token = JWT bearer token
   
   l) Set HTTP-only cookie
      → Set-Cookie: auth_token = token; HttpOnly; Secure; SameSite=strict; MaxAge=7d
   
   m) Return response
      → 201 { user: {...}, message: "Registration successful with referral" }

4. CLIENT: Redirected to dashboard
   - Stores JWT in cookie (automatic)
   - Can now make authenticated requests
```

### Scenario B: Register with refCode (Self-Referral)

**User Action:** POST /api/auth/register with refCode (username/inviteCode of referrer)

```
(Steps a-f same as Scenario A, but no inviteCode provided)

f) Find referrer by refCode
   → SELECT * FROM users WHERE username = refCode OR inviteCode = refCode
   → If not found: log warning, continue without referral

g) Find active visible campaign
   → SELECT * FROM campaigns WHERE isActive AND visibleToPromoters LIMIT 1

h) Create referral record
   → INSERT INTO referrals (inviteCode, campaignId, referrerId, referredUserId, status, level, acceptedAt)
      VALUES (generated_code, campaign.id, referrer.id, user.id, 'ACTIVE', 1, now())

i) Sync referrer type
   ASYNC: user.service.syncUserType(referrer.id)

j) Create customer tracking referral
   SERVICE: referral-membership.service.ensureCustomerTrackingReferralForPromotedUser

k) Track in MJ Promoter API (external)
   ASYNC: POST https://mjpromoter.api/v2/track/signup
   → Headers: Authorization: Bearer token, Account-ID: accountId
   → Body: { email: user.email, uid: user.id, tid: refCode }
   → If 401: clear cached credentials

(Continue with steps k-m from Scenario A)
```

## 2. Campaign Creation & Referral Flow

### Scenario: Account Manager Invites Promoter to Campaign

**User Action:** POST /api/referrals/create-invite

```
1. CLIENT: POST /api/referrals/create-invite
   {
     campaignId: "camp_123",
     recipientEmail: "jane@example.com"
   }

2. MIDDLEWARE: authenticate
   → Validates JWT, sets req.user = { id: am_id, email, role }

3. ROUTE: referral.routes.ts → referralController.createReferralInvite
   - express-validator checks campaignId, recipientEmail format
   - Returns 400 if validation fails

4. CONTROLLER: referral.controller.createReferralInvite
   a) Find campaign
      → SELECT * FROM campaigns WHERE id = 'camp_123'
      → If not found: return 404
   
   b) Verify requester is participant on campaign
      SERVICE: referral-membership.service.isUserParticipantOnCampaign
      → SELECT COUNT(*) FROM referrals
         WHERE campaignId = 'camp_123' AND referrerId = am_id AND status = 'ACTIVE'
      → If count == 0: return 403 "Not authorized"
   
   c) Check if recipient already registered
      → SELECT * FROM users WHERE email = 'jane@example.com'
      → If exists and already on campaign: return 400 "Already invited"
   
   d) Generate unique invite code
      → inviteCode = nanoid(16) → "abc123xyz789..."
   
   e) Create referral record
      → INSERT INTO referrals (inviteCode, campaignId, referrerId, status, level, createdAt)
         VALUES ('abc123xyz789...', 'camp_123', am_id, 'PENDING', 1, now())
      → Returns referral with id
   
   f) Create PreUser record for TeaseMe tracking
      → INSERT INTO pre_users (email, referralId, inviteCode, status, currentStep, createdAt)
         VALUES ('jane@example.com', referral.id, 'abc123xyz789...', 'pending', 0, now())
   
   g) Send invite email
      SERVICE: email.service.sendInviteEmail
      → Composes email with:
         - Campaign name + description
         - Registration link: /register?invite=abc123xyz789...
         - Referrer name (AM name)
         - Expiry: 24 hours
      → Sends via SendGrid/nodemailer
      → If send fails: log error, don't block response
   
   h) Return response
      → 201 { referral: {...}, message: "Invite sent to jane@example.com" }

5. CLIENT: Shows "Invite sent" message
   - User can resend (rebuilds email, pushes expiry forward)
   - Invite stays PENDING until recipient registers
```

## 3. Referral Acceptance & User Signup

**User Action:** Clicks invite link, signs up

```
1. CLIENT: Clicks /register?invite=abc123xyz789...
   - Frontend pre-populates inviteCode in registration form

2. CLIENT: POST /api/auth/register with inviteCode=abc123xyz789...
   (See "User Registration Flow → Scenario A" above)
   
3. REFERRAL STATE CHANGES:
   Before: referrals { id, inviteCode, status: 'PENDING', referredUserId: null, acceptedAt: null }
   After:  referrals { id, inviteCode, status: 'ACTIVE', referredUserId: 'jane_id', acceptedAt: now() }

4. PREUSER DELETED:
   Before: pre_users { id, email, referralId, status: 'pending' }
   After:  (deleted)

5. USER CREATED:
   New entry in users with:
   - email: jane@example.com
   - createdById: am_id (who invited)
   - accountManagerId: am_id (same AM responsible)
   - userType: PROMOTER
```

## 4. Conversion (Sale) & Commission Calculation Flow

### Scenario: Customer Purchases, Commission Created

**External Trigger:** Webhook from payment system

```
1. PAYMENT SYSTEM: Customer jane@example.com makes $100 purchase

2. PAYMENT WEBHOOK: POST /api/webhooks/conversions
   {
     eventId: "evt_12345",
     type: "sale",
     customerId: "cust_jane",
     email: "jane@example.com",
     saleAmount: 100.00,
     currency: "USD"
   }

3. ROUTE: webhook.routes.ts → conversionController.handleConversion
   - Validates webhook signature (shared secret)
   - Returns 400 if signature invalid

4. CONTROLLER: conversion.controller.handleConversion
   a) Idempotency check via eventId
      → SELECT * FROM transactions WHERE eventId = 'evt_12345'
      → If exists: return 200 (already processed)
   
   b) Find or create customer
      → SELECT * FROM customers WHERE email = 'jane@example.com'
      → If not found: CREATE new customer
      → Either way: get customer.id
   
   c) Find referral(s) for this customer
      LOGIC: Customer came from which referrer?
      → Look for active referral with referredUserId = customer.id
      → If customer is a referrer themselves, check their own campaign activity
      → For each matching referral: calculate commission at that level
   
   d) Create transaction record
      → INSERT INTO transactions (eventId, type, saleAmount, currency, status, customerId, campaignId, referralId)
         VALUES ('evt_12345', 'sale', 100.00, 'USD', 'completed', customer.id, referral.campaignId, referral.id)
      → Returns transaction.id
   
   e) Update customer revenue
      → UPDATE customers SET revenue = revenue + 100.00 WHERE id = customer.id
   
   f) Calculate and create commissions (multi-level)
      For each referral level in hierarchy:
      
      Level 1 (Direct referrer):
      → Campaign.commissionRate = 15%
      → commission_amount = 100 * 0.15 = $15
      → INSERT INTO commissions (userId, campaignId, referralId, transactionId, amount, percentage, saleAmount, status, type)
         VALUES (referral.referrerId, campaign.id, referral.id, transaction.id, 15.00, 15, 100.00, 'unpaid', 'promoter')
      
      Level 2 (Referrer's referrer):
      → If referral.parentReferral exists:
         → Campaign.secondaryRate = 5%
         → commission_amount = 100 * 0.05 = $5
         → INSERT INTO commissions (...)
            VALUES (parentReferral.referrerId, campaign.id, parentReferral.id, transaction.id, 5.00, 5, 100.00, 'unpaid', 'promoter')
      
      (Continue for levels 3+ if recurringRate set)
   
   g) Notify relevant users
      ASYNC: email.service.sendCommissionNotification
      → Sends "You earned $15 on jane's purchase" to each referrer
      → Includes direct link to commission details
   
   h) Return response
      → 200 { transaction: {...}, commissionsCreated: 2 }

5. COMMISSIONS NOW IN DATABASE:
   Before: commissions table empty for this transaction
   After:  Two new rows:
           - Commission for referrer (Level 1): amount=$15, status=unpaid
           - Commission for referrer's referrer (Level 2): amount=$5, status=unpaid

6. DASHBOARD UPDATES:
   - Referrer sees +$15 in "Pending Earnings"
   - Referrer's referrer sees +$5
   - Campaign shows +2 new commissions
```

### Refund Scenario

```
1. PAYMENT SYSTEM: Customer requests refund

2. WEBHOOK: POST /api/webhooks/conversions
   {
     eventId: "evt_refund_67890",
     type: "refund",
     originalEventId: "evt_12345",
     saleAmount: 100.00
   }

3. CONTROLLER: conversion.controller.handleConversion
   a) Find original transaction
      → SELECT * FROM transactions WHERE eventId = 'evt_12345'
   
   b) Create refund transaction
      → INSERT INTO transactions (eventId, type, saleAmount, originalTransactionId, status)
         VALUES ('evt_refund_67890', 'refund', 100.00, transaction.id, 'completed')
   
   c) Find commissions from original transaction
      → SELECT * FROM commissions WHERE transactionId = transaction.id
   
   d) For each commission: create offsetting entry
      → INSERT INTO commissions (userId, campaignId, referralId, transactionId, amount, percentage, saleAmount, status, type)
         VALUES (same_user, campaign.id, referral.id, refund_transaction.id, -amount, percentage, -100.00, 'pending', 'promoter')
      → Negative amount for reversal
   
   e) Net effect:
      - Original commission: +$15
      - Refund commission: -$15
      - Net: $0 (user can see both in history for audit)
```

## 5. Payout Flow (Wise Integration)

### Scenario: Promoter Requests Payout

**User Action:** POST /api/wise/create-transfer

```
1. CLIENT: POST /api/wise/create-transfer
   {
     amount: 100.00,
     currency: "USD"
   }

2. MIDDLEWARE: authenticate
   → req.user = { id: promoter_id, email, role }

3. ROUTE: wise.routes.ts → wiseController.createTransfer

4. CONTROLLER: wise.controller.createTransfer
   a) Fetch promoter details
      → SELECT id, wiseEmail, wiseRecipientId, wiseRecipientType FROM users WHERE id = promoter_id
      → If wiseRecipientId is null: return 400 "Please set up Wise recipient first"
   
   b) Call wise.service to initiate transfer
      SERVICE: wise.service.createTransfer
      → Calls Wise API:
         POST https://api.wise.com/v1/transfers
         {
           sourceAccount: wise_source_id,
           targetAccount: user.wiseRecipientId,
           quoteUuid: source_quote_id,
           customerTransactionId: commission.id,
           details: { reference: "Commission payout" }
         }
      → Returns transferId + initial status
      → Example response: { id: "tr_12345", status: "processing", ... }
   
   c) Find unpaid commissions for user
      → SELECT * FROM commissions WHERE userId = promoter_id AND status = 'unpaid' AND amount <= remaining_balance
   
   d) For each commission being paid:
      → UPDATE commissions
         SET status = 'paid', paidAt = now(), wiseTransferId = 'tr_12345', wiseStatus = 'processing'
         WHERE id = commission.id
   
   e) Wise eventually processes transfer
      (Async: happens externally, not in request)
   
   f) Return response
      → 201 { transfer: { id: 'tr_12345', status: 'processing', ... }, commissionsUpdated: 3 }

5. POLLING: Client periodically checks transfer status
   → GET /api/wise/transfer-status/tr_12345
   
   CONTROLLER: wise.controller.getTransferStatus
   a) Call wise.service.getTransferStatus
      SERVICE: wise.service.getTransferStatus
      → Calls Wise API: GET /v1/transfers/tr_12345
      → Returns current status + details
   
   b) If status changed (e.g., "outgoing_payment_sent"):
      → UPDATE commissions SET wiseStatus = 'outgoing_payment_sent'
   
   c) If status = "completed":
      → Commission already marked paid in step 4d
      → Just return current state
   
   d) Return status to client
      → 200 { transfer: { status: 'outgoing_payment_sent', ... } }

6. PROMOTER SEES:
   - Commission status: "paid"
   - In dashboard: moves from "Pending Earnings" to "Paid Earnings"
   - Can see Wise transfer ID for tracking with Wise support
```

## 6. TeaseMe Pre-Influencer Onboarding Flow

### Scenario: AM Invites Pre-Influencer (Not Yet in System)

**Prerequisite:** Pre-influencer has a TeaseMe account (Step 1-3 in progress)

```
1. AM: Creates invite for pre-influencer@example.com
   → POST /api/referrals/create-invite
   (See "Campaign Creation & Referral Flow" above)
   
2. REFERRAL & PREUSER CREATED:
   referrals { status: 'PENDING', referredUserId: null }
   pre_users { email: 'pre-influencer@example.com', status: 'pending', teasemeUserId: null, currentStep: 0 }
   
3. INVITE EMAIL SENT:
   - Subject: "You're invited to join [Campaign]"
   - Link: /register?invite=abc123xyz789...
   - Note: "Complete your TeaseMe setup first"

4. EXTERNAL: Pre-influencer completes TeaseMe onboarding (Step 4 → Step 5)
   - TeaseMe system: Generates landing page, starts promotion
   - TeaseMe webhooks our system at some interval with lifecycle updates

5. WEBHOOK: POST /api/webhooks/teaseme
   {
     teasemeUserId: "tm_xyz789",
     email: "pre-influencer@example.com",
     currentStep: 2,
     status: "building",
     surveyLink: "https://teaseme.com/survey/...",
     assetLink: null
   }

6. CONTROLLER: teaseme.controller.handleWebhook
   a) Find PreUser by email
      → SELECT * FROM pre_users WHERE email = 'pre-influencer@example.com'
      → If not found: return 200 (ignore, will be created on next refresh)
   
   b) Update PreUser with TeaseMe state
      → UPDATE pre_users
         SET teasemeUserId = 'tm_xyz789', currentStep = 2, status = 'building', surveyLink = '...', lastCheckedAt = now()
         WHERE id = pre_users.id
      
      (Also tracks step history: [{ step: 0, at: ... }, { step: 2, at: ... }])
   
   c) Return 200 OK (don't wait for email or other side effects)

7. CLIENT: AM views "My Promoters" list
   → GET /api/referrals?campaignId=camp_123
   
   SERVICE: refreshPreUserSteps (in referral.controller.ts)
   → For each referral with attached PreUser:
      → Check lastCheckedAt timestamp
      → If > 5 min old: call teaseme.service.fetchTeasemePreUserStatus (polling)
         → GET https://teaseme.api/users/tm_xyz789/step-progress
         → Returns { currentStep: 4, status: 'live', assetLink: '...' }
      → Update PreUser if status advanced (but never downgrade)
      → Write to DB
   
   → Response includes:
      {
        referrals: [
          {
            id: 'ref_123',
            status: 'PENDING',
            preUser: {
              email: 'pre-influencer@example.com',
              status: 'live',
              currentStep: 4,
              assetLink: 'https://teaseme.com/lp/...',
              progressChip: 'live' // UI displays: "Landing page live ✓"
            }
          }
        ]
      }

8. AM: Sees pre-influencer is "live", clicks "Approve"
   → POST /api/referrals/approve-pre-influencer
   
   CONTROLLER: referral.controller.approvePreInfluencer
   a) Find referral + preUser
   
   b) Call teaseme.service.approvePreInfluencer
      SERVICE: teaseme.service.approvePreInfluencer
      → Calls TeaseMe API: POST /users/{teasemeUserId}/approve
      → TeaseMe marks influencer as approved on their side
      → Our system: SET pre_users.status = 'approved'
   
   c) Return 200 OK

9. EXTERNAL: TeaseMe sends final webhook (Step 5 completion)
   When pre-influencer finishes ALL steps on TeaseMe:
   → POST /api/webhooks/teaseme
      {
        teasemeUserId: 'tm_xyz789',
        email: 'pre-influencer@example.com',
        currentStep: 5,
        status: 'live',
        assetLink: 'https://...' (their final landing page)
      }
   
   SERVER: Updates PreUser status = 'live', assetLink set

10. PROMOTION: TeaseMe triggers 4→5 transition (in their system)
    - Pre-influencer now has valid credentials
    - Ready to become full User account
    - TeaseMe calls our system with special webhook

11. WEBHOOK: POST /api/webhooks/teaseme (4→5 promotion)
    {
      teasemeUserId: 'tm_xyz789',
      email: 'pre-influencer@example.com',
      action: 'promote_to_5',
      tempPassword: 'TempPwd123!',
      recipientEmail: 'pre-influencer@example.com'
    }

12. CONTROLLER: teaseme.controller.handlePromotion
    a) Find PreUser + linked Referral
    
    b) Call pre-user-promote.service.promotePreUserToUser
       SERVICE: pre-user-promote.service.promotePreUserToUser
       
       i) Resolve ownership from referral.referrerId
          SERVICE: resolveOwnership(referral.id)
          → Returns { createdById: am_id, accountManagerId: am_id }
       
       ii) Create new User
           → INSERT INTO users (email, password, firstName, role, userType, createdById, accountManagerId, mustChangePassword)
              VALUES ('pre-influencer@example.com', bcrypt(tempPassword), NULL, 'PROMOTER', 'PROMOTER', am_id, am_id, true)
           → Returns new user.id
       
       iii) Link PreUser to User
           → UPDATE referrals SET referredUserId = user.id, status = 'ACTIVE', acceptedAt = now()
              WHERE id = referral.id
       
       iv) Delete PreUser
           → DELETE FROM pre_users WHERE id = preUser.id
       
       v) Send welcome email (once)
           SERVICE: email.service.sendWelcomeEmail
           → Subject: "Welcome to [Campaign]!"
           → Body: "Your temporary password is: TempPwd123!"
           → Link: /set-password (frontend redirects to password-change flow)
           → Guard: Only sends if welcomeEmailSentAt is null
           → After send: UPDATE pre_users SET welcomeEmailSentAt = now()
       
       vi) Return success
    
    c) Return 200 OK

13. PROMOTER: Receives welcome email
    - Clicks "Set Password" link
    - Logs in with email + tempPassword
    - Frontend detects mustChangePassword = true
    - Redirected to password change flow
    - User enters new password
    → POST /api/auth/first-password-change { changeToken, newPassword }
    
    (See "User Registration Flow → firstPasswordChange" in auth.controller.ts)

14. PROMOTER: Now fully onboarded
    - Can log in normally
    - Can see campaigns
    - Can generate tracking links
    - Can invite other promoters
    - PreUser deleted, Referral active
```

## 7. Account Manager Assignment & User Management

### Scenario: Admin Reassigns Promoter to Different Account Manager

**User Action:** PATCH /api/users/:userId/account-manager

```
1. CLIENT: PATCH /api/users/promoter_id
   {
     accountManagerId: "new_am_id"
   }

2. MIDDLEWARE: authenticate
   → Validates user is admin

3. CONTROLLER: user.controller.updateUser
   a) Find promoter
      → SELECT * FROM users WHERE id = 'promoter_id'
   
   b) Verify new AM exists
      → SELECT * FROM users WHERE id = 'new_am_id' AND (role = 'ADMIN' OR userType = 'ACCOUNT_MANAGER')
      → If not found: return 400
   
   c) Update assignment
      → UPDATE users
         SET accountManagerId = 'new_am_id', updatedAt = now()
         WHERE id = 'promoter_id'
   
   d) NOTE: createdById is immutable (marks original inviter)
      - accountManagerId is the mutable assignment
      - Allows AM transfers without losing creation provenance
   
   e) Return updated user

4. EFFECT:
   - Promoter's dashboard now shows new AM in breadcrumb
   - New AM can now see promoter in their dashboard
   - Promoter's commissions stay with user (not AM-specific)
   - createdById still shows who originally invited them
```

## 8. Chatter Commission Flow

### Scenario: Promoter Earns Commission; Assigned Chatters Also Earn

**Prerequisite:** Promoter has ChatterGroup assigned (User.chatterGroupId set)

```
1. TRANSACTION WEBHOOK: Payment received (same as step 4)
   POST /api/webhooks/conversions
   {
     eventId: "evt_12345",
     customerId: "cust_jane",
     saleAmount: 100.00,
     ...
   }

2. CONTROLLER: conversion.controller.handleConversion
   a) Find customer and transaction (same as before)
   
   b) Find referral chain (same as before)
      → Includes: customer was referred by promoter_id
   
   c) Create promoter commissions (Level 1 + Level 2)
      → INSERT INTO commissions (type='promoter', ...)
         VALUES (..., referral.referrerId, ..., 'promoter')
   
   d) NEW: Find promoter's chatter group
      SERVICE: Reads User.chatterGroupId where User.id = promoter_id
      → SELECT * FROM users WHERE id = promoter_id
      → Check if chatterGroupId is set
   
   e) NEW: If chatter group exists, add chatters as earners
      → SELECT * FROM chatter_group_members WHERE groupId = promoter.chatterGroupId
      → For each chatter:
         → Calculate chatter commission = saleAmount * chatterGroup.commissionPercentage
         → INSERT INTO commissions (type='chatter', userId=chatter.id, ...)
            VALUES (..., chatter.id, saleAmount, commissionPercentage, 'chatter')
   
   f) Send notifications
      → Email to promoter: "You earned $15"
      → Email to each chatter: "Your group earned $X"
   
   g) Return response
      → 200 { transaction, commissionsCreated: 3 }
      → (1 promoter Level 1 + 1 chatter + 1 promoter Level 2, etc.)

3. DASHBOARD UPDATES:
   - Promoter sees: +$15 (Level 1) + shared chatter earnings
   - Chatters see: +$X in their personal earnings
   - Campaign shows: Total commissions across both promoter and chatter tiers
```

---

## 9. Click Tracking & Redirect Flow

### Scenario: User Clicks Tracking Link

```
1. CLIENT: Clicks /track/X7K9P2M1 (short code)
   - Browser: GET /track/X7K9P2M1
   - Referrer header: https://social-media-site.com

2. SERVER: click.controller.trackClick
   a) Find tracking link by shortCode
      → SELECT * FROM tracking_links WHERE shortCode = 'X7K9P2M1'
      → If not found: return 404 or redirect to default
   
   b) Log click event
      → INSERT INTO click_tracking (
           trackingLinkId, userId, ipAddress, userAgent, referrerUrl
         )
         VALUES (
           tracking_link.id,
           req.user?.id || null,  // authenticated user if logged in
           req.ip,
           req.get('user-agent'),
           req.get('referer')
         )
   
   c) Increment click counter
      → UPDATE tracking_links SET clicks = clicks + 1 WHERE id = tracking_link.id
   
   d) Redirect to campaign
      → HTTP 302 Location: {campaign.websiteUrl}

3. ANALYTICS AVAILABLE:
   - Total clicks per tracking link (TrackingLink.clicks)
   - Click source breakdown (referrer, IP, user agent via ClickTracking records)
   - User journey: which authenticated user clicked which link
```

---

## 10. Account Manager Assignment & Chatter Group Management

### Scenario: Account Manager Creates Chatter Group & Assigns Chatters

```
1. ACCOUNT MANAGER: Creates new chatter group
   POST /api/chatter-groups
   {
     name: "Voice Talent Pool",
     commissionPercentage: 10.0
   }

2. CONTROLLER: chatter-group.controller.createChatterGroup
   a) Validate AM/Admin role
      → If not: return 403
   
   b) Create group
      → INSERT INTO chatter_groups (name, commissionPercentage, createdById)
         VALUES ('Voice Talent Pool', 10.0, am_id)
   
   c) Return created group
      → 201 { id, name, commissionPercentage, ... }

3. AM: Adds chatter to group
   POST /api/chatter-groups/{groupId}/members
   {
     chatterId: "chatter_123"
   }

4. CONTROLLER: chatter-group.controller.addChatterToGroup
   a) Verify group ownership (created by this AM)
      → If not: return 403
   
   b) Verify chatter exists and is of type CHATTER
   
   c) Create membership
      → INSERT INTO chatter_group_members (chatterId, groupId)
         VALUES ('chatter_123', 'group_id')
   
   d) Return updated group with members
      → 201 { group: {...}, members: [{...}, ...] }

5. NEW: Link Promoter to Group (optional)
   PATCH /api/users/{promoterId}
   {
     chatterGroupId: "group_id"
   }

   This links the promoter's commissions to this chatter group, so all
   future transactions credit both the promoter AND the chatters.
```

---

All key workflows follow similar patterns: validation → permission check → database write(s) → async side effects (email, external APIs) → response.
