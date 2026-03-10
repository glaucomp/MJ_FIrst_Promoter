# System Overview - MJ First Promoter

This document explains the complete architecture and workflows based on your requirements.

## 📐 System Architecture

### User Hierarchy

```
Superuser (Admin)
    ↓ creates & manages
Account Manager (Sophie, Christina)
    ↓ invites
Influencer (Yoda)
    ↓ invites friends
Sub-Influencer (Luke)
    ↓ and so on...
```

### Three User Roles

#### 1. **Superuser**
- Creates campaigns with commission percentages
- Creates and manages account managers
- Views platform-wide analytics
- Full control over the system

#### 2. **Account Manager (AM)**
- Manages assigned campaigns
- Invites influencers to campaigns
- Tracks campaign performance
- Views all referrals in their campaigns
- Earns commissions on campaign success

#### 3. **Influencer**
- Signs up via invite link
- Promotes campaigns via referral links
- Invites friends (who become sub-influencers)
- Earns commissions on direct referrals (Level 1)
- Earns secondary commissions on sub-referrals (Level 2+)

## 🔄 Complete Workflow

### Phase 1: Onboarding & Setup

**Step 1: Campaign Creation**
```
Superuser → Creates Campaign
    - Name: "Launch Campaign 2026"
    - Website: https://example.com
    - Commission: 15% (Level 1), 5% (Level 2)
    - Assigns to: Sophie (Account Manager)
```

**Step 2: Account Manager Assignment**
```
Campaign → Assigned to Sophie
    - Sophie gets dashboard access
    - Can now invite influencers
    - Tracks campaign metrics
```

**Step 3: Influencer Invitation**
```
Sophie → Generates Invite Link
    - URL: /register?invite=ABC123
    - Sends to Yoda
    
Yoda → Clicks Link → Registers
    - Now part of campaign
    - Level 1 influencer
    - Can start earning
```

### Phase 2: Marketing & Referrals

**Step 4: Influencer Promotes Campaign**
```
Yoda → Generates Referral Link
    - Personal tracking link
    - Shares on social media
    - Tracks clicks and conversions
```

**Step 5: Multi-Level Referrals**
```
Yoda → Invites Luke (Friend)
    - Luke registers via Yoda's referral link
    - Luke becomes Level 2 influencer
    - Yoda becomes "Account Manager" for Luke

Luke → Can now invite his friends
    - Creates his own referral network
    - Yoda earns from Luke's referrals
```

### Phase 3: Revenue & Payouts

**Step 6: Commission Tracking**
```
Sale/Conversion Happens:

1. Direct Sale by Luke
   → Luke earns 15% (primary commission)
   → Yoda earns 5% (secondary commission)
   → Sophie tracks in dashboard
   → Superuser sees platform revenue

2. Luke's Friend Makes Sale
   → Friend earns 15% (primary)
   → Luke earns 5% (secondary)
   → Yoda earns 2-3% (tertiary, if configured)
```

**Step 7: Commission Statuses**
```
Unpaid → Pending verification
Pending → Waiting for payout date
Paid → Money transferred
```

## 🎨 Dashboard Features by Role

### Superuser Dashboard

**Top Stats Cards:**
- Total Campaigns (with active count)
- Account Managers (total)
- Influencers (total)
- Total Referrals (active vs pending)
- Total Commissions (platform-wide)

**Actions:**
- ➕ Create Campaign
- ➕ Create Account Manager
- 📊 View All Campaigns Table
- 👥 Manage Users

**Campaign Table Columns:**
- Campaign Name
- Website URL
- Commission Rates
- Assigned Manager
- Total Referrals
- Status (Active/Inactive)

### Account Manager Dashboard

**Top Stats Cards:**
- Managed Campaigns (count)
- Total Influencers (in your campaigns)
- Total Referrals (from your campaigns)
- Total Commissions (earned)

**Actions:**
- ➕ Invite Influencer
- 📋 View Campaign List
- 📊 Campaign Performance

**Campaigns Table:**
- Campaign Name
- Website URL
- Commission Rates (Primary / Secondary)
- Total Referrals
- Status

**Invite Process:**
1. Select Campaign
2. Enter Influencer Email (optional)
3. Generate Invite Link
4. Copy & Share URL

### Influencer Dashboard

**Top Stats Cards:**
- Total Referrals (direct + indirect)
- Active Referrals (currently earning)
- Total Earnings (all-time)
- Paid Earnings (received)
- Pending Earnings (to be paid)
- Tracking Links (count)

**Actions:**
- ➕ Invite Friends
- 🔗 Generate Tracking Link
- 💰 View Commission History

**My Referrals Table:**
- Campaign Name
- Referred User (name/email)
- Level (1, 2, 3...)
- Status (Active/Pending)
- Commissions Earned
- Date Joined

**Commission History Table:**
- Campaign
- Amount ($)
- Percentage (%)
- Status (Paid/Unpaid/Pending)
- Date

**Tracking Links:**
- Campaign
- Short Code (for URL)
- Full URL
- Total Clicks
- Actions (Copy link)

## 💡 Real-World Example

### Scenario: Tech Product Launch

**Setup:**
```
Superuser creates "MacBook Pro Campaign"
    - Website: https://apple.com/macbook
    - Commission: $50 per sale (Level 1)
    - Secondary: $20 per sale (Level 2)
    - Assigns to Christina (Account Manager)
```

**Christina's Actions:**
```
Invites 10 tech influencers including Yoda
    - Yoda has 50K YouTube subscribers
    - Specializes in tech reviews
```

**Yoda's Strategy:**
```
Creates YouTube video reviewing MacBook Pro
    - Includes referral link in description
    - 100 viewers click the link
    - 5 people buy MacBook Pro
    - Yoda earns: 5 × $50 = $250
```

**Multi-Level Growth:**
```
One buyer (Luke) is also an influencer
    - Luke signs up via Yoda's referral
    - Luke creates his own content
    - Luke's followers buy 3 MacBooks
    - Luke earns: 3 × $50 = $150
    - Yoda earns: 3 × $20 = $60 (secondary commission!)
```

**Total Earnings:**
```
Yoda's Direct Sales: $250
Yoda's Secondary (from Luke): $60
Yoda's Total: $310

Luke's Direct Sales: $150

Christina's Campaign: $560 in commissions
Platform Revenue: $400 (8 MacBooks sold)
```

## 🔗 URL Structure

### Registration with Invite
```
http://localhost:3000/register?invite=ABC123XYZ
                                      └── Unique invite code
```

### Tracking Links
```
http://localhost:5000/track/X7K9P2M1
                            └── Short code for tracking
```

When clicked:
1. Records click (IP, user agent, referrer)
2. Redirects to campaign website
3. Updates click count in dashboard

## 📊 Analytics & Tracking

### What Gets Tracked:

**Campaign Level:**
- Total referrals created
- Active referrals (users who signed up)
- Pending referrals (invites not yet accepted)
- Total clicks on tracking links
- Total commissions (paid, unpaid, pending)

**User Level:**
- Referrals made (how many people they invited)
- Referrals received (who invited them)
- Earnings by campaign
- Click-through rate on tracking links
- Conversion rate (clicks → signups)

**Referral Level:**
- Level in hierarchy (1, 2, 3...)
- Parent referral (who invited you)
- Child referrals (who you invited)
- Commission earned at each level
- Status (pending, active, completed)

## 🔐 Security & Permissions

### Role-Based Access Control

**Superuser Can:**
- ✅ Everything (full access)
- Create campaigns
- Create account managers
- View all data
- Modify all campaigns
- Delete users

**Account Manager Can:**
- ✅ View assigned campaigns
- ✅ Invite influencers to their campaigns
- ✅ View referrals in their campaigns
- ❌ Cannot create campaigns
- ❌ Cannot modify other managers' campaigns

**Influencer Can:**
- ✅ View their own referrals
- ✅ Generate referral links
- ✅ View their earnings
- ✅ Create tracking links
- ❌ Cannot view other influencers' data
- ❌ Cannot modify campaigns

### Authentication
- JWT tokens (7-day expiry)
- bcrypt password hashing
- Secure HTTP-only cookies
- Token refresh mechanism

## 🚀 Scalability Features

### Database Design
- Indexed fields for fast queries
- Foreign key constraints
- Cascade deletes for referential integrity
- JSON fields for flexible metadata

### Performance
- Connection pooling
- Query optimization via Prisma
- Lazy loading of relationships
- Pagination support (future)

### Extensibility
- Webhook support (future)
- Email notifications (extensible)
- Custom commission rules (extensible)
- Payment gateway integration (ready)

## 📈 Growth Potential

### Current System Supports:

**Unlimited:**
- Campaigns
- Users (all roles)
- Referral levels
- Tracking links
- Commissions

**Multi-Level Marketing:**
- Level 1: Direct referrals
- Level 2: Sub-referrals
- Level 3+: Deep network referrals
- Each level can have custom commission %

### Future Enhancements:

1. **Email Automation**
   - Welcome emails for new users
   - Invite emails for referrals
   - Commission notification emails
   - Weekly performance reports

2. **Payment Integration**
   - Stripe/PayPal for automatic payouts
   - Minimum payout thresholds
   - Payment history
   - Tax reporting (1099 forms)

3. **Advanced Analytics**
   - Conversion funnels
   - Geographic heat maps
   - Time-based performance
   - A/B testing for campaigns

4. **Mobile App**
   - React Native implementation
   - Push notifications
   - QR code sharing
   - Mobile-optimized tracking

5. **Social Features**
   - Leaderboards
   - Achievement badges
   - Team competitions
   - Social sharing widgets

## 🎯 Summary

Your MJ First Promoter platform is a **complete multi-level referral tracking system** that:

✅ Supports 3 user roles with appropriate permissions
✅ Enables multi-level referral networks (unlimited depth)
✅ Tracks commissions at every level
✅ Provides role-specific dashboards
✅ Generates unique invite and tracking URLs
✅ Monitors clicks and conversions
✅ Manages commission payments
✅ Scales to enterprise-level usage

The system matches your requirements exactly as shown in your diagrams, with the flexibility to grow as your business expands!

---

Ready to promote! 🚀
