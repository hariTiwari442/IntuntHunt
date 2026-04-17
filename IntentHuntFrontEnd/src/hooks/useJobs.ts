"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Types matching real API responses ──

export interface CrawlJobQueries {
  redditGlobal?: string[];
  redditSubreddit?: string[];
  hackernews?: string[];
  linkedin?: string[];
}

export interface CreateJobPayload {
  queries: CrawlJobQueries;
  subreddits?: string[];
  productId?: string;
}

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  jobId: string;
  productId?: string;
  keywords: string[];
  sources: ("reddit" | "hackernews" | "linkedin")[];
  status: JobStatus;
  createdAt: string;
  resultCount: number;
  taskCount: number;
}

export interface JobsQueryParams {
  status?: JobStatus;
  page?: number;
  limit?: number;
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

export interface Post {
  id: string;
  jobId: string;
  source: "reddit" | "hackernews" | "linkedin";
  keyword: string;
  title: string;
  content: string;
  author: string;
  url: string;
  score: number;
  commentCount: number;
  subreddit?: string;
  postedAt: string;
  fetchedAt: string;
  intentScore: number;
  suggestedReply?: string;
  strategy?: string;
}

export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
}

export interface PostsQueryParams {
  source?: "reddit" | "hackernews" | "linkedin";
  minIntentScore?: number;
  keyword?: string;
  page?: number;
  limit?: number;
  sortBy?: "intent_score" | "posted_at" | "score";
  sortDir?: "asc" | "desc";
}

// ── Helper ──

export function getIntentScore(post: Post): number {
  return typeof post.intentScore === "number" ? post.intentScore : parseFloat(String(post.intentScore)) || 0;
}

// ── Hooks ──

export function useJobs(params: JobsQueryParams = {}) {
  return useQuery<JobsResponse>({
    queryKey: ["jobs", params],
    queryFn: async () => {
      const res = await api.get("/gateway/crawl/jobs", { params });
      console.log("[API] GET /gateway/crawl/jobs →", res.data);
      return res.data;
    },
  });
}

export function useJob(jobId: string) {
  return useQuery<Job>({
    queryKey: ["jobs", jobId],
    queryFn: async () => {
      const res = await api.get(`/gateway/crawl/jobs/${jobId}`);
      return res.data;
    },
    enabled: !!jobId,
  });
}

export function useJobPolling(jobId: string) {
  return useQuery<Job>({
    queryKey: ["jobs", jobId, "poll"],
    queryFn: async () => {
      const res = await api.get(`/gateway/crawl/jobs/${jobId}`);
      console.log(`[API] GET /gateway/crawl/jobs/${jobId} →`, res.data);
      return res.data;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 3000;
    },
  });
}

export function useJobPosts(jobId: string, params: PostsQueryParams = {}) {
  return useQuery<PostsResponse>({
    queryKey: ["jobs", jobId, "posts", params],
    queryFn: async () => {
      console.log(`[API] GET /gateway/crawl/jobs/${jobId}/posts params:`, params);
      const res = await api.get(`/gateway/crawl/jobs/${jobId}/posts`, { params });
      console.log(`[API] GET /gateway/crawl/jobs/${jobId}/posts →`, res.data);
      return res.data;
    },
    enabled: !!jobId,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateJobPayload) => {
      console.log("[API] POST /gateway/crawl/jobs body:", data);
      const res = await api.post("/gateway/crawl/jobs", data);
      console.log("[API] POST /gateway/crawl/jobs →", res.data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useRecrawlJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      console.log(`[API] POST /gateway/crawl/jobs/${jobId}/recrawl`);
      const res = await api.post(`/gateway/crawl/jobs/${jobId}/recrawl`);
      console.log(`[API] POST /gateway/crawl/jobs/${jobId}/recrawl →`, res.data);
      return res.data;
    },
    onSuccess: (_data, jobId) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
    },
  });
}

export function useGenerateKeywords() {
  return useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      console.log("[API] POST /gateway/keywords/generate body:", data);
      const res = await api.post("/gateway/keywords/generate", data);
      console.log("[API] POST /gateway/keywords/generate →", res.data);
      return res.data;
    },
  });
}

// ── Products ──

export interface Product {
  id: string;
  name: string;
  description: string;
  queries: CrawlJobQueries;
  subreddits: string[];
  createdAt: string;
}

export interface ProductsResponse {
  products: Product[];
}

export function useProducts() {
  return useQuery<ProductsResponse>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get("/gateway/products");
      console.log("[API] GET /gateway/products →", res.data);
      return res.data;
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      console.log(`[API] DELETE /gateway/products/${productId}`);
      const res = await api.delete(`/gateway/products/${productId}`);
      console.log(`[API] DELETE /gateway/products/${productId} →`, res.data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
