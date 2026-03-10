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

  // Create Demo Campaigns
  const campaign1 = await prisma.campaign.create({
    data: {
      name: 'TeaseMe Referral Program',
      description: '10% recurring commission for promoting TeaseMe platform',
      websiteUrl: 'https://teaseme.live',
      defaultReferralUrl: 'https://teaseme.live/join',
      commissionRate: 10.0,
      secondaryRate: 5.0,
      recurringRate: 10.0,
      cookieLifeDays: 60,
      autoApprove: true,
      referralDiscount: 0,
      referralReward: 0,
      createdById: admin.id,
      isActive: true
    }
  });
  console.log('✅ Created campaign:', campaign1.name);

  const campaign2 = await prisma.campaign.create({
    data: {
      name: 'TeaseMe AI Model',
      description: '30% recurring commission + 10% second tier commission on original sale',
      websiteUrl: 'https://teaseme.live',
      defaultReferralUrl: 'https://teaseme.live/models',
      commissionRate: 30.0,
      secondaryRate: 10.0,
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

  // Create Demo Promoters
  const hashedPasswordPromoter = await bcrypt.hash('promoter123', 10);
  const promoter1 = await prisma.user.upsert({
    where: { email: 'yoda@example.com' },
    update: {},
    create: {
      email: 'yoda@example.com',
      password: hashedPasswordPromoter,
      firstName: 'Yoda',
      lastName: 'Master',
      role: UserRole.PROMOTER
    }
  });
  console.log('✅ Created promoter:', promoter1.email);

  const promoter2 = await prisma.user.upsert({
    where: { email: 'luke@example.com' },
    update: {},
    create: {
      email: 'luke@example.com',
      password: hashedPasswordPromoter,
      firstName: 'Luke',
      lastName: 'Skywalker',
      role: UserRole.PROMOTER
    }
  });
  console.log('✅ Created promoter:', promoter2.email);

  // Create Referrals
  const referral1 = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign1.id,
      referrerId: admin.id,
      referredUserId: promoter1.id,
      status: 'ACTIVE',
      level: 1,
      acceptedAt: new Date()
    }
  });
  console.log('✅ Created referral: Admin -> Yoda');

  const referral2 = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign1.id,
      referrerId: promoter1.id,
      referredUserId: promoter2.id,
      status: 'ACTIVE',
      level: 2,
      parentReferralId: referral1.id,
      acceptedAt: new Date()
    }
  });
  console.log('✅ Created referral: Yoda -> Luke (2nd level)');

  // Create some pending referrals (invites not yet accepted)
  const pendingReferral = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign1.id,
      referrerId: promoter1.id,
      status: 'PENDING',
      level: 2,
      parentReferralId: referral1.id
    }
  });
  console.log('✅ Created pending referral invite');

  // Create Tracking Links
  const trackingLink1 = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: promoter1.id,
      campaignId: campaign1.id,
      clicks: 42
    }
  });
  console.log('✅ Created tracking link for Yoda');

  const trackingLink2 = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: promoter2.id,
      campaignId: campaign1.id,
      clicks: 18
    }
  });
  console.log('✅ Created tracking link for Luke');

  // Create Commissions
  await prisma.commission.create({
    data: {
      amount: 150.00,
      percentage: 10.0,
      status: 'paid',
      description: 'First referral commission',
      userId: promoter1.id,
      campaignId: campaign1.id,
      referralId: referral1.id,
      paidAt: new Date()
    }
  });
  console.log('✅ Created commission for Yoda (paid)');

  await prisma.commission.create({
    data: {
      amount: 75.00,
      percentage: 5.0,
      status: 'unpaid',
      description: 'Second-level referral commission',
      userId: promoter1.id,
      campaignId: campaign1.id,
      referralId: referral2.id
    }
  });
  console.log('✅ Created commission for Yoda (unpaid)');

  await prisma.commission.create({
    data: {
      amount: 200.00,
      percentage: 10.0,
      status: 'pending',
      description: 'Pending verification',
      userId: promoter2.id,
      campaignId: campaign1.id,
      referralId: referral2.id
    }
  });
  console.log('✅ Created commission for Luke (pending)');

  // Create some click tracking data
  await prisma.clickTracking.createMany({
    data: [
      {
        trackingLinkId: trackingLink1.id,
        userId: promoter1.id,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        referrerUrl: 'https://twitter.com'
      },
      {
        trackingLinkId: trackingLink1.id,
        userId: promoter1.id,
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0',
        referrerUrl: 'https://facebook.com'
      },
      {
        trackingLinkId: trackingLink2.id,
        userId: promoter2.id,
        ipAddress: '192.168.1.3',
        userAgent: 'Chrome/90.0',
        referrerUrl: 'https://instagram.com'
      }
    ]
  });
  console.log('✅ Created click tracking data');

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📝 Login Credentials:');
  console.log('   Admin: admin@example.com / admin123');
  console.log('   Promoter (Yoda): yoda@example.com / promoter123');
  console.log('   Promoter (Luke): luke@example.com / promoter123');
  console.log('\n🔗 Demo Data:');
  console.log(`   Campaign 1: ${campaign1.name} (10% commission)`);
  console.log(`   Campaign 2: ${campaign2.name} (30% commission)`);
  console.log(`   Pending Invite Code: ${pendingReferral.inviteCode}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
