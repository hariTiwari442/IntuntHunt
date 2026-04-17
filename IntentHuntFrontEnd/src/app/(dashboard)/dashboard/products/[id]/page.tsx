"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanGuard } from "@/components/plan/PlanGuard";
import {
  useJobs,
  useJobPolling,
  useJobPosts,
  useRecrawlJob,
  getIntentScore,
  type Post,
  type PostsQueryParams,
} from "@/hooks/useJobs";
import { usePlan } from "@/hooks/usePlan";
import {
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Filter,
  ArrowUpDown,
  Flame,
  TrendingUp,
  Eye,
  Sparkles,
  RefreshCw,
  Lock,
  Crown,
  Globe,
  Briefcase,
  MessageSquareCode,
  Lightbulb,
} from "lucide-react";

function IntentBadge({ score }: { score: number }) {
  if (score >= 80)
    return (
      <Badge variant="hot">
        <Flame size={12} /> {score}
      </Badge>
    );
  if (score >= 50)
    return (
      <Badge variant="good">
        <TrendingUp size={12} /> {score}
      </Badge>
    );
  return (
    <Badge variant="watch">
      <Eye size={12} /> {score}
    </Badge>
  );
}

function PostCard({ post }: { post: Post }) {
  const [showReply, setShowReply] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copied, setCopied] = useState(false);
  const score = getIntentScore(post);

  const handleToggleReply = () => {
    if (!showReply && post.suggestedReply) {
      setShowReply(true);
      setIsTyping(true);
      setDisplayedText("");
      const text = post.suggestedReply;
      let i = 0;
      const interval = setInterval(() => {
        // Type in chunks of 2-4 chars for natural speed
        const chunk = Math.floor(Math.random() * 3) + 2;
        i += chunk;
        if (i >= text.length) {
          setDisplayedText(text);
          setIsTyping(false);
          clearInterval(interval);
        } else {
          setDisplayedText(text.slice(0, i));
        }
      }, 20);
    } else {
      setShowReply(false);
      setDisplayedText("");
      setIsTyping(false);
    }
  };

  const copyReply = () => {
    if (post.suggestedReply) {
      navigator.clipboard.writeText(post.suggestedReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const commentUrl = post.source === "reddit"
    ? `${post.url}#comment`
    : post.url;

  return (
    <Card
      className={`!p-5 transition-all ${
        score >= 80
          ? "bg-gradient-to-r from-accent/[0.06] via-white/[0.02] to-transparent !border-accent/15"
          : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-4">
        <IntentBadge score={score} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase tracking-wide text-accent font-medium">
              {score >= 80 ? "High Intent" : score >= 50 ? "Good Intent" : "Watching"}
            </span>
            <span className="text-white/20">&middot;</span>
            <span className="text-[11px] text-white/35">
              {post.source === "reddit" ? `r/${post.subreddit}` : post.source === "linkedin" ? "LinkedIn" : "Hacker News"}
              {" "}&middot; {new Date(post.postedAt).toLocaleDateString()}
            </span>
            <span className="text-white/20">&middot;</span>
            <span className="text-[11px] text-white/35">
              {post.score} pts &middot; {post.commentCount} comments
            </span>
          </div>
          <h3 className="text-sm font-medium text-white/90 mb-1.5">{post.title}</h3>
          <p className="text-xs text-white/45 line-clamp-3 leading-relaxed">{post.content}</p>
          {post.strategy && (
            <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-amber-500/[0.07] border border-amber-500/15 w-fit">
              <Lightbulb size={12} className="text-amber-400 shrink-0" />
              <span className="text-[11px] text-amber-300/80">{post.strategy}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border-default">
        <a
          href={commentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-accent hover:bg-accent/10 transition-all"
        >
          <ExternalLink size={13} />
          Open Post & Comment
        </a>

        {post.suggestedReply && (
          <button
            onClick={handleToggleReply}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent/80 hover:text-accent hover:bg-accent/10 transition-all ml-auto"
          >
            {isTyping ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
            {isTyping ? "Generating..." : "Generate Reply"}
            {showReply && !isTyping ? <ChevronUp size={13} /> : !showReply ? <ChevronDown size={13} /> : null}
          </button>
        )}

        <span className="text-[11px] text-white/25 ml-auto">
          by {post.author}
        </span>
      </div>

      {/* Blurred reply preview */}
      {!showReply && post.suggestedReply && (
        <button
          onClick={handleToggleReply}
          className="mt-3 w-full relative rounded-xl bg-white/[0.02] border border-border-default p-3 cursor-pointer group/preview hover:border-accent/20 transition-all text-left"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={11} className="text-accent/50" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-accent/40">AI Reply Preview</span>
          </div>
          <p className="text-xs text-white/40 line-clamp-2 blur-[2px] select-none leading-relaxed">
            {post.suggestedReply}
          </p>
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-transparent group-hover/preview:bg-accent/[0.03] transition-all">
            <span className="text-[11px] text-accent/60 font-medium opacity-0 group-hover/preview:opacity-100 transition-opacity">
              Click to reveal full reply
            </span>
          </div>
        </button>
      )}

      {/* Suggested Reply (expanded with typewriter) */}
      {showReply && (
        <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-border-default">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={13} className="text-accent" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-accent/60">AI-Generated Reply</span>
          </div>
          <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
            {displayedText}
            {isTyping && <span className="inline-block w-0.5 h-4 bg-accent/70 ml-0.5 animate-pulse align-middle" />}
          </p>
          {!isTyping && (
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => {
                  copyReply();
                  window.open(commentUrl, "_blank", "noopener,noreferrer");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-all"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied! Opening post..." : "Copy & Open Post"}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { can } = usePlan();

  const { data: job, isLoading: jobLoading } = useJobPolling(jobId);
  const { data: jobsData } = useJobs();
  const recrawl = useRecrawlJob();

  // Find productId from the jobs list (single job endpoint doesn't return it)
  const allJobs = jobsData?.jobs ?? [];
  const currentJobFromList = allJobs.find((j) => j.jobId === jobId);
  const currentProductId = currentJobFromList?.productId || job?.productId;
  const siblingJobs = currentProductId
    ? allJobs
        .filter((j) => j.productId === currentProductId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const handleRecrawl = async () => {
    try {
      const data = await recrawl.mutateAsync(jobId);
      // Redirect to the new job's page so polling picks it up
      router.push(`/dashboard/products/${data.jobId}`);
    } catch {
      // mutation error handled by react-query
    }
  };

  // Filters — default sort by intent_score desc
  const [filters, setFilters] = useState<PostsQueryParams>({
    page: 1,
    limit: 10,
    sortBy: "intent_score",
    sortDir: "desc",
  });
  const [keywordFilter, setKeywordFilter] = useState("");

  const activeFilters: PostsQueryParams = {
    ...filters,
    ...(keywordFilter.trim() ? { keyword: keywordFilter.trim() } : {}),
  };

  const { data: postsData, isLoading: postsLoading } = useJobPosts(jobId, activeFilters);

  if (jobLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!job) {
    return (
      <Card className="!p-12 text-center">
        <h3 className="text-lg font-semibold mb-2">Product not found</h3>
        <Link href="/dashboard/products">
          <Button variant="secondary">Back to products</Button>
        </Link>
      </Card>
    );
  }

  const allKeywords = job.keywords || [];
  const isRunning = job.status === "pending" || job.status === "running";
  const totalPosts = postsData?.total ?? 0;

  return (
    <>
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/products" className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-white/50 mt-0.5">
            {totalPosts} {totalPosts === 1 ? "lead" : "leads"} found
            {allKeywords.length > 0 && (
              <span className="text-white/30">
                {" "}&middot; tracking: {allKeywords.slice(0, 3).join(", ")}
                {allKeywords.length > 3 && ` +${allKeywords.length - 3}`}
              </span>
            )}
          </p>
        </div>
        <Badge
          variant={
            job.status === "completed"
              ? "good"
              : isRunning
                ? "accent"
                : job.status === "failed"
                  ? "hot"
                  : "default"
          }
        >
          {isRunning && <Loader2 size={12} className="animate-spin" />}
          {job.status}
        </Badge>
      </div>

      {/* Crawl history switcher */}
      {siblingJobs.length > 1 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <span className="text-xs text-white/30 shrink-0 mr-1">Crawls:</span>
          {siblingJobs.map((sj, idx) => {
            const isActive = sj.jobId === jobId;
            const date = new Date(sj.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return (
              <button
                key={sj.jobId}
                onClick={() => {
                  if (!isActive) router.push(`/dashboard/products/${sj.jobId}`);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-white/5 text-white/50 border border-transparent hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {date} &middot; {sj.resultCount} leads
                {sj.status === "running" && (
                  <Loader2 size={10} className="inline ml-1 animate-spin" />
                )}
                {idx === 0 && <span className="ml-1 text-[10px] text-white/25">(latest)</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Crawl in progress banner */}
      {isRunning && (
        <Card className="!p-5 mb-6 !border-accent/15">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="text-accent animate-spin" />
            <div>
              <p className="font-medium text-sm">Scanning for leads...</p>
              <p className="text-xs text-white/40">
                Results appear as they&apos;re found. This page auto-refreshes every 3 seconds.
              </p>
            </div>
          </div>
          {job.taskCount > 0 && job.resultCount != null && (
            <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, (job.resultCount / job.taskCount) * 100)}%` }}
              />
            </div>
          )}
        </Card>
      )}

      {/* Refresh leads section */}
      {!isRunning && (
        <Card className="!p-5 mb-6 !border-accent/10 bg-gradient-to-r from-accent/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <RefreshCw size={18} className="text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm">Find fresh leads</p>
                <p className="text-xs text-white/40">
                  {can("suggested_replies")
                    ? "Re-scan Reddit & HN for new posts matching your keywords."
                    : "Upgrade to Pro to re-crawl and discover new leads."}
                </p>
              </div>
            </div>
            {can("suggested_replies") ? (
              <Button
                size="sm"
                onClick={handleRecrawl}
                disabled={recrawl.isPending}
              >
                {recrawl.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Find New Leads
                  </>
                )}
              </Button>
            ) : (
              <Link href="/pricing">
                <Button size="sm" variant="secondary" className="!text-accent border-accent/20">
                  <Crown size={14} />
                  Upgrade to Pro
                </Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Filters bar */}
      <Card className="!p-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Platform filter icons */}
          <div className="flex items-center gap-1.5">
            {[
              { key: undefined as PostsQueryParams["source"], label: "All", icon: Globe },
              { key: "reddit" as const, label: "Reddit", icon: MessageSquareCode },
              { key: "hackernews" as const, label: "HN", icon: MessageSquare },
              { key: "linkedin" as const, label: "LinkedIn", icon: Briefcase },
            ].map((src) => {
              const isActive = filters.source === src.key;
              return (
                <button
                  key={src.label}
                  onClick={() =>
                    setFilters((f) => ({ ...f, source: src.key, page: 1 }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "bg-white/5 text-white/40 border border-transparent hover:bg-white/10 hover:text-white/60"
                  }`}
                  title={src.label}
                >
                  <src.icon size={14} />
                  {src.label}
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-border-default" />

          <select
            value={filters.minIntentScore || ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                minIntentScore: e.target.value ? Number(e.target.value) : undefined,
                page: 1,
              }))
            }
            className="px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-border-default text-xs text-white outline-none"
          >
            <option value="" className="bg-[#1a1a2e] text-white">Any intent</option>
            <option value="80" className="bg-[#1a1a2e] text-white">Hot (80+)</option>
            <option value="50" className="bg-[#1a1a2e] text-white">Good (50+)</option>
            <option value="30" className="bg-[#1a1a2e] text-white">Watch (30+)</option>
          </select>

          <Input
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            placeholder="Filter by keyword..."
            className="!w-44 !py-1.5 !text-xs"
          />

          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown size={13} className="text-white/30" />
            <select
              value={`${filters.sortBy}:${filters.sortDir}`}
              onChange={(e) => {
                const [sortBy, sortDir] = e.target.value.split(":") as [
                  PostsQueryParams["sortBy"],
                  PostsQueryParams["sortDir"],
                ];
                setFilters((f) => ({ ...f, sortBy, sortDir }));
              }}
              className="px-3 py-1.5 rounded-lg bg-[#1a1a2e] border border-border-default text-xs text-white outline-none"
            >
              <option value="intent_score:desc" className="bg-[#1a1a2e] text-white">Highest intent</option>
              <option value="intent_score:asc" className="bg-[#1a1a2e] text-white">Lowest intent</option>
              <option value="posted_at:desc" className="bg-[#1a1a2e] text-white">Newest</option>
              <option value="posted_at:asc" className="bg-[#1a1a2e] text-white">Oldest</option>
              <option value="score:desc" className="bg-[#1a1a2e] text-white">Most upvoted</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Posts / Leads list */}
      {postsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !postsData || postsData.posts.length === 0 ? (
        <Card className="!p-12 text-center">
          <p className="text-white/40">
            {isRunning
              ? "Leads will appear here as the crawl progresses..."
              : "No leads match your filters."}
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {postsData.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          {/* Pagination */}
          {postsData.total > postsData.limit && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                variant="secondary"
                size="sm"
                disabled={postsData.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
              >
                Previous
              </Button>
              <span className="text-sm text-white/40">
                Page {postsData.page} of {Math.ceil(postsData.total / postsData.limit)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={postsData.page >= Math.ceil(postsData.total / postsData.limit)}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
