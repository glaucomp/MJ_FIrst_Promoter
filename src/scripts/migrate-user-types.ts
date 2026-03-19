import { PrismaClient } from '@prisma/client';
import { syncUserType } from '../services/user.service';

const prisma = new PrismaClient();

/**
 * Migration script to update userType field for all existing users
 * based on their relationships and role
 */
async function migrateUserTypes() {
  console.log('🔄 Starting userType migration...\n');

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true
      }
    });

    console.log(`Found ${users.length} users to process\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const oldType = user.userType;
        await syncUserType(user.id);
        
        // Get the updated user to show the change
        const updatedUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { userType: true }
        });

        if (updatedUser && updatedUser.userType !== oldType) {
          console.log(`✅ Updated: ${user.email} (${user.firstName} ${user.lastName})`);
          console.log(`   ${oldType} → ${updatedUser.userType}\n`);
          updated++;
        } else {
          console.log(`⏭️  Skipped: ${user.email} (already ${oldType})`);
          skipped++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${user.email}:`, error);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total users: ${users.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log('\n✅ Migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateUserTypes()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
