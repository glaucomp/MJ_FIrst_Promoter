import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  console.log('🌱 Seeding transactions and commissions...');

  // Load existing referrals
  const jor2sofia = await prisma.referral.findFirst({
    where: { inviteCode: 'JOR2SOFIA001' },
    include: { campaign: true, parentReferral: true },
  });
  const sof2kelly = await prisma.referral.findFirst({
    where: { inviteCode: 'SOF2KELLY001' },
    include: { campaign: true, parentReferral: { include: { referrer: true } } },
  });

  if (!jor2sofia) throw new Error('Referral JOR2SOFIA001 not found — run npm run seed first');
  if (!sof2kelly) throw new Error('Referral SOF2KELLY001 not found — run npm run seed first');

  const kellyUser  = await prisma.user.findUnique({ where: { email: 'kelly@example.com' } });
  const sofiaUser  = await prisma.user.findUnique({ where: { email: 'sofia@example.com' } });
  const jorlynUser = await prisma.user.findUnique({ where: { email: 'jorlyn@example.com' } });
  const nandoUser  = await prisma.user.findUnique({ where: { email: 'nando@example.com' } });

  if (!kellyUser || !sofiaUser || !jorlynUser) {
    throw new Error('One or more users not found — run npm run seed first');
  }

  const kellyGroup = await prisma.chatterGroup.findFirst({
    where: { promoter: { email: 'kelly@example.com' } },
    include: { members: true },
  });

  // ── Sofia's Sales (Sofia 30%, Jorlyn 10%) ──────────────────────────────────

  const sofiaSales = [
    { amount: 49, eventId: 'seed_sof_001', daysBack: 45, status: 'paid' },
    { amount: 99, eventId: 'seed_sof_002', daysBack: 30, status: 'paid' },
    { amount: 29, eventId: 'seed_sof_003', daysBack: 18, status: 'paid' },
    { amount: 49, eventId: 'seed_sof_004', daysBack: 7,  status: 'unpaid' },
  ];

  for (const sale of sofiaSales) {
    // Skip if already seeded
    const existing = await prisma.transaction.findFirst({ where: { eventId: sale.eventId } });
    if (existing) { console.log(`⏭️  Skipping ${sale.eventId} (already exists)`); continue; }

    const createdAt = daysAgo(sale.daysBack);

    const customer = await prisma.customer.create({
      data: {
        email: `customer_sof_${sale.eventId}@example.com`,
        name: 'Sofia Customer',
        revenue: sale.amount,
        status: 'active',
        subscriptionType: 'premium',
        campaignId: jor2sofia.campaignId,
        referralId: jor2sofia.id,
        metadata: sale.eventId,
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        eventId: sale.eventId,
        type: 'sale',
        saleAmount: sale.amount,
        status: 'completed',
        customerId: customer.id,
        campaignId: jor2sofia.campaignId,
        referralId: jor2sofia.id,
        createdAt,
      },
    });

    // Sofia earns 30%
    await prisma.commission.create({
      data: {
        amount: (sale.amount * 30) / 100,
        percentage: 30,
        saleAmount: sale.amount,
        status: sale.status,
        type: 'promoter',
        description: `Direct sale ($${sale.amount})`,
        userId: sofiaUser.id,
        campaignId: jor2sofia.campaignId,
        referralId: jor2sofia.id,
        customerId: customer.id,
        transactionId: transaction.id,
        createdAt,
      },
    });

    // Jorlyn earns 10% (T2)
    await prisma.commission.create({
      data: {
        amount: (sale.amount * 10) / 100,
        percentage: 10,
        saleAmount: sale.amount,
        status: sale.status,
        type: 'promoter',
        description: `T2 from Sofia's sale ($${sale.amount})`,
        userId: jorlynUser.id,
        campaignId: jor2sofia.campaignId,
        referralId: jor2sofia.id,
        customerId: customer.id,
        transactionId: transaction.id,
        createdAt,
      },
    });

    console.log(`✅ Sofia sale $${sale.amount} → Sofia $${(sale.amount * 30) / 100}, Jorlyn $${(sale.amount * 10) / 100}`);
  }

  // ── Kelly's Sales (Kelly 30%, Sofia 5%, Nando chatter %) ──────────────────

  const kellySales = [
    { amount: 29, eventId: 'seed_kel_001', daysBack: 40, status: 'paid' },
    { amount: 49, eventId: 'seed_kel_002', daysBack: 25, status: 'paid' },
    { amount: 99, eventId: 'seed_kel_003', daysBack: 14, status: 'paid' },
    { amount: 29, eventId: 'seed_kel_004', daysBack: 3,  status: 'unpaid' },
  ];

  for (const sale of kellySales) {
    const existing = await prisma.transaction.findFirst({ where: { eventId: sale.eventId } });
    if (existing) { console.log(`⏭️  Skipping ${sale.eventId} (already exists)`); continue; }

    const createdAt = daysAgo(sale.daysBack);

    const customer = await prisma.customer.create({
      data: {
        email: `customer_kel_${sale.eventId}@example.com`,
        name: 'Kelly Customer',
        revenue: sale.amount,
        status: 'active',
        subscriptionType: 'premium',
        campaignId: sof2kelly.campaignId,
        referralId: sof2kelly.id,
        metadata: sale.eventId,
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        eventId: sale.eventId,
        type: 'sale',
        saleAmount: sale.amount,
        status: 'completed',
        customerId: customer.id,
        campaignId: sof2kelly.campaignId,
        referralId: sof2kelly.id,
        createdAt,
      },
    });

    // Kelly earns 30%
    await prisma.commission.create({
      data: {
        amount: (sale.amount * 30) / 100,
        percentage: 30,
        saleAmount: sale.amount,
        status: sale.status,
        type: 'promoter',
        description: `Direct sale ($${sale.amount})`,
        userId: kellyUser.id,
        campaignId: sof2kelly.campaignId,
        referralId: sof2kelly.id,
        customerId: customer.id,
        transactionId: transaction.id,
        createdAt,
      },
    });

    // Sofia earns 5% (T2)
    await prisma.commission.create({
      data: {
        amount: (sale.amount * 5) / 100,
        percentage: 5,
        saleAmount: sale.amount,
        status: sale.status,
        type: 'promoter',
        description: `T2 from Kelly's sale ($${sale.amount})`,
        userId: sofiaUser.id,
        campaignId: sof2kelly.campaignId,
        referralId: sof2kelly.id,
        customerId: customer.id,
        transactionId: transaction.id,
        createdAt,
      },
    });

    // Chatter group members earn chatter commission
    if (kellyGroup && kellyGroup.members.length > 0) {
      const memberCount = kellyGroup.members.length;
      const perChatter = (sale.amount * kellyGroup.commissionPercentage) / 100 / memberCount;

      for (const member of kellyGroup.members) {
        await prisma.commission.create({
          data: {
            amount: perChatter,
            percentage: kellyGroup.commissionPercentage / memberCount,
            saleAmount: sale.amount,
            status: sale.status,
            type: 'chatter',
            description: `Chatter commission from Kelly's sale ($${sale.amount})`,
            userId: member.chatterId,
            campaignId: sof2kelly.campaignId,
            referralId: sof2kelly.id,
            customerId: customer.id,
            transactionId: transaction.id,
            createdAt,
          },
        });
      }

      console.log(`✅ Kelly sale $${sale.amount} → Kelly $${(sale.amount * 30) / 100}, Sofia $${(sale.amount * 5) / 100}, ${memberCount} chatter${memberCount === 1 ? '' : 's'} $${perChatter.toFixed(2)} each`);
    } else {
      console.log(`✅ Kelly sale $${sale.amount} → Kelly $${(sale.amount * 30) / 100}, Sofia $${(sale.amount * 5) / 100}`);
    }
  }

  console.log('\n🎉 Transaction seed completed!');
  console.log('   Sofia sales: 4 transactions ($49, $99, $29, $49)');
  console.log('   Kelly sales: 4 transactions ($29, $49, $99, $29)');
}

main()
  .catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
