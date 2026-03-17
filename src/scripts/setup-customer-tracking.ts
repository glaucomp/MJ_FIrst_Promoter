import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupCustomerTracking() {
  console.log('🔧 Setting up customer tracking referrals...\n');

  try {
    // Get all campaigns
    const campaigns = await prisma.campaign.findMany();
    if (campaigns.length === 0) {
      console.log('❌ No campaigns found. Create a campaign first.');
      return;
    }
    const campaign = campaigns[0];
    console.log(`✅ Using campaign: ${campaign.name}`);

    // Get all users who are promoters and have been invited by someone
    const promoters = await prisma.user.findMany({
      where: { role: 'PROMOTER' }
    });

    console.log(`\n📊 Found ${promoters.length} promoters\n`);

    for (const promoter of promoters) {
      // Check if they already have a customer tracking referral
      const existingTracking = await prisma.referral.findFirst({
        where: {
          referrerId: promoter.id,
          referredUserId: null,
          status: 'ACTIVE'
        }
      });

      if (existingTracking) {
        console.log(`⏭️  ${promoter.username || promoter.email} already has customer tracking`);
        continue;
      }

      // Find who invited this promoter (person-to-person referral)
      const invitationReferral = await prisma.referral.findFirst({
        where: {
          referredUserId: promoter.id,
          status: 'ACTIVE'
        },
        include: {
          referrer: true
        }
      });

      let parentCustomerReferralId = null;

      if (invitationReferral) {
        // Find the parent's customer tracking referral
        const parentCustomerReferral = await prisma.referral.findFirst({
          where: {
            referrerId: invitationReferral.referrerId,
            referredUserId: null,
            status: 'ACTIVE'
          }
        });

        if (parentCustomerReferral) {
          parentCustomerReferralId = parentCustomerReferral.id;
          console.log(`  └─ Parent: ${invitationReferral.referrer.username || invitationReferral.referrer.email}`);
        } else {
          console.log(`  └─ Parent: ${invitationReferral.referrer.username || invitationReferral.referrer.email} (no customer tracking yet)`);
        }
      } else {
        console.log(`  └─ Top level (no parent)`);
      }

      // Create customer tracking referral
      const inviteCode = `${promoter.username || promoter.email.split('@')[0]}_${Math.random().toString(36).substring(2, 10)}`;
      
      const customerReferral = await prisma.referral.create({
        data: {
          referrerId: promoter.id,
          referredUserId: null,
          inviteCode,
          campaignId: campaign.id,
          parentReferralId: parentCustomerReferralId,
          status: 'ACTIVE'
        }
      });

      console.log(`✅ Created customer tracking for ${promoter.username || promoter.email}`);
      console.log(`   Code: ${inviteCode}\n`);
    }

    console.log('\n🎉 Customer tracking setup complete!');
    console.log('\n📋 Summary:');
    
    // Show the complete hierarchy
    const allCustomerReferrals = await prisma.referral.findMany({
      where: {
        referredUserId: null,
        status: 'ACTIVE'
      },
      include: {
        referrer: true,
        parentReferral: {
          include: {
            referrer: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    for (const ref of allCustomerReferrals) {
      const username = ref.referrer.username || ref.referrer.email;
      const parent = ref.parentReferral 
        ? ` → Parent: ${ref.parentReferral.referrer.username || ref.parentReferral.referrer.email}`
        : ' (Top level)';
      console.log(`  • ${username}${parent}`);
    }

  } catch (error) {
    console.error('❌ Error setting up customer tracking:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

setupCustomerTracking()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
