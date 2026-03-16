import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Admin User
  const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPasswordAdmin,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN
    }
  });
  console.log('✅ Created admin user:', admin.email);

  // Campaign 1: Account Manager → Influencer (Influencer 30%, Manager 10%)
  const campaign1 = await prisma.campaign.create({
    data: {
      name: 'Account Manager Campaign',
      description: 'Account Manager invites Influencer: Influencer 30%, Manager 10%',
      websiteUrl: 'https://teaseme.live',
      defaultReferralUrl: 'https://teaseme.live/join',
      commissionRate: 30.0,
      secondaryRate: 10.0,
      recurringRate: 30.0,
      cookieLifeDays: 90,
      autoApprove: true,
      referralDiscount: 0,
      referralReward: 0,
      createdById: admin.id,
      isActive: true
    }
  });
  console.log('✅ Created campaign:', campaign1.name);

  // Campaign 2: Influencer → Influencer Friend (Friend 30%, Influencer 5%)
  const campaign2 = await prisma.campaign.create({
    data: {
      name: 'Influencer Referral Campaign',
      description: 'Influencer invites Friend: Friend 30%, Influencer 5%',
      websiteUrl: 'https://teaseme.live',
      defaultReferralUrl: 'https://teaseme.live/models',
      commissionRate: 30.0,
      secondaryRate: 5.0,
      recurringRate: 30.0,
      cookieLifeDays: 90,
      autoApprove: false,
      referralDiscount: 15.0,
      referralReward: 50.0,
      createdById: admin.id,
      isActive: true
    }
  });
  console.log('✅ Created campaign:', campaign2.name);

  // Create Account Manager - Jorlyn
  const hashedPasswordPromoter = await bcrypt.hash('promoter123', 10);
  const jorlyn = await prisma.user.upsert({
    where: { email: 'jorlyn@example.com' },
    update: {},
    create: {
      email: 'jorlyn@example.com',
      username: 'jorlyn',
      password: hashedPasswordPromoter,
      firstName: 'Jorlyn',
      lastName: 'Manager',
      role: UserRole.PROMOTER
    }
  });
  console.log('✅ Created account manager:', jorlyn.email);

  // Create Influencer - Sofia
  const sofia = await prisma.user.upsert({
    where: { email: 'sofia@example.com' },
    update: {},
    create: {
      email: 'sofia@example.com',
      username: 'sofia',
      password: hashedPasswordPromoter,
      firstName: 'Sofia',
      lastName: 'Martinez',
      role: UserRole.PROMOTER
    }
  });
  console.log('✅ Created influencer:', sofia.email);

  // Create Influencer Friend - Kelly
  const kelly = await prisma.user.upsert({
    where: { email: 'kelly@example.com' },
    update: {},
    create: {
      email: 'kelly@example.com',
      username: 'kelly',
      password: hashedPasswordPromoter,
      firstName: 'Kelly',
      lastName: 'Johnson',
      role: UserRole.PROMOTER
    }
  });
  console.log('✅ Created influencer friend:', kelly.email);

  // Create Referral Hierarchy
  // Campaign 1: Jorlyn (Account Manager) invites Sofia (Influencer)
  // Jorlyn gets 10%, Sofia gets 30%
  const referralJorlynToSofia = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign1.id,
      referrerId: jorlyn.id,
      referredUserId: sofia.id,
      status: 'ACTIVE',
      level: 1,
      acceptedAt: new Date()
    }
  });
  console.log('✅ Created referral: Jorlyn -> Sofia (Campaign 1: Jorlyn 10%, Sofia 30%)');

  // Campaign 2: Sofia invites Kelly (her friend)
  // Sofia gets 5%, Kelly gets 30%
  const referralSofiaToKelly = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign2.id,
      referrerId: sofia.id,
      referredUserId: kelly.id,
      status: 'ACTIVE',
      level: 2,
      parentReferralId: referralJorlynToSofia.id,
      acceptedAt: new Date()
    }
  });
  console.log('✅ Created referral: Sofia -> Kelly (Campaign 2: Sofia 5%, Kelly 30%)');

  // Create Tracking Links
  const trackingLinkJorlyn = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: jorlyn.id,
      campaignId: campaign1.id,
      clicks: 15
    }
  });
  console.log('✅ Created tracking link for Jorlyn');

  const trackingLinkSofia = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: sofia.id,
      campaignId: campaign2.id,
      clicks: 42
    }
  });
  console.log('✅ Created tracking link for Sofia');

  const trackingLinkKelly = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: kelly.id,
      campaignId: campaign2.id,
      clicks: 28
    }
  });
  console.log('✅ Created tracking link for Kelly');

  // Create referral codes for Sofia and Kelly to track their customers
  const referralSofiaCustomers = await prisma.referral.create({
    data: {
      inviteCode: 'sofia_' + nanoid(8),
      campaignId: campaign1.id,
      referrerId: sofia.id,
      status: 'ACTIVE',
      level: 2,
      parentReferralId: referralJorlynToSofia.id,
      acceptedAt: new Date()
    }
  });
  console.log('✅ Created referral code for Sofia\'s customers');

  const referralKellyCustomers = await prisma.referral.create({
    data: {
      inviteCode: 'kelly_' + nanoid(8),
      campaignId: campaign2.id,
      referrerId: kelly.id,
      status: 'ACTIVE',
      level: 3,
      parentReferralId: referralSofiaToKelly.id,
      acceptedAt: new Date()
    }
  });
  console.log('✅ Created referral code for Kelly\'s customers');

  console.log('\n📝 Referral Codes:');
  console.log('   Sofia code (for her customers): ' + referralSofiaCustomers.inviteCode);
  console.log('   Kelly code (for her customers): ' + referralKellyCustomers.inviteCode);
  console.log('\n🔗 Referral Hierarchy:');
  console.log('   Campaign 1: Jorlyn -> Sofia (Jorlyn 10%, Sofia 30%)');
  console.log('   Campaign 2: Sofia -> Kelly (Sofia 5%, Kelly 30%)');

  // Create some click tracking data
  await prisma.clickTracking.createMany({
    data: [
      {
        trackingLinkId: trackingLinkJorlyn.id,
        userId: jorlyn.id,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        referrerUrl: 'https://twitter.com'
      },
      {
        trackingLinkId: trackingLinkSofia.id,
        userId: sofia.id,
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0',
        referrerUrl: 'https://facebook.com'
      },
      {
        trackingLinkId: trackingLinkKelly.id,
        userId: kelly.id,
        ipAddress: '192.168.1.3',
        userAgent: 'Chrome/90.0',
        referrerUrl: 'https://instagram.com'
      }
    ]
  });
  console.log('✅ Created click tracking data');

  // Create API Key for testing
  const apiKey = await prisma.apiKey.create({
    data: {
      key: 'test_api_key_123',
      token: 'tk_test_456',
      accountId: 'acc_test_789',
      name: 'Test API Key',
      isActive: true,
      userId: admin.id
    }
  });
  console.log('✅ Created API key for testing');

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📝 Login Credentials:');
  console.log('   Admin: admin@example.com / admin123');
  console.log('   Account Manager (Jorlyn): jorlyn@example.com / promoter123');
  console.log('   Influencer (Sofia): sofia@example.com / promoter123');
  console.log('   Influencer (Kelly): kelly@example.com / promoter123');
  console.log('\n🔗 Demo Data:');
  console.log(`   Campaign 1: ${campaign1.name} (Sofia 30%, Jorlyn 10%)`);
  console.log(`   Campaign 2: ${campaign2.name} (Kelly 30%, Sofia 5%)`);
  console.log('\n🔑 API Key:');
  console.log(`   Token: ${apiKey.token}`);
  console.log(`   Account ID: ${apiKey.accountId}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
