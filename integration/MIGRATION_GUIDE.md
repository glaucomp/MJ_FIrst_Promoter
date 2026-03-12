# 🔄 Migration Guide: FirstPromoter → MJ Promoter

## Overview

This guide shows you **exactly** how to replace FirstPromoter with MJ Promoter in your TeaseMe.live application.

**Good news:** The API is 100% compatible! You just need to change 3 lines of configuration! 🎉

---

## Step 1: Copy the Python Client

```bash
# Copy mjfp.py to your TeaseMe project
cp integration/mjfp.py /path/to/teaseme/app/integrations/
```

---

## Step 2: Update Configuration

### Before (FirstPromoter):

```python
# app/core/config.py or settings.py
class Settings:
    FIRSTPROMOTER_API_KEY = "fp_xxx"
    FIRSTPROMOTER_TOKEN = "fp_token_xxx"
    FIRSTPROMOTER_ACCOUNT_ID = "acc_xxx"
```

### After (MJ Promoter):

```python
# app/core/config.py or settings.py
class Settings:
    # MJ Promoter credentials (get from create-api-key.ts script)
    MJFP_API_URL = "http://localhost:5555/api"  # Development
    # MJFP_API_URL = "https://promoter.yourdomain.com/api"  # Production
    
    MJFP_API_KEY = "fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ"
    MJFP_TOKEN = "fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G"
    MJFP_ACCOUNT_ID = "acc_kDP8UCZW2J-exA55"
```

---

## Step 3: Replace Function Calls

### ✅ No Code Changes Needed!

The function signatures are **100% identical**. Just import from `mjfp` instead of your FirstPromoter module.

### Before:

```python
from app.integrations.firstpromoter import (
    fp_create_promoter,
    fp_track_sale_v2,
    fp_track_signup,
    fp_track_refund,
    fp_find_promoter_id_by_ref_token
)
```

### After:

```python
from app.integrations.mjfp import (
    fp_create_promoter,
    fp_track_sale_v2,
    fp_track_signup,
    fp_track_refund,
    fp_find_promoter_id_by_ref_token,
    MJFPConfig
)

# Update config at startup (or in settings)
MJFPConfig.MJFP_API_URL = settings.MJFP_API_URL
MJFPConfig.MJFP_API_KEY = settings.MJFP_API_KEY
MJFPConfig.MJFP_TOKEN = settings.MJFP_TOKEN
MJFPConfig.MJFP_ACCOUNT_ID = settings.MJFP_ACCOUNT_ID
```

---

## Step 4: Update Your Existing Code

### 🔹 Creating Promoters

**Your existing code** (NO CHANGES NEEDED):

```python
promoter = await fp_create_promoter(
    email=pre.email,
    first_name=first,
    last_name=last,
    cust_id=f"preinf-{pre.id}",
    username=pre.username,  # Unique username for the promoter
    parent_promoter_id=parent_promoter_id,
)
```

✅ This will work **exactly the same** with MJ Promoter!

**Response format** (identical to FirstPromoter):
```python
{
    "id": "cmml9emfy00034c17jlpgudph",
    "email": "ana@teaseme.com",
    "ref_id": "MXt0W-rFLq",           # ← Use this as promoter's ref_id
    "cust_id": "preinf-456",
    "first_name": "Ana",
    "last_name": "Costa",
    "parent_promoter_id": "WryiVbz5sk",  # Parent's ref_id if provided
    "created_at": "2026-03-10T23:46:50.014Z"
}
```

---

### 🔹 Tracking Sales (PayPal Topups)

**Your existing code structure:**

```python
async def process_paypal_topup(topup_id: int):
    """Process PayPal topup and track commission"""
    
    # 1. Get topup from database
    topup = await db.execute(
        "SELECT * FROM paypal_topups WHERE id = %s", (topup_id,)
    )
    
    # 2. Skip if already tracked
    if topup['fp_tracked']:
        return
    
    # 3. Get influencer info
    influencer = await db.execute(
        "SELECT ref_id FROM influencers WHERE id = %s", 
        (topup['influencer_id'],)
    )
    
    # 4. Track in FirstPromoter → NOW TRACKS IN MJ PROMOTER!
    result = await fp_track_sale_v2(
        email=topup['customer_email'],
        amount_cents=int(topup['amount'] * 100),  # Convert to cents
        event_id=topup['transaction_id'],
        ref_id=influencer['ref_id'],  # Promoter's ref_id from MJ Promoter
        plan=topup.get('plan_name', 'topup')
    )
    
    # 5. Mark as tracked
    if result and result.get('success'):
        await db.execute(
            "UPDATE paypal_topups SET fp_tracked = TRUE WHERE id = %s",
            (topup_id,)
        )
        log.info(f"✅ Topup {topup_id} tracked: {result['commissions']}")
```

✅ **NO CHANGES NEEDED!** Just change the import and configuration!

---

### 🔹 Tracking Signups

**Your existing code** (NO CHANGES NEEDED):

```python
async def handle_user_signup(user_email: str, user_id: str, ref_token: str):
    """Track user signup via referral"""
    
    await fp_track_signup(
        email=user_email,
        uid=user_id,
        tid=ref_token  # The ref_id from referral link
    )
```

---

### 🔹 Tracking Refunds

**Your existing code** (NO CHANGES NEEDED):

```python
async def handle_refund(transaction_id: str, refund_amount: float):
    """Track refund and reverse commissions"""
    
    await fp_track_refund(
        event_id=transaction_id,
        amount_cents=int(refund_amount * 100),
        email=customer_email
    )
```

---

## Step 5: Database Mapping

### Your `paypal_topups` table schema:

```sql
CREATE TABLE paypal_topups (
    id SERIAL PRIMARY KEY,
    influencer_id VARCHAR,      -- Maps to promoter's ref_id
    customer_email VARCHAR,
    amount DECIMAL,
    transaction_id VARCHAR,
    plan_name VARCHAR,
    fp_tracked BOOLEAN DEFAULT FALSE,  -- Keep this column!
    created_at TIMESTAMP
);
```

**Important:** Store the **ref_id** (not the internal ID) in your `influencer_id` column!

When you create a promoter via API, save their `ref_id`:

```python
promoter = await fp_create_promoter(...)

# Save to your database:
await db.execute(
    "INSERT INTO influencers (id, email, ref_id) VALUES (%s, %s, %s)",
    (pre.id, promoter['email'], promoter['ref_id'])  # ← Save ref_id!
)
```

---

## Step 6: Test Everything

### 1. Test Create Promoter

```bash
curl -X POST http://localhost:5555/api/v1/promoters/create \
  -H "X-API-KEY: fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ" \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@teaseme.com",
    "first_name":"Test",
    "last_name":"User",
    "cust_id":"preinf-test-1",
    "parent_promoter_id":"WryiVbz5sk"
  }'
```

### 2. Test Track Sale

```bash
curl -X POST http://localhost:5555/api/v2/track/sale \
  -H "Authorization: Bearer fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G" \
  -H "Account-ID: acc_kDP8UCZW2J-exA55" \
  -H "Content-Type: application/json" \
  -d '{
    "email":"buyer@test.com",
    "amount":5000,
    "event_id":"test_tx_001",
    "ref_id":"MXt0W-rFLq"
  }'
```

### 3. Check Dashboard

Open http://localhost:3000 and:
- Login as admin: `admin@example.com` / `admin123`
- Go to **Commissions** page
- Verify the commission was created
- Check **Customers** page for the new customer

---

## Step 7: Deploy to Production

### 1. Deploy MJ Promoter backend

```bash
# Build for production
npm run build

# Deploy to your server (example with PM2)
pm2 start dist/server.js --name mjfp-api

# Or use Docker, Railway, Render, etc.
```

### 2. Update TeaseMe.live configuration

```python
# In production settings
MJFPConfig.MJFP_API_URL = "https://promoter.yourdomain.com/api"
```

### 3. Test with real payment

Process a small test payment and verify:
- Commission appears in MJ Promoter dashboard
- `fp_tracked` is set to `TRUE` in your database
- Promoter can see the commission in their account

---

## 🎯 Complete Integration Example

Here's a **complete** example of how your TeaseMe code should look:

```python
# app/integrations/mjfp.py (the file I created for you)
from mjfp import *

# app/services/payment_service.py
from app.integrations.mjfp import fp_track_sale_v2, fp_create_promoter
import logging

log = logging.getLogger(__name__)

async def create_influencer_as_promoter(influencer_data: dict, parent_ref_id: str | None = None):
    """
    Create an influencer in MJ Promoter when they sign up
    """
    try:
        promoter = await fp_create_promoter(
            email=influencer_data['email'],
            first_name=influencer_data['first_name'],
            last_name=influencer_data['last_name'],
            cust_id=f"preinf-{influencer_data['id']}",
            username=influencer_data['username'],  # Unique username for the promoter
            parent_promoter_id=parent_ref_id,  # Multi-level tracking
        )
        
        # Save ref_id to your database
        await db.execute(
            "UPDATE influencers SET ref_id = %s WHERE id = %s",
            (promoter['ref_id'], influencer_data['id'])
        )
        
        log.info(f"✅ Promoter created: {promoter['email']} (ref_id: {promoter['ref_id']})")
        return promoter
        
    except Exception as e:
        log.error(f"Failed to create promoter: {e}")
        raise


async def track_topup_commission(topup_id: int):
    """
    Track commission when a topup is processed
    Called from your PayPal webhook or payment processing
    """
    # Get topup record
    topup = await db.execute(
        "SELECT * FROM paypal_topups WHERE id = %s",
        (topup_id,)
    )
    
    # Skip if already tracked
    if topup['fp_tracked']:
        log.info(f"Topup {topup_id} already tracked")
        return
    
    # Get influencer's ref_id
    influencer = await db.execute(
        "SELECT ref_id FROM influencers WHERE id = %s",
        (topup['influencer_id'],)
    )
    
    if not influencer or not influencer['ref_id']:
        log.warning(f"No ref_id for influencer {topup['influencer_id']}")
        return
    
    # Track the sale in MJ Promoter
    try:
        result = await fp_track_sale_v2(
            email=topup['customer_email'],
            amount_cents=int(topup['amount'] * 100),  # $50 → 5000 cents
            event_id=topup['transaction_id'],
            ref_id=influencer['ref_id'],
            plan=topup.get('plan_name', 'topup')
        )
        
        if result and result.get('success'):
            # Mark as tracked
            await db.execute(
                "UPDATE paypal_topups SET fp_tracked = TRUE WHERE id = %s",
                (topup_id,)
            )
            
            log.info(f"✅ Topup {topup_id} tracked successfully")
            log.info(f"Commissions created: {result['commissions']}")
            
            return result
            
    except Exception as e:
        log.error(f"Failed to track topup {topup_id}: {e}")
        raise


# Example: PayPal webhook handler
async def paypal_webhook_handler(payload: dict):
    """Handle PayPal IPN webhook"""
    
    transaction_id = payload['txn_id']
    amount = float(payload['mc_gross'])
    customer_email = payload['payer_email']
    influencer_id = payload.get('custom', '')  # Your custom field
    
    # 1. Save to your database
    topup_id = await db.execute(
        """
        INSERT INTO paypal_topups 
        (transaction_id, amount, customer_email, influencer_id, fp_tracked)
        VALUES (%s, %s, %s, %s, FALSE)
        RETURNING id
        """,
        (transaction_id, amount, customer_email, influencer_id)
    )
    
    # 2. Track in MJ Promoter
    await track_topup_commission(topup_id)
```

---

## 🔍 Key Differences from FirstPromoter

### 1. **ref_id vs ID**

MJ Promoter uses `ref_id` (string) instead of numeric IDs:

```python
# FirstPromoter returns:
{"id": 12345, "ref_token": "abc123"}

# MJ Promoter returns:
{"id": "cmml9...", "ref_id": "MXt0W-rFLq"}

# Use ref_id for tracking:
ref_id = promoter['ref_id']  # ← Store this!
```

### 2. **parent_promoter_id**

In FirstPromoter, `parent_promoter_id` is a numeric ID.  
In MJ Promoter, it's the parent's **ref_id** (string):

```python
# FirstPromoter:
parent_promoter_id = 67890  # Numeric ID

# MJ Promoter:
parent_promoter_id = "WryiVbz5sk"  # Parent's ref_id
```

### 3. **Response Format**

MJ Promoter returns data directly (no nested `data` field):

```python
# FirstPromoter:
{"data": {"id": 123, "email": "..."}}

# MJ Promoter:
{"id": "cm123", "email": "..."}

# But the _fp_unwrap() helper handles both! ✅
```

---

## 🧪 Testing Checklist

- [ ] Create test promoter via API
- [ ] Verify promoter appears in MJ Promoter dashboard
- [ ] Process test payment in TeaseMe
- [ ] Verify commission appears in Commissions page
- [ ] Check promoter sees commission in their dashboard
- [ ] Test multi-level referral (child promoter)
- [ ] Test refund tracking
- [ ] Verify `fp_tracked` flag updates correctly

---

## 🔒 Security Checklist

- [ ] Move credentials to environment variables
- [ ] Use HTTPS in production (`https://promoter.yourdomain.com`)
- [ ] Rotate API keys after testing
- [ ] Set up monitoring/logging
- [ ] Add rate limiting if needed
- [ ] Enable CORS only for your TeaseMe domain

---

## 📊 Monitoring

After migration, monitor:

1. **MJ Promoter Dashboard** (http://localhost:3000)
   - Commissions page: Verify all sales are tracked
   - Customers page: Check customer records
   - Promoters page: View all active promoters

2. **Your Database**
   - Check `fp_tracked` column in `paypal_topups`
   - Verify no duplicates (same `transaction_id`)

3. **Server Logs**
   - Check for API errors: `tail -f server.log`
   - Monitor commission creation logs

---

## 🆘 Troubleshooting

### Problem: "No active referral found"

**Solution:** The promoter needs to have accepted at least one referral. In MJ Promoter:
1. Login as the promoter
2. Go to Dashboard → Generate Referral Link
3. Or create referral via UI as Admin

### Problem: "campaignId required"

**Solution:** Create at least one campaign in MJ Promoter UI:
1. Login as admin
2. Go to Campaigns → Create Campaign
3. Set commission rates and activate it

### Problem: API calls fail with 401

**Solution:** Regenerate API credentials:
```bash
cd /Users/glaucomp/MJ_FIrst_Promoter
npx ts-node src/scripts/create-api-key.ts
```

### Problem: Commissions not showing

**Solution:** Check:
1. Campaign is active (`isActive: true`)
2. Campaign is visible to promoters (`visibleToPromoters: true`)
3. Referral status is `ACTIVE`
4. Check server logs for errors

---

## 🎉 Migration Complete!

You're now running MJ Promoter! Your TeaseMe.live payment gateway will:

1. ✅ Create promoters with multi-level hierarchy
2. ✅ Track all sales automatically
3. ✅ Calculate commissions (Level 1 & 2)
4. ✅ Handle refunds
5. ✅ Provide dashboard for promoters
6. ✅ Give you full control and visibility

**No more monthly fees to FirstPromoter!** 🚀

---

## 📞 Support

If you encounter any issues:
1. Check server logs: `tail -f server.log`
2. Review API logs in MJ Promoter dashboard
3. Test endpoints with cURL (see examples above)
4. Check the `API_INTEGRATION_GUIDE.md` for full API docs

**Happy tracking!** 🎉
