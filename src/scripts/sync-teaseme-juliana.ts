import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { syncUserFromTeaseMe } from '../services/teaseme.service';

const prisma = new PrismaClient();

async function main() {
  const username = 'juliana';

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, email: true },
  });

  if (!user) {
    console.error(`[sync:juliana] No user found with username="${username}". Aborting.`);
    process.exit(1);
  }

  console.log(`[sync:juliana] Syncing user ${user.email} (${user.id}) from TeaseMe…`);

  const synced = await syncUserFromTeaseMe(user.id);

  console.log('[sync:juliana] Done.');
  console.log('  voiceId:', synced.voiceId ?? '(none)');
  console.log('  profilePhotoKey:', synced.profilePhotoKey ?? '(none)');
  console.log('  profileVideoKey:', synced.profileVideoKey ?? '(none)');
  console.log('  teasemeSyncedAt:', synced.teasemeSyncedAt?.toISOString() ?? '(none)');
  console.log('  socialLinks:');
  for (const link of synced.socialLinks) {
    console.log(`    - ${link.platform}: ${link.url}`);
  }
}

main()
  .catch((err) => {
    console.error('[sync:juliana] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
