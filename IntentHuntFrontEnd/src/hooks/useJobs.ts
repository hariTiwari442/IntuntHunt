"use client";

/**
 * Lead-engine hooks.
 * (File kept as useJobs.ts for now to minimize import churn elsewhere —
 *  feel free to rename to useLeadEngine.ts later.)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────────────

export type Platform = "reddit" | "linkedin" | "twitter";
export type LeadType = "hot" | "warm" | "possible" | "unlikely" | "not_a_lead";
export type ReplyOpportunity = "comment" | "dm" | "both" | "none";
export type LeadStatus = "new" | "viewed" | "replied" | "dismissed";
export type SearchRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface QueryBundle {
  redditGlobal?:    string[];
  redditSubreddit?: Record<string, string[]>;
  linkedin?:        string[];
  twitter?:         string[];
  producthunt?:     string[];
  indiehackers?:    string[];
}

export interface ProductIntelligence {
  productName?:   string;
  productType?:   string;
  category?:      string;
  problem?:       string;
  audience?:      string;
  pains?:         string[];
  alternatives?:  string[];
  triggers?:      string[];
  searchPhrases?: string[];
}

export interface Product {
  id:             string;
  name:           string;
  description:    string;
  productUrl:     string | null;
  intelligence:   ProductIntelligence;
  queries:        QueryBundle;
  subreddits:     string[];
  lastSearchedAt: string | null;
  createdAt:      string;
}

export interface SearchRun {
  searchRunId:    string;
  productId:      string;
  status:         SearchRunStatus;
  queriesUsed:    number;
  urlsFound:      number;
  urlsPreScored:  number;
  totalUrls:      number | null;
  processedUrls:  number;
  leadsScored:    number;
  leadsReplied:   number;
  errorMessage:   string | null;
  startedAt:      string;
  completedAt:    string | null;
}

export interface Lead {
  id:                   string;
  productId:            string;
  searchRunId:          string;
  url:                  string;
  platform:             Platform;
  subreddit:            string | null;
  title:                string;
  content:              string | null;
  author:               string | null;
  authorProfileUrl:     string | null;
  postScore:            number;
  commentCount:         number;
  postedAt:             string | null;
  preScore:             number;
  googleSnippet:        string;
  querySource:          string;
  intentScore:          number;
  leadType:             LeadType;
  reasoning:            string | null;
  replyOpportunity:     ReplyOpportunity;
  suggestedAngle:       string | null;
  isCompetitorThread:   boolean;
  suggestedReply:       string | null;
  replyConfidenceNote:  string | null;
  status:               LeadStatus;
  userReplied:          boolean;
  repliedAt:            string | null;
  tags:                 string[];
  viewedAt:             string | null;
  userNote:             string | null;
  preScoredAt:          string;
  contentFetchedAt:     string | null;
  deepScoredAt:         string | null;
  replyGeneratedAt:     string | null;
  createdAt:            string;
}

/** Fixed tag IDs. Keep in sync with backend filters. UI uses 3: saved / replied / not_a_fit. */
export const LEAD_TAGS = [
  "hot_priority",
  "saved",
  "replied",
  "follow_up",
  "not_a_fit",
  "already_contacted",
  "custom_reply",
] as const;
export type LeadTag = (typeof LEAD_TAGS)[number];

/** Derive per-card "loading state" from which fields are populated. */
export type LeadState = "pre_scored" | "content_loaded" | "scored" | "complete";
export function deriveLeadState(l: Lead): LeadState {
  if (l.replyGeneratedAt) return "complete";
  if (l.deepScoredAt)     return "scored";
  if (l.contentFetchedAt) return "content_loaded";
  return "pre_scored";
}

// ── Product hooks ───────────────────────────────────────────────────────────

export function useProducts() {
  return useQuery<{ products: Product[] }>({
    queryKey: ["products"],
    queryFn: async () => (await api.get("/gateway/products")).data,
  });
}

export function useProduct(productId: string) {
  return useQuery<Product>({
    queryKey: ["products", productId],
    queryFn: async () => (await api.get(`/gateway/products/${productId}`)).data,
    enabled: !!productId,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string; description: string; productUrl?: string }) => {
      const res = await api.post("/gateway/products", data);
      return res.data as Product;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productId: string;
      data: {
        name?:        string;
        description?: string;
        productUrl?:  string | null;
        queries?:     QueryBundle;
        subreddits?:  string[];
      };
    }) => {
      const res = await api.patch(`/gateway/products/${input.productId}`, input.data);
      return res.data as Product;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products", vars.productId] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const res = await api.delete(`/gateway/products/${productId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

// ── Lead-engine hooks ───────────────────────────────────────────────────────

/** POST /gateway/products/:id/find-leads — kicks off the async pipeline. */
export function useFindLeads() {
  return useMutation({
    mutationFn: async (productId: string) => {
      const res = await api.post(`/gateway/products/${productId}/find-leads`);
      return res.data as { searchRunId: string; status: string; createdAt: string };
    },
  });
}

/** GET /gateway/search-runs/:id — used as Realtime fallback / progress display. */
export function useSearchRun(searchRunId: string | null) {
  return useQuery<SearchRun>({
    queryKey: ["search-runs", searchRunId],
    queryFn: async () => (await api.get(`/gateway/search-runs/${searchRunId}`)).data,
    enabled: !!searchRunId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 3000;
    },
  });
}

/** GET /gateway/products/:id/leads — initial fetch; Realtime pushes after. */
export function useLeads(
  productId: string,
  params: { searchRunId?: string; minIntentScore?: number; leadType?: LeadType; limit?: number } = {},
) {
  return useQuery<{ leads: Lead[]; total: number }>({
    queryKey: ["leads", productId, params],
    queryFn: async () => {
      const res = await api.get(`/gateway/products/${productId}/leads`, { params });
      return res.data;
    },
    enabled: !!productId,
  });
}

/**
 * PATCH /gateway/leads/:leadId — update tags / viewed flag.
 * Doesn't invalidate queries (Realtime handles the refresh).
 */
export function useUpdateLead() {
  return useMutation({
    mutationFn: async (input: {
      leadId:    string;
      tags?:     string[];
      viewed?:   boolean;
      status?:   LeadStatus;
      userNote?: string | null;
    }) => {
      const { leadId, ...body } = input;
      const res = await api.patch(`/gateway/leads/${leadId}`, body);
      return res.data as Lead;
    },
  });
}
