"""
Quick test script to simulate fp_track_sale_v2
This creates a test sale/commission without needing TeaseMe.live
"""

import asyncio
import sys
import time
from mjfp import fp_track_sale_v2, MJFPConfig

# Configure with your credentials
MJFPConfig.MJFP_API_URL = "http://localhost:5555/api"
MJFPConfig.MJFP_TOKEN = "fp_token_4-mqzfOawT_slE8dAx1R2aKGnbz1i8_EV2oh8N6MCOXvC49G"
MJFPConfig.MJFP_ACCOUNT_ID = "acc_kDP8UCZW2J-exA55"


async def simulate_sale(identifier: str, amount_dollars: float = 100.0, use_username: bool = False):
    """
    Simulate a sale for testing
    
    Args:
        identifier: The promoter's ref_id (inviteCode) OR username
        amount_dollars: Sale amount in dollars (e.g., 100.0 = $100.00)
        use_username: If True, treats identifier as username instead of ref_id
    """
    print("\n" + "="*80)
    print("🛒 SIMULATING SALE")
    print("="*80)
    
    # Generate unique event_id using timestamp
    event_id = f"test_tx_{int(time.time() * 1000)}"
    amount_cents = int(amount_dollars * 100)
    
    print(f"📊 Sale Details:")
    print(f"   Customer Email: buyer@example.com")
    print(f"   Amount: ${amount_dollars:.2f} (${amount_cents} cents)")
    print(f"   Event ID: {event_id}")
    if use_username:
        print(f"   Promoter username: {identifier}")
    else:
        print(f"   Promoter ref_id: {identifier}")
    print(f"   Plan: premium")
    print()
    
    try:
        # Build parameters based on whether we're using username or ref_id
        params = {
            "email": "buyer@example.com",
            "amount_cents": amount_cents,
            "event_id": event_id,
            "plan": "premium"
        }
        
        if use_username:
            params["username"] = identifier
        else:
            params["ref_id"] = identifier
        
        result = await fp_track_sale_v2(**params)
        
        if result and result.get('success'):
            print("✅ SALE TRACKED SUCCESSFULLY!")
            print()
            print(f"📦 Response Details:")
            print(f"   Event ID: {result['event_id']}")
            print(f"   Customer ID: {result.get('customer_id', 'N/A')}")
            print()
            
            commissions = result.get('commissions', {})
            
            if commissions:
                print("💰 Commissions Created:")
                
                if 'level1' in commissions:
                    level1 = commissions['level1']
                    print(f"   🥇 Level 1 (Direct):")
                    print(f"      Amount: ${level1['amount']:.2f}")
                    print(f"      Promoter: {level1['promoter']}")
                    print(f"      Commission ID: {level1['id']}")
                
                if 'level2' in commissions:
                    level2 = commissions['level2']
                    print(f"   🥈 Level 2 (Indirect):")
                    print(f"      Amount: ${level2['amount']:.2f}")
                    print(f"      Promoter: {level2['promoter']}")
                    print(f"      Commission ID: {level2['id']}")
            else:
                print("⚠️  No commissions created (check if promoter has active referral)")
            
            print()
            print("📍 Next Steps:")
            print("   1. Check the dashboard at http://localhost:3000")
            print("   2. Login as the promoter to see their earnings")
            print("   3. Check the Commissions page to see the new commission")
            
            return True
        else:
            print("❌ Sale tracking failed")
            print(f"   Response: {result}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    print("\n🧪 MJ Promoter - Sale Simulation Tool")
    print("="*80)
    
    # Check if identifier was provided as argument
    use_username = False
    if len(sys.argv) > 1:
        identifier = sys.argv[1]
        amount = float(sys.argv[2]) if len(sys.argv) > 2 else 100.0
        
        # Check if --username flag is provided
        if '--username' in sys.argv or '-u' in sys.argv:
            use_username = True
    else:
        print("\n⚠️  Usage: python test_sale.py <identifier> [amount] [--username]")
        print("\nExamples:")
        print("   # Using ref_id (inviteCode)")
        print("   python test_sale.py WryiVbz5sk 50.00")
        print()
        print("   # Using username")
        print("   python test_sale.py yoda 50.00 --username")
        print()
        print("💡 How to get a promoter identifier:")
        print("   1. Login to dashboard at http://localhost:3000")
        print("   2. Go to Promoters page")
        print("   3. Use either 'username' or 'inviteCode'")
        print("   OR")
        print("   4. Check your database: SELECT username, inviteCode FROM users WHERE role = 'PROMOTER';")
        print()
        
        # Try with default demo username
        print("🔄 Attempting with demo username 'yoda'...")
        identifier = "yoda"
        amount = 100.0
        use_username = True
    
    success = await simulate_sale(identifier, amount, use_username)
    
    if success:
        print("\n✅ Test completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Test failed - see errors above")
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
