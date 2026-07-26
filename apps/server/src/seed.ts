/**
 * Bootstrap seed — creates the first admin account and a batch of invite codes.
 * Registration is invite-only, so without this nobody can get in.
 *
 * Run once inside the API container:
 *   docker compose exec unknown-api node dist/seed.js
 *
 * Credentials come from the environment so they never live in the repo:
 *   SEED_ADMIN_USERNAME  (default: admin)
 *   SEED_ADMIN_PASSWORD  (required)
 *   SEED_ADMIN_NAME      (default: Admin)
 *   SEED_INVITE_COUNT    (default: 10)
 *
 * Safe to re-run: an existing admin is left untouched, only new codes are minted.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 4) out += '-';
  }
  return out;
}

async function main(): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  const displayName = process.env.SEED_ADMIN_NAME ?? 'Admin';
  const inviteCount = parseInt(process.env.SEED_INVITE_COUNT ?? '10', 10);

  if (!password) {
    console.error('SEED_ADMIN_PASSWORD is required. Aborting.');
    process.exit(1);
  }

  let admin = await prisma.user.findUnique({ where: { username } });
  if (admin) {
    console.log(`Admin "${username}" already exists — leaving it alone.`);
  } else {
    admin = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        isAdmin: true,
      },
    });
    console.log(`Created admin: ${username}`);
  }

  const codes: string[] = [];
  for (let i = 0; i < inviteCount; i++) {
    const code = generateCode();
    await prisma.inviteCode.create({ data: { code, createdById: admin.id } });
    codes.push(code);
  }

  console.log(`\n${inviteCount} invite codes (one signup each):`);
  codes.forEach((c) => console.log(`  ${c}`));
  console.log('\nHand these out. Each one lets exactly one person register.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
