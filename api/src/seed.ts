/**
 * Demo seed — idempotent. Creates dummy accounts + a live-looking conversation
 * so the client can log in and see a populated app.
 *
 * Runs with production deps only (no ts-node needed):
 *   docker compose -p unknown exec unknown_api node dist/seed.js
 *
 * Demo logins (username / password):
 *   demo  / Demo@1234     (free)
 *   alice / Alice@1234    (subscriber — has 2 numbers + custom display number)
 *   bob   / Bob@1234      (free)
 * You can also log in with the sequence number instead of the username.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

interface SeedUser {
  username: string;
  password: string;
  sequenceNo: string;
  tier: 'free' | 'subscriber';
  numbers: { value: string; label: string; isDefault: boolean }[];
}

const USERS: SeedUser[] = [
  {
    username: 'demo',
    password: 'Demo@1234',
    sequenceNo: '100100',
    tier: 'free',
    numbers: [{ value: '0700 100 1001', label: 'Primary', isDefault: true }],
  },
  {
    username: 'alice',
    password: 'Alice@1234',
    sequenceNo: '200200',
    tier: 'subscriber',
    numbers: [
      { value: '0700 200 2002', label: 'Personal', isDefault: true },
      { value: '0333 888 9999', label: 'Business', isDefault: false },
    ],
  },
  {
    username: 'bob',
    password: 'Bob@1234',
    sequenceNo: '300300',
    tier: 'free',
    numbers: [{ value: '0700 300 3003', label: 'Primary', isDefault: true }],
  },
];

async function upsertUser(u: SeedUser) {
  const passwordHash = await argon2.hash(u.password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { username: u.username },
    update: {
      passwordHash,
      sequenceNo: u.sequenceNo,
      subscriptionTier: u.tier,
      subscriptionExpiresAt:
        u.tier === 'subscriber' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
    },
    create: {
      username: u.username,
      passwordHash,
      sequenceNo: u.sequenceNo,
      subscriptionTier: u.tier,
      subscriptionExpiresAt:
        u.tier === 'subscriber' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
    },
  });

  // Reset numbers to the desired set (idempotent).
  await prisma.number.deleteMany({ where: { userId: user.id } });
  for (const n of u.numbers) {
    await prisma.number.create({
      data: {
        userId: user.id,
        value: n.value,
        label: n.label,
        isDefaultDisplay: n.isDefault,
      },
    });
  }
  return user;
}

async function ensureConversation(aId: string, bId: string) {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'direct',
      AND: [{ members: { some: { userId: aId } } }, { members: { some: { userId: bId } } }],
    },
    include: { members: true },
  });
  if (existing && existing.members.length === 2) return existing;
  return prisma.conversation.create({
    data: { type: 'direct', members: { create: [{ userId: aId }, { userId: bId }] } },
  });
}

async function main() {
  console.log('Seeding demo data…');
  const [demo, alice, bob] = await Promise.all(USERS.map(upsertUser));

  // A populated thread between alice and bob.
  const conv = await ensureConversation(alice.id, bob.id);
  const count = await prisma.message.count({ where: { conversationId: conv.id } });
  if (count === 0) {
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderUserId: alice.id,
        senderDisplayNumber: '0333 888 9999', // alice's custom "Business" display number
        body: 'Hey Bob! Testing the new Unknown app 👋',
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderUserId: bob.id,
        senderDisplayNumber: '0700 300 3003',
        body: 'Looks great — the call and chat both work!',
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderUserId: alice.id,
        senderDisplayNumber: '0333 888 9999',
        body: 'And I can pick which number you see me as. Premium 💰',
      },
    });
    // Give bob an unread.
    await prisma.conversationMember.updateMany({
      where: { conversationId: conv.id, userId: bob.id },
      data: { unreadCount: 1 },
    });
  }

  // A thread between demo and alice so the demo account isn't empty.
  const conv2 = await ensureConversation(demo.id, alice.id);
  const count2 = await prisma.message.count({ where: { conversationId: conv2.id } });
  if (count2 === 0) {
    await prisma.message.create({
      data: {
        conversationId: conv2.id,
        senderUserId: alice.id,
        senderDisplayNumber: '0700 200 2002',
        body: 'Welcome to Unknown! Tap to reply 🚀',
      },
    });
    await prisma.conversationMember.updateMany({
      where: { conversationId: conv2.id, userId: demo.id },
      data: { unreadCount: 1 },
    });
  }

  console.log('✅ Seed complete.');
  console.log('   demo  / Demo@1234');
  console.log('   alice / Alice@1234  (subscriber)');
  console.log('   bob   / Bob@1234');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
