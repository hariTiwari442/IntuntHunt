"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { LeadInboxSidebar, type StatusFilter, type PlatformFilter, type TimeFilter } from "@/components/dashboard/LeadInboxSidebar";
import { LeadList } from "@/components/dashboard/LeadList";
import { LeadDetail } from "@/components/dashboard/LeadDetail";
import { EditProductModal } from "@/components/dashboard/EditProductModal";
import {
  useProduct,
  useFindLeads,
  useSearchRun,
  useLeads,
} from "@/hooks/useJobs";
import { useLeadsRealtime } from "@/hooks/useLeadsRealtime";
import { ArrowLeft, RefreshCw, Loader2, Sparkles } from "lucide-react";

export default function ProductDetailPage() {
  const params    = useParams();
  const productId = params.id as string;

  const { data: product, isLoading: productLoading } = useProduct(productId);

  // Active SearchRun (set by Find Leads click)
  const [activeSearchRunId, setActiveSearchRunId] = useState<string | null>(null);

  const findLeads          = useFindLeads();
  const { data: searchRun } = useSearchRun(activeSearchRunId);

  const { data: leadsData } = useLeads(
    productId,
    activeSearchRunId ? { searchRunId: activeSearchRunId } : {},
  );
  const initialLeads = leadsData?.leads ?? [];
  const liveLeads    = useLeadsRealtime(activeSearchRunId, initialLeads);
  const leads        = activeSearchRunId ? liveLeads : initialLeads;

  // Filters
  const [status,       setStatus]       = useState<StatusFilter>("all");
  const [platform,     setPlatform]     = useState<PlatformFilter>("all");
  const [time,         setTime]         = useState<TimeFilter>("all");
  const [minRelevancy, setMinRelevancy] = useState(0);

  // Selected lead
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Edit-prompt modal
  const [editOpen, setEditOpen] = useState(false);

  // ── Filtering ─────────────────────────────────────────────────────────
  const cutoff24h = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, []);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (status === "unread"     && l.viewedAt)                            return false;
      if (status === "saved"      && !(l.tags ?? []).includes("saved"))     return false;
      if (status === "completed"  && !(l.tags ?? []).includes("replied"))   return false;
      if (status === "discarded"  && !(l.tags ?? []).includes("not_a_fit")) return false;

      if (platform !== "all" && l.platform !== platform) return false;

      if (time === "24h" && new Date(l.createdAt).getTime() < cutoff24h) return false;

      const displayScore = Math.min(100, l.intentScore + 10);
      if (displayScore < minRelevancy) return false;

      return true;
    });
  }, [leads, status, platform, time, minRelevancy, cutoff24h]);

  // Auto-select first lead when filter changes / leads load
  useEffect(() => {
    if (!selectedLeadId && filteredLeads.length > 0) {
      setSelectedLeadId(filteredLeads[0].id);
      return;
    }
    if (selectedLeadId && !filteredLeads.some((l) => l.id === selectedLeadId)) {
      setSelectedLeadId(filteredLeads[0]?.id ?? null);
    }
  }, [filteredLeads, selectedLeadId]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  // ── Counts (for sidebar badges) ──────────────────────────────────────
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, unread: 0, saved: 0, completed: 0, discarded: 0 };
    for (const l of leads) {
      c.all++;
      if (!l.viewedAt)                              c.unread++;
      const tags = l.tags ?? [];
      if (tags.includes("saved"))                   c.saved++;
      if (tags.includes("replied"))                 c.completed++;
      if (tags.includes("not_a_fit"))               c.discarded++;
    }
    return c;
  }, [leads]);

  const platformCounts = useMemo(() => {
    const c: Record<PlatformFilter, number> = { all: 0, reddit: 0, linkedin: 0, twitter: 0 };
    for (const l of leads) {
      c.all++;
      if (l.platform === "reddit")   c.reddit++;
      if (l.platform === "linkedin") c.linkedin++;
      if (l.platform === "twitter")  c.twitter++;
    }
    return c;
  }, [leads]);

  const timeCounts = useMemo(() => {
    const c: Record<TimeFilter, number> = { all: 0, "24h": 0 };
    for (const l of leads) {
      c.all++;
      if (new Date(l.createdAt).getTime() >= cutoff24h) c["24h"]++;
    }
    return c;
  }, [leads, cutoff24h]);

  // ── Find Leads ───────────────────────────────────────────────────────
  const isRunning = searchRun
    ? searchRun.status === "pending" || searchRun.status === "running"
    : findLeads.isPending;

  const handleFindLeads = async () => {
    const result = await findLeads.mutateAsync(productId);
    setActiveSearchRunId(result.searchRunId);
  };

  // ── Loading / not found ──────────────────────────────────────────────
  if (productLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  if (!product) {
    return (
      <Card className="!p-12 text-center">
        <h3 className="text-lg font-semibold mb-2">Product not found</h3>
        <Link href="/dashboard/products">
          <Button variant="secondary">Back to products</Button>
        </Link>
      </Card>
    );
  }

  // ── Render: top bar + 3-pane inbox ───────────────────────────────────
  return (
    <div className="-mx-8 -my-8 h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border-default bg-bg-secondary shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/products"
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">
              {product.name || "Untitled product"}
            </h1>
            <p className="text-xs text-text-tertiary line-clamp-1">
              {product.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {searchRun && (
            <div className="hidden md:flex items-center gap-3 text-[11px] text-text-tertiary">
              <span>{searchRun.queriesUsed} queries</span>
              <span>·</span>
              <span>{searchRun.urlsFound} URLs</span>
              <span>·</span>
              <span>{searchRun.leadsScored} scored</span>
            </div>
          )}
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent border border-accent/30 bg-accent-soft px-3 py-1.5 rounded-xl hover:bg-accent hover:text-white hover:border-accent transition-colors"
          >
            <Sparkles size={14} strokeWidth={2.5} />
            Edit prompt
          </button>
          <Button size="sm" onClick={handleFindLeads} disabled={isRunning || findLeads.isPending}>
            {isRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Find Leads
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Progress bar (when running) */}
      {searchRun && (
        <div className="h-1 bg-bg-muted overflow-hidden shrink-0">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{
              width: `${
                searchRun.totalUrls
                  ? Math.min(100, (searchRun.processedUrls / searchRun.totalUrls) * 100)
                  : 0
              }%`,
            }}
          />
        </div>
      )}

      {/* 3-pane body */}
      <div className="flex-1 flex overflow-hidden">
        <LeadInboxSidebar
          statusCounts={statusCounts}
          platformCounts={platformCounts}
          timeCounts={timeCounts}
          status={status}
          platform={platform}
          time={time}
          minRelevancy={minRelevancy}
          onStatusChange={setStatus}
          onPlatformChange={setPlatform}
          onTimeChange={setTime}
          onRelevancyChange={setMinRelevancy}
        />
        <LeadList
          leads={filteredLeads}
          selectedLeadId={selectedLeadId}
          isRunning={isRunning}
          onSelect={setSelectedLeadId}
        />
        <LeadDetail lead={selectedLead} />
      </div>

      {/* Edit prompt modal */}
      {editOpen && (
        <EditProductModal
          productId={productId}
          initialDescription={product.description}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
