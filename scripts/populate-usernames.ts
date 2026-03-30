import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function populateUsernames() {
  console.log('📝 Populating usernames for users without one...\n');

  // Get all users without username
  const usersWithoutUsername = await prisma.user.findMany({
    where: {
      username: null
    }
  });

  console.log(`Found ${usersWithoutUsername.length} users without username\n`);

  for (const user of usersWithoutUsername) {
    // Generate username from email (part before @)
    const emailUsername = user.email.split('@')[0].toLowerCase();
    
    // Check if this username already exists
    let username = emailUsername;
    let counter = 1;
    
    while (true) {
      const existing = await prisma.user.findUnique({
        where: { username }
      });
      
      if (!existing) break;
      
      // If exists, try with a number suffix
      username = `${emailUsername}${counter}`;
      counter++;
    }

    // Update user with new username
    await prisma.user.update({
      where: { id: user.id },
      data: { username }
    });

    console.log(`✅ ${user.email} -> username: ${username}`);
  }

  console.log('\n✨ Done! All users now have usernames.');
}

populateUsernames()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
