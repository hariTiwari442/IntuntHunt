/**
 * BullMQ queue registry for the lead-engine pipeline.
 *
 * Three queues drive the async flow:
 *
 *   1. ORCHESTRATOR     — runs once per "Find Leads" click.
 *                         Executes Steps 1+2+3 inline (sequential, ~15s total),
 *                         inserts pre-scored leads into the DB, then enqueues
 *                         one PROCESS_LEAD job per qualified URL.
 *
 *   2. PROCESS_LEAD     — one job per URL. Runs Steps 4+5 (fetch full content
 *                         + deep score), updates the lead row, and enqueues a
 *                         REPLY_GEN job if intentScore >= 60.
 *
 *   3. REPLY_GEN        — one job per high-intent lead. Runs Step 6 and
 *                         updates the lead row with the suggested reply.
 *
 *   + DLQ               — dead-letter queue for jobs that exhausted retries.
 */

import { Queue } from "bullmq";
import { bullmqRedis } from "../cache/redis.client.js";

const connection = bullmqRedis;

export const QueueNames = {
  ORCHESTRATOR: "lead-engine-orchestrator",
  PROCESS_LEAD: "lead-engine-process-lead",
  REPLY_GEN:    "lead-engine-reply-gen",
  DLQ:          "lead-engine-dlq",
} as const;

// ── Default job options ─────────────────────────────────────────────────────

const orchestratorOptions = {
  attempts: 2,
  backoff:  { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 100 },
  removeOnFail:     { age: 7 * 24 * 3600 },
};

const processLeadOptions = {
  attempts: 3,
  backoff:  { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail:     { age: 7 * 24 * 3600 },
};

const replyGenOptions = {
  attempts: 2,
  backoff:  { type: "exponential" as const, delay: 3_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail:     { age: 7 * 24 * 3600 },
};

// ── Queues ──────────────────────────────────────────────────────────────────

export const orchestratorQueue = new Queue(QueueNames.ORCHESTRATOR, {
  connection,
  defaultJobOptions: orchestratorOptions,
});

export const processLeadQueue = new Queue(QueueNames.PROCESS_LEAD, {
  connection,
  defaultJobOptions: processLeadOptions,
});

export const replyGenQueue = new Queue(QueueNames.REPLY_GEN, {
  connection,
  defaultJobOptions: replyGenOptions,
});

export const dlqQueue = new Queue(QueueNames.DLQ, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false },
});

// ── Job payload shapes ──────────────────────────────────────────────────────

export interface OrchestratorPayload {
  searchRunId: string;
  productId:   string;
  userId:      string;
}

export interface ProcessLeadPayload {
  searchRunId: string;
  productId:   string;
  leadId:      string;     // DB row already inserted in pre-scored state
  intelligenceJson: string; // serialized intelligence (small) so worker doesn't re-query DB
}

export interface ReplyGenPayload {
  leadId:      string;
  intelligenceJson: string;
  productUrl?: string;
}
