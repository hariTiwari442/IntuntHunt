/**
 * SearchRun repository — one row per "Find Leads" click.
 * Tracks pipeline progress so the frontend can show "X of Y processed".
 */

import { prisma } from "../prisma.client.js";
import type { SearchRunStatus } from "@prisma/client";

export const searchRunRepository = {
  async create(data: { productId: string; userId: string }) {
    // Starts "pending" — the orchestrator poller flips it to "running" once
    // it actually claims the row (see orchestrator.worker.ts). Previously
    // this went straight to "running" because a BullMQ job was enqueued in
    // the same request; now there's nothing to enqueue, so "pending" is the
    // only honest status until a poll tick picks it up (usually <3s later).
    return prisma.searchRun.create({
      data: {
        productId: data.productId,
        userId:    data.userId,
        status:    "pending",
      },
    });
  },

  async findById(id: string) {
    return prisma.searchRun.findUnique({ where: { id } });
  },

  /** Apply incremental updates from the pipeline (Step 1-3 counts, errors, etc.). */
  async update(id: string, patch: {
    status?:         SearchRunStatus;
    queriesUsed?:    number;
    urlsFound?:      number;
    urlsPreScored?:  number;
    totalUrls?:      number;
    processedUrls?:  number;
    leadsScored?:    number;
    leadsReplied?:   number;
    costCents?:      number;
    errorMessage?:   string | null;
    completedAt?:    Date | null;
  }) {
    return prisma.searchRun.update({
      where: { id },
      data:  patch,
    });
  },

  /** Atomic increment for counters that workers update concurrently. */
  async incrementProcessed(id: string): Promise<{ processedUrls: number; totalUrls: number | null }> {
    const updated = await prisma.searchRun.update({
      where: { id },
      data:  { processedUrls: { increment: 1 } },
      select: { processedUrls: true, totalUrls: true },
    });
    return updated;
  },

  async incrementReplied(id: string): Promise<void> {
    await prisma.searchRun.update({
      where: { id },
      data:  { leadsReplied: { increment: 1 } },
    });
  },

  async markCompleted(id: string): Promise<void> {
    await prisma.searchRun.update({
      where: { id },
      data:  { status: "completed", completedAt: new Date() },
    });
  },

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await prisma.searchRun.update({
      where: { id },
      data:  { status: "failed", errorMessage, completedAt: new Date() },
    });
  },
};
