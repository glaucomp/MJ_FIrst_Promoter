import { PrismaClient, UserRole, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Create Admin User
  const hashedPasswordAdmin = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      password: hashedPasswordAdmin,
      firstName: "Admin",
      lastName: "User",
      role: UserRole.ADMIN,
      userType: UserType.ADMIN,
    },
  });
  console.log("✅ Created admin user:", admin.email);

  // Campaign 2: Influencer → Influencer Friend (Friend 30%, Influencer 5%)
  // This is the visible campaign that promoters can access
  const campaign2 = await prisma.campaign.create({
    data: {
      name: "Influencer Referral Campaign",
      description: "Influencer invites Friend: Friend 30%, Influencer 5%",
      websiteUrl: "https://teaseme.live",
      defaultReferralUrl: "https://teaseme.live/join",
      commissionRate: 30.0,
      secondaryRate: 5.0,
      recurringRate: 30.0,
      cookieLifeDays: 90,
      autoApprove: false,
      visibleToPromoters: true, // Visible to all promoters
      maxInvitesPerMonth: 2, // Influencers limited to 2 invites per month
      createdById: admin.id,
      isActive: true,
    },
  });
  console.log("✅ Created campaign:", campaign2.name, "(2 invites per month)");

  // Campaign 1: Account Manager → Influencer (Influencer 30%, Manager 10%)
  // This is hidden and linked to campaign2
  const campaign1 = await prisma.campaign.create({
    data: {
      name: "Account Manager Campaign",
      description:
        "Account Manager invites Influencer: Influencer 30%, Manager 10%",
      websiteUrl: "https://teaseme.live",
      defaultReferralUrl: "https://teaseme.live/join",
      commissionRate: 30.0,
      secondaryRate: 10.0,
      recurringRate: 30.0,
      cookieLifeDays: 90,
      autoApprove: true,
      visibleToPromoters: false, // Only visible to account managers (Jorlyn)
      maxInvitesPerMonth: null, // Unlimited invites for account managers
      linkedCampaignId: campaign2.id, // ✅ Link to visible campaign
      createdById: admin.id,
      isActive: true,
    },
  });
  console.log(
    "✅ Created campaign:",
    campaign1.name,
    "(unlimited invites, linked to:",
    campaign2.name,
    ")",
  );
  console.log("   🔗 Linked Campaign Setup:");
  console.log(
    `      "${campaign1.name}" (hidden) → links to → "${campaign2.name}" (visible)`,
  );

  // Create Account Manager - Jorlyn
  const hashedPasswordPromoter = await bcrypt.hash("promoter123", 10);
  const jorlyn = await prisma.user.upsert({
    where: { email: "jorlyn@example.com" },
    update: {},
    create: {
      email: "jorlyn@example.com",
      username: "jorlyn",
      password: hashedPasswordPromoter,
      firstName: "Jorlyn",
      lastName: "Manager",
      role: UserRole.PROMOTER,
      userType: UserType.ACCOUNT_MANAGER,
    },
  });
  console.log("✅ Created account manager:", jorlyn.email);

  // Create Influencer - Sofia
  const sofia = await prisma.user.upsert({
    where: { email: "sofia@example.com" },
    update: {},
    create: {
      email: "sofia@example.com",
      username: "sofia",
      password: hashedPasswordPromoter,
      firstName: "Sofia",
      lastName: "Martinez",
      role: UserRole.PROMOTER,
      userType: UserType.TEAM_MANAGER,
    },
  });
  console.log("✅ Created influencer:", sofia.email);

  // Create Influencer Friend - Kelly
  const kelly = await prisma.user.upsert({
    where: { email: "kelly@example.com" },
    update: {},
    create: {
      email: "kelly@example.com",
      username: "kelly",
      password: hashedPasswordPromoter,
      firstName: "Kelly",
      lastName: "Johnson",
      role: UserRole.PROMOTER,
      userType: UserType.PROMOTER,
    },
  });
  console.log("✅ Created influencer friend:", kelly.email);

  // Create Referral Hierarchy
  // First: Admin invites Jorlyn (makes Jorlyn an Account Manager)
  const referralAdminToJorlyn = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign1.id,
      referrerId: admin.id,
      referredUserId: jorlyn.id,
      status: "ACTIVE",
      level: 1,
      acceptedAt: new Date(),
    },
  });
  console.log(
    "✅ Created referral: Admin -> Jorlyn (Jorlyn becomes Account Manager)",
  );

  // Campaign 1: Jorlyn (Account Manager) invites Sofia (Influencer)
  // Jorlyn gets 10%, Sofia gets 30%
  const referralJorlynToSofia = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign1.id,
      referrerId: jorlyn.id,
      referredUserId: sofia.id,
      status: "ACTIVE",
      level: 2,
      parentReferralId: referralAdminToJorlyn.id,
      acceptedAt: new Date(),
    },
  });
  console.log(
    "✅ Created referral: Jorlyn -> Sofia (Campaign 1: Jorlyn 10%, Sofia 30%)",
  );

  // Campaign 2: Sofia invites Kelly (her friend)
  // Sofia gets 5%, Kelly gets 30%
  const referralSofiaToKelly = await prisma.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: campaign2.id,
      referrerId: sofia.id,
      referredUserId: kelly.id,
      status: "ACTIVE",
      level: 3,
      parentReferralId: referralJorlynToSofia.id,
      acceptedAt: new Date(),
    },
  });
  console.log(
    "✅ Created referral: Sofia -> Kelly (Campaign 2: Sofia 5%, Kelly 30%)",
  );

  // Create Tracking Links
  const trackingLinkJorlyn = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: jorlyn.id,
      campaignId: campaign1.id,
      clicks: 15,
    },
  });
  console.log("✅ Created tracking link for Jorlyn");

  const trackingLinkSofia = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: sofia.id,
      campaignId: campaign2.id,
      clicks: 42,
    },
  });
  console.log("✅ Created tracking link for Sofia");

  const trackingLinkKelly = await prisma.trackingLink.create({
    data: {
      shortCode: nanoid(8),
      fullUrl: `http://localhost:5000/track/${nanoid(8)}`,
      userId: kelly.id,
      campaignId: campaign2.id,
      clicks: 28,
    },
  });
  console.log("✅ Created tracking link for Kelly");

  // Create customer tracking referrals (for tracking direct customer sales)
  // These allow tracking sales by username/ref_id without a specific referred user

  // Jorlyn's customer tracking (Account Manager - uses campaign1)
  const referralJorlynCustomers = await prisma.referral.create({
    data: {
      inviteCode: `jorlyn_tracking_${nanoid(6)}`,
      campaignId: campaign1.id, // Account Manager Campaign
      referrerId: jorlyn.id,
      referredUserId: null,
      status: "ACTIVE",
      level: 2,
      parentReferralId: referralAdminToJorlyn.id,
      acceptedAt: new Date(),
    },
  });
  console.log(
    "✅ Created customer tracking for Jorlyn (Account Manager Campaign)",
  );

  // Sofia's customer tracking (Team Leader - uses campaign2, the LINKED campaign)
  const referralSofiaCustomers = await prisma.referral.create({
    data: {
      inviteCode: `sofia_tracking_${nanoid(6)}`,
      campaignId: campaign2.id, // ✅ Influencer Referral Campaign (linked from campaign1)
      referrerId: sofia.id,
      referredUserId: null,
      status: "ACTIVE",
      level: 3,
      parentReferralId: referralJorlynCustomers.id,
      acceptedAt: new Date(),
    },
  });
  console.log(
    "✅ Created customer tracking for Sofia (Influencer Referral Campaign - linked)",
  );

  // Kelly's customer tracking (Promoter - uses campaign2)
  const referralKellyCustomers = await prisma.referral.create({
    data: {
      inviteCode: `kelly_tracking_${nanoid(6)}`,
      campaignId: campaign2.id, // Influencer Referral Campaign
      referrerId: kelly.id,
      referredUserId: null,
      status: "ACTIVE",
      level: 4,
      parentReferralId: referralSofiaCustomers.id,
      acceptedAt: new Date(),
    },
  });
  console.log(
    "✅ Created customer tracking for Kelly (Influencer Referral Campaign)",
  );

  console.log("\n📝 Customer Tracking Codes (use as ref_id in API):");
  console.log(
    `   Jorlyn: ${referralJorlynCustomers.inviteCode} (30% commission, Account Manager Campaign)`,
  );
  console.log(
    `   Sofia: ${referralSofiaCustomers.inviteCode} (30% commission + 10% to Jorlyn, Influencer Campaign)`,
  );
  console.log(
    `   Kelly: ${referralKellyCustomers.inviteCode} (30% commission + 5% to Sofia, Influencer Campaign)`,
  );
  console.log("\n🔗 Referral Hierarchy:");
  console.log("   Person Invitations:");
  console.log("     • Admin -> Jorlyn (Jorlyn becomes Account Manager)");
  console.log(
    "     • Jorlyn -> Sofia (Jorlyn 10%, Sofia 30%, Sofia becomes Team Manager)",
  );
  console.log("     • Sofia -> Kelly (Sofia 5%, Kelly 30%)");
  console.log("   Customer Tracking:");
  console.log("     • Admin (root)");
  console.log("     •   └─ Jorlyn (Account Manager)");
  console.log("     •       └─ Sofia (Team Manager)");
  console.log("     •           └─ Kelly (Promoter)");

  // Create some click tracking data
  await prisma.clickTracking.createMany({
    data: [
      {
        trackingLinkId: trackingLinkJorlyn.id,
        userId: jorlyn.id,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        referrerUrl: "https://twitter.com",
      },
      {
        trackingLinkId: trackingLinkSofia.id,
        userId: sofia.id,
        ipAddress: "192.168.1.2",
        userAgent: "Mozilla/5.0",
        referrerUrl: "https://facebook.com",
      },
      {
        trackingLinkId: trackingLinkKelly.id,
        userId: kelly.id,
        ipAddress: "192.168.1.3",
        userAgent: "Chrome/90.0",
        referrerUrl: "https://instagram.com",
      },
    ],
  });
  console.log("✅ Created click tracking data");

  // Create API Key for testing
  const apiKey = await prisma.apiKey.create({
    data: {
      key: "test_api_key_123",
      token: "tk_test_456",
      accountId: "acc_test_789",
      name: "Test API Key",
      isActive: true,
      userId: admin.id,
    },
  });
  console.log("✅ Created API key for testing");

  console.log("\n🎉 Database seeding completed successfully!");
  console.log("\n📝 Login Credentials:");
  console.log("   Admin (userType: ADMIN): admin@example.com / admin123");
  console.log(
    "   Account Manager (userType: ACCOUNT_MANAGER): jorlyn@example.com / promoter123",
  );
  console.log(
    "   Team Manager (userType: TEAM_MANAGER): sofia@example.com / promoter123",
  );
  console.log(
    "   Promoter (userType: PROMOTER): kelly@example.com / promoter123",
  );
  console.log("\n🔗 Demo Data:");
  console.log(`   Campaign 1: ${campaign1.name} (Sofia 30%, Jorlyn 10%)`);
  console.log(`   Campaign 2: ${campaign2.name} (Kelly 30%, Sofia 5%)`);
  console.log("\n🔑 API Key:");
  console.log(`   Token: ${apiKey.token}`);
  console.log(`   Account ID: ${apiKey.accountId}`);
}

main()
  .catch((e) => {
    console.error("❌ Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
