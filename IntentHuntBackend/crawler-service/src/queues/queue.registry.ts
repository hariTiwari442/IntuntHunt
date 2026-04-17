import { Queue } from 'bullmq';
import { bullmqRedis } from '../cache/redis.client.js';
import { QueueName } from '../types/job.types.js';
import { defaultJobOptions } from './queue.config.js';

const connection = bullmqRedis;

export const orchestrateQueue = new Queue(QueueName.ORCHESTRATE, {
  connection,
  defaultJobOptions,
});

export const redditQueue = new Queue(QueueName.REDDIT, {
  connection,
  defaultJobOptions,
});

export const hnQueue = new Queue(QueueName.HN, {
  connection,
  defaultJobOptions,
});

export const linkedinQueue = new Queue(QueueName.LINKEDIN, {
  connection,
  defaultJobOptions,
});

export const postProcessQueue = new Queue(QueueName.POST_PROCESS, {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
});

export const dlqQueue = new Queue(QueueName.DLQ, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false },
});

export function getQueueBySource(source: 'reddit' | 'hackernews' | 'linkedin'): Queue {
  if (source === 'reddit')   return redditQueue;
  if (source === 'linkedin') return linkedinQueue;
  return hnQueue;
}
