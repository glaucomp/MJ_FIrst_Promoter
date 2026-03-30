import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

async function createApiKey() {
  try {
    // Find admin user
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!admin) {
      console.error('❌ No admin user found. Please run seed first.');
      return;
    }

    // Generate API credentials
    const apiKey = `fp_key_${nanoid(32)}`;
    const bearerToken = `fp_token_${nanoid(48)}`;
    const accountId = `acc_${nanoid(16)}`;

    // Create API Key
    const key = await prisma.apiKey.create({
      data: {
        name: 'TeaseMe Production',
        key: apiKey,
        token: bearerToken,
        accountId,
        userId: admin.id
      }
    });

    console.log('\n✅ API Key created successfully!\n');
    console.log('='.repeat(80));
    console.log('\n📋 API CREDENTIALS:\n');
    console.log(`Name:        ${key.name}`);
    console.log(`API Key:     ${key.key}`);
    console.log(`Bearer Token: ${key.token}`);
    console.log(`Account ID:  ${key.accountId}`);
    console.log('\n='.repeat(80));
    console.log('\n📝 Usage Examples:\n');
    console.log('1️⃣  V1 API (X-API-KEY header):');
    console.log(`   curl -X POST http://localhost:5000/api/v1/promoters/create \\`);
    console.log(`     -H "X-API-KEY: ${key.key}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"email":"newpromoter@test.com","first_name":"John","last_name":"Doe"}'\n`);
    console.log('2️⃣  V2 API (Bearer token + Account-ID):');
    console.log(`   curl -X POST http://localhost:5000/api/v2/track/sale \\`);
    console.log(`     -H "Authorization: Bearer ${key.token}" \\`);
    console.log(`     -H "Account-ID: ${key.accountId}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"email":"customer@test.com","amount":5000,"event_id":"tx_123","ref_id":"YOUR_REF_CODE"}'\n`);
    console.log('='.repeat(80));
    console.log('\n💡 Save these credentials securely!\n');
  } catch (error) {
    console.error('Error creating API key:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createApiKey();
