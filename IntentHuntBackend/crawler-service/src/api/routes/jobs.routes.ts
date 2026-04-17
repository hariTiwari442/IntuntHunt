import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { jobRepository } from "../../db/repositories/job.repository.js";
import { taskRepository } from "../../db/repositories/task.repository.js";
import { postRepository } from "../../db/repositories/post.repository.js";
import { orchestrateQueue } from "../../queues/queue.registry.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../../utils/errors.js";
import type {
  CreateJobRequest,
  CreateJobResponse,
  JobDetailResponse,
  ListJobsResponse,
  CancelJobResponse,
} from "../../types/api.types.js";
import type { JobCreatedPayload } from "../../types/job.types.js";

const CreateJobSchema = z.object({
  queries: z.object({
    redditGlobal: z.array(z.string().min(1).max(100).trim()).default([]), // global Reddit search
    redditSubreddit: z.array(z.string().min(1).max(100).trim()).default([]), // subreddit-scoped search
    hackernews: z.array(z.string().min(1).max(100).trim()).default([]),
    linkedin: z.array(z.string().min(1).max(100).trim()).default([]),
  }),
  subreddits: z
    .array(z.string().regex(/^[A-Za-z0-9_]+$/))
    .max(20)
    .default([]),
});

const ListJobsQuerySchema = z.object({
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  // ---- POST /api/v1/jobs ----
  app.post<{ Body: CreateJobRequest }>("/", async (request, reply) => {
    const body = CreateJobSchema.parse(request.body);
    const userId = request.userId;

    const allKeywords = [
      ...new Set([
        ...body.queries.redditGlobal,
        ...body.queries.redditSubreddit,
        ...body.queries.hackernews,
        ...body.queries.linkedin,
      ]),
    ];

    const sources: ("reddit" | "hackernews" | "linkedin")[] = [];
    if (
      body.queries.redditGlobal.length > 0 ||
      body.queries.redditSubreddit.length > 0
    ) {
      sources.push("reddit");
    }
    if (body.queries.hackernews.length > 0) sources.push("hackernews");
    if (body.queries.linkedin.length > 0) sources.push("linkedin");

    const job = await jobRepository.create({
      userId,
      keywords: allKeywords,
      sources,
    });

    await orchestrateQueue.add("orchestrate", {
      crawlJobId: job.id,
      userId,
      redditGlobal: body.queries.redditGlobal,
      redditSubreddit: body.queries.redditSubreddit,
      hackernews: body.queries.hackernews,
      linkedin: body.queries.linkedin,
      subreddits: body.subreddits,
    } satisfies JobCreatedPayload);

    // Calculate task count:
    // global = 1 hit per keyword
    // subreddit = keywords × subreddits
    // hn = 1 hit per keyword (free)
    // linkedin = 1 Apify run per keyword
    const globalCount = body.queries.redditGlobal.length;
    const subCount =
      body.queries.redditSubreddit.length * (body.subreddits.length || 1);
    const hnCount = body.queries.hackernews.length;
    const linkedinCount = body.queries.linkedin.length;

    const response: CreateJobResponse = {
      jobId: job.id,
      status: "pending",
      taskCount: globalCount + subCount + hnCount + linkedinCount,
      createdAt: job.createdAt.toISOString(),
    };

    reply.status(202).send(response);
  });

  // ---- GET /api/v1/jobs ----
  app.get("/", async (request, reply) => {
    const query = ListJobsQuerySchema.parse(request.query);
    const { jobs, total, page, limit } = await jobRepository.findMany({
      userId: request.userId,
      page: query.page,
      limit: query.limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
    });

    const response: ListJobsResponse = {
      jobs: jobs.map((j: (typeof jobs)[number]) => ({
        jobId: j.id,
        keywords: j.keywords,
        sources: j.sources as any,
        status: j.status as any,
        createdAt: j.createdAt.toISOString(),
        resultCount: (j as any)._count?.posts ?? 0,
        taskCount: (j as any)._count?.tasks ?? 0,
      })),
      total,
      page,
      limit,
    };

    reply.send(response);
  });

  // ---- GET /api/v1/jobs/:jobId ----
  app.get<{ Params: { jobId: string } }>("/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const job = await jobRepository.findById(jobId);

    if (!job) throw new NotFoundError("CrawlJob", jobId);
    if (job.userId !== request.userId) throw new ForbiddenError();

    const [progress, resultCount] = await Promise.all([
      taskRepository.getProgress(jobId),
      postRepository.countByJob(jobId),
    ]);

    const response: JobDetailResponse = {
      jobId: job.id,
      userId: job.userId,
      keywords: job.keywords,
      sources: job.sources as any,
      status: job.status as any,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage ?? null,
      metadata: job.metadata as Record<string, unknown>,
      progress,
      resultCount,
    };

    reply.send(response);
  });

  // ---- DELETE /api/v1/jobs/:jobId ----
  app.delete<{ Params: { jobId: string } }>(
    "/:jobId",
    async (request, reply) => {
      const { jobId } = request.params;
      const job = await jobRepository.findById(jobId);

      if (!job) throw new NotFoundError("CrawlJob", jobId);
      if (job.userId !== request.userId) throw new ForbiddenError();
      if (job.status === "completed" || job.status === "cancelled") {
        throw new ConflictError(
          `Job is already ${job.status} and cannot be cancelled`,
        );
      }

      await jobRepository.updateStatus(jobId, "cancelled", {
        completedAt: new Date(),
      });

      const response: CancelJobResponse = { jobId, status: "cancelled" };
      reply.send(response);
    },
  );
}
