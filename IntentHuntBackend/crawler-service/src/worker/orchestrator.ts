import { Worker } from "bullmq";
import { bullmqRedis } from "../cache/redis.client.js";
import { jobRepository } from "../db/repositories/job.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { getQueueBySource } from "../queues/queue.registry.js";
import { defaultJobOptions } from "../queues/queue.config.js";
import {
  QueueName,
  type CrawlTaskPayload,
  type JobCreatedPayload,
  type SourceType,
} from "../types/job.types.js";
import { logger } from "../utils/logger.js";

export function startOrchestratorWorker(): Worker {
  const worker = new Worker<JobCreatedPayload>(
    QueueName.ORCHESTRATE,
    async (job) => {
      const { crawlJobId, userId, redditGlobal, redditSubreddit, hackernews, linkedin = [], subreddits } = job.data;
      const log = logger.child({ crawlJobId });

      log.info({ redditGlobal, redditSubreddit, hackernews, linkedin, subreddits }, "Orchestrating crawl job");

      await jobRepository.updateStatus(crawlJobId, "running", {
        startedAt: new Date(),
      });

      type TaskDef = {
        jobId:     string;
        source:    SourceType;
        keyword:   string;
        subreddit: string | null;
      };

      const taskDefs: TaskDef[] = [];

      // Reddit global search — 1 API hit per keyword, no subreddit
      for (const keyword of redditGlobal) {
        taskDefs.push({ jobId: crawlJobId, source: "reddit", keyword, subreddit: null });
      }

      // Reddit subreddit search — 1 API hit per keyword×subreddit combo
      for (const keyword of redditSubreddit) {
        for (const subreddit of subreddits) {
          taskDefs.push({ jobId: crawlJobId, source: "reddit", keyword, subreddit });
        }
      }

      // HN — 1 free API hit per keyword
      for (const keyword of hackernews) {
        taskDefs.push({ jobId: crawlJobId, source: "hackernews", keyword, subreddit: null });
      }

      // LinkedIn — 1 Apify actor run per keyword
      for (const keyword of linkedin) {
        taskDefs.push({ jobId: crawlJobId, source: "linkedin", keyword, subreddit: null });
      }

      const createdTasks = await taskRepository.createMany(
        taskDefs.map(({ subreddit: _s, ...rest }) => rest),
      );

      await Promise.all(
        createdTasks.map((task: (typeof createdTasks)[number], i: number) => {
          const queue = getQueueBySource(task.source as "reddit" | "hackernews" | "linkedin");
          const payload: CrawlTaskPayload = {
            crawlJobId,
            crawlTaskId: task.id,
            userId,
            keyword:   task.keyword,
            source:    task.source as "reddit" | "hackernews" | "linkedin",
            subreddit: taskDefs[i]!.subreddit,
            attempt:   0,
          };
          return queue.add(`${task.source}:${task.keyword}`, payload, defaultJobOptions);
        }),
      );

      log.info({ taskCount: createdTasks.length }, "Job orchestrated");
    },
    { connection: bullmqRedis, concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { err, crawlJobId: job?.data?.crawlJobId },
      "Orchestrator failed",
    );
  });

  return worker;
}
