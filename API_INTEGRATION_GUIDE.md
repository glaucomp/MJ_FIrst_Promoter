# 🚀 FirstPromoter API v2 Integration Guide

## Overview

MJ Promoter now includes **100% FirstPromoter-compatible API endpoints**. You can integrate your existing payment gateway (TeaseMe.live) by simply changing the API URL!

---

## 🔑 Authentication

### Generate API Credentials

Run this command to create your API credentials:

```bash
npm run ts-node src/scripts/create-api-key.ts
```

You'll receive:
- **API Key** (for v1 API): `fp_key_xxx...`
- **Bearer Token** (for v2 API): `fp_token_xxx...`
- **Account ID** (for v2 API): `acc_xxx...`

---

## 📡 API Endpoints

### Base URL
```
http://localhost:5555/api
```

Production: Update to your deployed URL (e.g., `https://promoter.yourdomain.com/api`)

---

## 🎯 V1 API (X-API-KEY Authentication)

### 1. Create Promoter

**Endpoint:** `POST /api/v1/promoters/create`

**Headers:**
```
X-API-KEY: fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "newpromoter@test.com",
  "first_name": "John",
  "last_name": "Doe",
  "cust_id": "preinf-123",               // Your internal customer ID
  "parent_promoter_id": "WryiVbz5sk",    // Optional: parent's ref_id for multi-level
  "temp_password": "changeme123",        // Optional: initial password
  "paypal_email": "john@paypal.com"      // Optional: for payouts
}
```

**Response:**
```json
{
  "id": "cmml8oa1v0000xxw3q7l49gu5",
  "email": "john@teaseme.com",
  "ref_id": "WryiVbz5sk",
  "cust_id": "preinf-123",
  "first_name": "John",
  "last_name": "Doe",
  "parent_promoter_id": "WryiVbz5sk",
  "created_at": "2026-03-10T23:26:20.899Z"
}
```

---

## 🎯 V2 API (Bearer Token + Account-ID)

### 2. Track Sale (Conversion)

**Endpoint:** `POST /api/v2/track/sale`

**Headers:**
```
Authorization: Bearer fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G
Account-ID: acc_kDP8UCZW2J-exA55
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "customer@example.com",
  "amount": 5000,              // Amount in CENTS (5000 = $50.00)
  "event_id": "tx_12345",      // Unique transaction ID
  "ref_id": "WryiVbz5sk",      // Promoter's ref_id
  "plan": "premium_monthly"    // Optional: subscription plan
}
```

**Response:**
```json
{
  "success": true,
  "event_id": "tx_12345",
  "customer_id": "cm123...",
  "commissions": {
    "level1": {
      "id": "comm_123",
      "amount": 5.00,
      "promoter": "john@teaseme.com"
    },
    "level2": {
      "id": "comm_124",
      "amount": 2.50,
      "promoter": "parent@teaseme.com"
    }
  }
}
```

---

### 3. Track Signup

**Endpoint:** `POST /api/v2/track/signup`

**Headers:**
```
Authorization: Bearer fp_token_xxx
Account-ID: acc_xxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "uid": "user_12345",           // Optional: your internal user ID
  "tid": "WryiVbz5sk"            // Tracking ID (ref_id)
}
```

**Response:**
```json
{
  "success": true,
  "tid": "WryiVbz5sk",
  "referral_id": "ref_123"
}
```

---

### 4. Track Refund

**Endpoint:** `POST /api/v2/track/refund`

**Headers:**
```
Authorization: Bearer fp_token_xxx
Account-ID: acc_xxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "event_id": "tx_12345",      // Original transaction event_id
  "amount": 5000,              // Refunded amount in CENTS
  "email": "customer@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "event_id": "tx_12345",
  "refund_amount": 50.00,
  "commissions_adjusted": true
}
```

---

### 5. Get Promoter by ID

**Endpoint:** `GET /api/v2/company/promoters/:id`

**Headers:**
```
Authorization: Bearer fp_token_xxx
Account-ID: acc_xxx
```

**Response:**
```json
{
  "id": "cmml8oa1v0000xxw3q7l49gu5",
  "email": "john@teaseme.com",
  "ref_id": "WryiVbz5sk",
  "name": "John Doe",
  "status": "active",
  "created_at": "2026-03-10T23:26:20.899Z",
  "stats": {
    "total_referrals": 15,
    "active_referrals": 12,
    "total_earnings": 250.50,
    "pending_commissions": 3
  },
  "referrals": [...]
}
```

---

### 6. Search Promoters by ref_id

**Endpoint:** `GET /api/v2/company/promoters?search=<ref_id>`

**Headers:**
```
Authorization: Bearer fp_token_xxx
Account-ID: acc_xxx
```

**Example:**
```bash
curl "http://localhost:5555/api/v2/company/promoters?search=WryiVbz5sk" \
  -H "Authorization: Bearer fp_token_xxx" \
  -H "Account-ID: acc_xxx"
```

**Response:**
```json
{
  "id": "cmml8oa1v0000xxw3q7l49gu5",
  "email": "john@teaseme.com",
  "ref_id": "WryiVbz5sk",
  "name": "John Doe",
  "status": "active",
  "stats": {
    "total_referrals": 15,
    "total_earnings": 250.50
  }
}
```

---

## 🔗 Integration with TeaseMe.live

### Python Integration (Full Client)

**📦 Use the complete Python client:** See `integration/mjfp.py`

This file contains **all functions** you need, with the **exact same signatures** as FirstPromoter!

**Quick Example:**

```python
from mjfp import (
    fp_create_promoter,
    fp_track_sale_v2,
    fp_track_signup,
    fp_track_refund,
    fp_find_promoter_id_by_ref_token,
    MJFPConfig
)

# 1. Configure (in your settings.py)
MJFPConfig.MJFP_API_URL = "http://localhost:5555/api"  # or production URL
MJFPConfig.MJFP_API_KEY = "fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ"
MJFPConfig.MJFP_TOKEN = "fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G"
MJFPConfig.MJFP_ACCOUNT_ID = "acc_kDP8UCZW2J-exA55"

# 2. Create promoter (EXACTLY like FirstPromoter!)
promoter = await fp_create_promoter(
    email=pre.email,
    first_name=first,
    last_name=last,
    cust_id=f"preinf-{pre.id}",
    username=pre.username,  # Unique username for the promoter
    parent_promoter_id=parent_promoter_id,  # Optional parent
)

# 3. Track sale when payment is processed
async def process_topup(topup_record):
    if not topup_record['fp_tracked']:
        result = await fp_track_sale_v2(
            email=topup_record['user_email'],
            amount_cents=int(topup_record['amount'] * 100),
            event_id=topup_record['transaction_id'],
            ref_id=topup_record['influencer_id'],  # Promoter's ref_id
            plan=topup_record.get('plan_name', 'topup')
        )
        
        if result and result.get('success'):
            await mark_topup_tracked(topup_record['id'])
            log.info(f"✅ Commissions: {result['commissions']}")
```

---

## 🧪 Testing

### Test All Endpoints

```bash
# 1. Create a promoter
curl -X POST http://localhost:5555/api/v1/promoters/create \
  -H "X-API-KEY: fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","first_name":"Test","last_name":"User"}'

# Save the ref_id from response (e.g., "WryiVbz5sk")

# 2. Search for the promoter
curl "http://localhost:5555/api/v2/company/promoters?search=WryiVbz5sk" \
  -H "Authorization: Bearer fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G" \
  -H "Account-ID: acc_kDP8UCZW2J-exA55"

# 3. Track a sale (requires active referral first - create via UI or referral endpoint)
curl -X POST http://localhost:5555/api/v2/track/sale \
  -H "Authorization: Bearer fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G" \
  -H "Account-ID: acc_kDP8UCZW2J-exA55" \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@test.com","amount":10000,"event_id":"tx_001","ref_id":"WryiVbz5sk"}'
```

---

## 📝 Migration Checklist

- [x] ✅ Database schema updated with `ApiKey` model
- [x] ✅ API authentication middleware (v1 & v2)
- [x] ✅ POST `/api/v1/promoters/create`
- [x] ✅ POST `/api/v2/track/sale`
- [x] ✅ POST `/api/v2/track/signup`
- [x] ✅ POST `/api/v2/track/refund`
- [x] ✅ GET `/api/v2/company/promoters/:id`
- [x] ✅ GET `/api/v2/company/promoters?search=<ref_id>`
- [x] ✅ Multi-level commission tracking (Level 1 & 2)
- [x] ✅ Duplicate sale prevention (event_id tracking)
- [x] ✅ Customer record creation
- [x] ✅ API key generation script
- [x] ✅ Full integration documentation

---

## 🎉 You're Ready!

Your MJ Promoter app now has **100% FirstPromoter-compatible APIs**. 

**Next Steps:**
1. Deploy your app
2. Update your `MJ_API_URL` in TeaseMe.live
3. Replace FirstPromoter credentials with MJ Promoter credentials
4. Test with a real payment
5. Monitor commissions in the dashboard!

---

## 🐛 Troubleshooting

### "No active referral found"
- Ensure the promoter has accepted at least one referral invitation
- Check that `ref_id` matches an existing promoter's `inviteCode`
- Verify referral status is `ACTIVE` in the database

### "API key required" / "Invalid credentials"
- Regenerate API credentials using `create-api-key.ts`
- Check headers are correctly set (`X-API-KEY` for v1, `Authorization` + `Account-ID` for v2)

### "campaignId required"
- All sales must be associated with a campaign
- Create at least one campaign via the UI first
- Ensure the referral has an active campaign

---

**Questions?** Check the logs in the terminal running the server or contact support.

🚀 **Happy tracking!**
