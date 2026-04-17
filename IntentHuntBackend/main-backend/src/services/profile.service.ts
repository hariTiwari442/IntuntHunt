import { prisma } from '../db/prisma.client.js';
import { NotFoundError } from '../utils/errors.js';

export interface UpdateProfileInput {
  name?: string | undefined;
  avatarUrl?: string | undefined;
}

export async function getProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });

  if (!profile) {
    throw new NotFoundError('Profile', userId);
  }

  return {
    id:        profile.id,
    email:     profile.email,
    name:      profile.name,
    avatarUrl: profile.avatarUrl,
    plan:      profile.plan,
    createdAt: profile.createdAt,
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });

  if (!profile) {
    throw new NotFoundError('Profile', userId);
  }

  const updated = await prisma.profile.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
    },
  });

  return {
    id:        updated.id,
    email:     updated.email,
    name:      updated.name,
    avatarUrl: updated.avatarUrl,
    plan:      updated.plan,
    createdAt: updated.createdAt,
  };
}

export async function getProfileStats(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });

  if (!profile) {
    throw new NotFoundError('Profile', userId);
  }

  const jobCount = await prisma.crawlJob.count({ where: { userId } });

  return {
    totalJobs: jobCount,
    plan:      profile.plan,
    memberSince: profile.createdAt,
  };
}
