import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCampaigns() {
  try {
    console.log('🔧 Fixing campaign commission rates...\n');

    // Get all campaigns
    const campaigns = await prisma.campaign.findMany();
    
    console.log(`Found ${campaigns.length} campaigns\n`);

    for (const campaign of campaigns) {
      console.log(`\n📋 Campaign: ${campaign.name}`);
      console.log(`   Current - Level 1: ${campaign.commissionRate}%, Level 2: ${campaign.secondaryRate}%`);
      
      let newCommissionRate = campaign.commissionRate;
      let newSecondaryRate = campaign.secondaryRate || 0;
      let newReferralDiscount = 30; // The 30% discount for customers

      // Fix based on campaign name pattern
      if (campaign.name.toLowerCase().includes('ai model')) {
        // Account Manager campaign
        newCommissionRate = 30;  // Invited Account Manager earns 30% (Tier 1)
        newSecondaryRate = 10;   // Person who invited them earns 10% (Tier 2)
        newReferralDiscount = 0; // No customer discount
        console.log(`   ✅ Fixed to - Tier 1: 30%, Tier 2: 10%`);
      } else if (campaign.name.toLowerCase().includes('referral program')) {
        // Customer Referral campaign
        newCommissionRate = 30;  // Invited customer earns 30% (Tier 1)
        newSecondaryRate = 5;    // Person who invited them earns 5% (Tier 2)
        newReferralDiscount = 0; // No customer discount
        console.log(`   ✅ Fixed to - Tier 1: 30%, Tier 2: 5%`);
      }

      // Update the campaign
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          commissionRate: newCommissionRate,
          secondaryRate: newSecondaryRate,
          referralDiscount: newReferralDiscount
        }
      });
    }

    console.log('\n\n✅ All campaigns fixed successfully!\n');
    console.log('Campaign Summary:');
    console.log('─────────────────────────────────────────────');
    
    const updatedCampaigns = await prisma.campaign.findMany();
    for (const campaign of updatedCampaigns) {
      console.log(`\n${campaign.name}:`);
      console.log(`  Promoter Commission: ${campaign.commissionRate}%`);
      console.log(`  Level 2 Commission: ${campaign.secondaryRate}%`);
      console.log(`  Customer Discount: ${campaign.referralDiscount}%`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing campaigns:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCampaigns();
