import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const requested = (arg('usernames') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
const confirmed = process.argv.includes('--confirm');

if (requested.length === 0 || requested.some((name) => !/^[a-zA-Z0-9_.-]{3,32}$/.test(name))) {
  console.error('Usage: node --env-file=.env scripts/cleanup-test-users.mjs --usernames=test_one,test_two [--confirm]');
  process.exitCode = 2;
} else {
  try {
    const users = await prisma.user.findMany({
      where: { username: { in: [...new Set(requested)] } },
      select: {
        id: true,
        username: true,
        publicId: true,
        _count: { select: { memberships: true, messages: true, callsInitiated: true, refreshTokens: true } },
      },
      orderBy: { username: 'asc' },
    });

    const found = new Set(users.map((user) => user.username));
    const missing = [...new Set(requested)].filter((username) => !found.has(username));
    if (missing.length) {
      throw new Error(`No matching account(s): ${missing.join(', ')}. No data was changed.`);
    }

    console.log(confirmed ? 'CONFIRMED CLEANUP TARGETS' : 'DRY RUN — no data will be changed');
    for (const user of users) {
      console.log(`${user.username} (${user.publicId}) · conversations=${user._count.memberships} messages=${user._count.messages} calls=${user._count.callsInitiated} refreshTokens=${user._count.refreshTokens}`);
    }

    if (!confirmed) {
      console.log('Review these exact accounts, take a database backup, then rerun with --confirm to delete only these usernames.');
    } else {
      const ids = users.map((user) => user.id);
      await prisma.$transaction(async (tx) => {
        const direct = await tx.conversation.findMany({
          where: { type: 'direct', members: { some: { userId: { in: ids } } } },
          select: { id: true },
        });
        const directIds = direct.map((conversation) => conversation.id);
        if (directIds.length) {
          await tx.conversation.deleteMany({ where: { id: { in: directIds } } });
        }

        // Preserve groups used by non-target accounts while removing the
        // selected accounts' stale messages, calls, and memberships.
        await tx.message.deleteMany({ where: { senderId: { in: ids } } });
        await tx.call.deleteMany({ where: { initiatorId: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      });
      console.log(`Removed ${users.length} explicitly selected test/demo account(s) and dependent data in one transaction.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cleanup failed. No changes were committed.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
