# 🐍 MJ First Promoter - Python Integration

## Quick Start

### 1. Copy the integration file to your project

```bash
cp integration/mjfp.py your_project/app/integrations/
```

### 2. Configure credentials

Add to your `settings.py` or `.env`:

```python
# settings.py
MJFP_API_URL = "http://localhost:5555/api"  # Development
# MJFP_API_URL = "https://promoter.yourdomain.com/api"  # Production

MJFP_API_KEY = "fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ"
MJFP_TOKEN = "fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G"
MJFP_ACCOUNT_ID = "acc_kDP8UCZW2J-exA55"
```

Or use environment variables:

```bash
export MJFP_API_URL="http://localhost:5555/api"
export MJFP_API_KEY="fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ"
export MJFP_TOKEN="fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G"
export MJFP_ACCOUNT_ID="acc_kDP8UCZW2J-exA55"
```

### 3. Update your code

In your `mjfp.py`, update the `MJFPConfig` class:

```python
class MJFPConfig:
    MJFP_API_URL = os.getenv("MJFP_API_URL", "http://localhost:5555/api")
    MJFP_API_KEY = os.getenv("MJFP_API_KEY")
    MJFP_TOKEN = os.getenv("MJFP_TOKEN")
    MJFP_ACCOUNT_ID = os.getenv("MJFP_ACCOUNT_ID")
```

---

## 📝 Usage Examples

### Create Promoter (V1 API)

```python
from mjfp import fp_create_promoter

# Exactly like your FirstPromoter code!
promoter = await fp_create_promoter(
    email=pre.email,
    first_name=first,
    last_name=last,
    cust_id=f"preinf-{pre.id}",
    username=pre.username,  # Unique username for the promoter
    parent_promoter_id=parent_promoter_id,  # Optional: parent's ref_id
)

# Response:
# {
#   "id": "cmml946th00004c171d4othnn",
#   "email": "maria@teaseme.com",
#   "ref_id": "ywvliseOZ7",          ← Save this!
#   "cust_id": "preinf-999",
#   "parent_promoter_id": "WryiVbz5sk",
#   "created_at": "2026-03-10T23:38:43.205Z"
# }
```

### Track Sale (V2 API)

```python
from mjfp import fp_track_sale_v2

# When a payment is processed in your paypal_topups table:
result = await fp_track_sale_v2(
    email="customer@example.com",
    amount_cents=5000,              # $50.00 in cents
    event_id="tx_12345",            # Your transaction ID
    ref_id="ywvliseOZ7",            # Promoter's ref_id
    plan="premium_monthly"          # Optional
)

# Response:
# {
#   "success": true,
#   "event_id": "tx_12345",
#   "customer_id": "cm123...",
#   "commissions": {
#     "level1": {
#       "id": "comm_123",
#       "amount": 5.00,
#       "promoter": "maria@teaseme.com"
#     },
#     "level2": {
#       "id": "comm_124",
#       "amount": 2.50,
#       "promoter": "parent@teaseme.com"
#     }
#   }
# }
```

### Track Signup (V2 API)

```python
from mjfp import fp_track_signup

# When a user signs up via referral link:
await fp_track_signup(
    email="newuser@example.com",
    uid="user_12345",
    tid="ywvliseOZ7"  # Tracking ID from URL parameter
)
```

### Track Refund (V2 API)

```python
from mjfp import fp_track_refund

# When a payment is refunded:
await fp_track_refund(
    event_id="tx_12345",     # Original transaction ID
    amount_cents=5000,       # Refunded amount
    email="customer@example.com"
)
```

### Search Promoter by ref_id

```python
from mjfp import fp_find_promoter_id_by_ref_token

promoter_id = await fp_find_promoter_id_by_ref_token("ywvliseOZ7")
if promoter_id:
    print(f"Found promoter ID: {promoter_id}")
```

### Get Promoter Details

```python
from mjfp import fp_get_promoter_v2

promoter = await fp_get_promoter_v2("cmml946th00004c171d4othnn")
if promoter:
    print(f"Email: {promoter['email']}")
    print(f"Earnings: ${promoter['stats']['total_earnings']:.2f}")
    print(f"Referrals: {promoter['stats']['total_referrals']}")
```

---

## 🔄 Migration from FirstPromoter

### Before (FirstPromoter):

```python
from app.core.config import settings

# In settings:
FIRSTPROMOTER_API_KEY = "fp_xxx"
FIRSTPROMOTER_TOKEN = "fp_token_xxx"
FIRSTPROMOTER_ACCOUNT_ID = "acc_xxx"

# API calls use FirstPromoter URLs
```

### After (MJ Promoter):

```python
from mjfp import MJFPConfig

# Update config (just change the values!):
MJFPConfig.MJFP_API_URL = "https://promoter.yourdomain.com/api"
MJFPConfig.MJFP_API_KEY = "fp_key_ByfKtLyM8sSCVl4G_buVY0QFeBUifmIZ"
MJFPConfig.MJFP_TOKEN = "fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G"
MJFPConfig.MJFP_ACCOUNT_ID = "acc_kDP8UCZW2J-exA55"

# All function calls remain EXACTLY the same!
# No code changes needed beyond configuration! 🎉
```

---

## 🔧 Integration with PayPal Topups

```python
# In your payment processing code:
async def process_topup_payment(topup_id: int):
    """Process a topup payment and track in MJ Promoter"""
    
    # Get topup from database
    topup = await db.get_topup(topup_id)
    
    # Skip if already tracked
    if topup['fp_tracked']:
        return
    
    # Get influencer's ref_id
    influencer = await db.get_influencer(topup['influencer_id'])
    ref_id = influencer['ref_id']  # The promoter's ref_id from MJ Promoter
    
    # Track the sale
    try:
        result = await fp_track_sale_v2(
            email=topup['customer_email'],
            amount_cents=int(topup['amount'] * 100),  # Convert $ to cents
            event_id=topup['transaction_id'],
            ref_id=ref_id,
            plan=topup.get('plan_name', 'topup')
        )
        
        if result and result.get('success'):
            # Mark as tracked
            await db.update_topup(topup_id, {'fp_tracked': True})
            log.info(f"✅ Topup {topup_id} tracked successfully")
            
    except Exception as e:
        log.error(f"Failed to track topup {topup_id}: {e}")
```

---

## 🧪 Testing

### Test Create Promoter

```python
import asyncio
from mjfp import fp_create_promoter

async def test():
    promoter = await fp_create_promoter(
        email="test@teaseme.com",
        first_name="Test",
        last_name="User",
        cust_id="preinf-test-123",
        username="testuser",
        parent_promoter_id="WryiVbz5sk",  # Optional parent
        temp_password="test123"
    )
    print(f"Created: {promoter}")

asyncio.run(test())
```

### Test Track Sale

```python
from mjfp import fp_track_sale_v2

async def test():
    result = await fp_track_sale_v2(
        email="buyer@example.com",
        amount_cents=10000,  # $100.00
        event_id="test_tx_001",
        ref_id="ywvliseOZ7"  # Promoter's ref_id
    )
    print(f"Sale tracked: {result}")

asyncio.run(test())
```

---

## 🔐 Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all sensitive data
3. **Rotate API keys** periodically
4. **Monitor API usage** in MJ Promoter dashboard
5. **Use HTTPS** in production

---

## 🐛 Troubleshooting

### "MJFP credentials not configured"
- Check that `MJFP_API_KEY`, `MJFP_TOKEN`, and `MJFP_ACCOUNT_ID` are set
- Verify credentials match those generated by `create-api-key.ts`

### "No active referral found"
- Ensure the promoter exists and has a valid `ref_id`
- Create at least one campaign in the UI first
- Check that the campaign has `visibleToPromoters: true`

### "event_id is required"
- Every sale must have a unique `event_id` (transaction ID)
- Use your payment gateway's transaction ID

### Connection refused
- Ensure MJ Promoter server is running: `npm run dev`
- Check the API URL is correct
- Verify firewall/network settings

---

## 📊 Monitoring

Check your commissions and sales in the MJ Promoter dashboard:
- **Admin Dashboard**: http://localhost:3000
- **Commissions Page**: View all tracked commissions
- **Customers Page**: View all tracked customers
- **Promoters Page**: View all promoters and their stats

---

## 🎉 You're All Set!

Your integration is now **100% compatible** with FirstPromoter. Just update your configuration and everything will work seamlessly!

**Need help?** Check the server logs or the API documentation in `API_INTEGRATION_GUIDE.md`.
