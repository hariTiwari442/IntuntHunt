"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts, type Product } from "@/hooks/useJobs";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import {
  Package,
  TrendingUp,
  Plus,
  ArrowRight,
  Sparkles,
  Search,
} from "lucide-react";

// Deterministic gradient per product name (same palette as /products page)
const AVATAR_GRADIENTS = [
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-purple-500",
  "from-orange-400 to-rose-500",
  "from-sky-400 to-blue-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-fuchsia-500",
  "from-cyan-400 to-emerald-500",
  "from-indigo-400 to-violet-500",
];

function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
}

export default function DashboardPage() {
  const { data: productsData, isLoading } = useProducts();
  const { user } = useAuth();
  const { features, isStarter } = usePlan();

  const products       = productsData?.products ?? [];
  const totalLeads     = products.reduce((sum, p) => sum + (p.leadCount    ?? 0), 0);
  const newLeads24h    = products.reduce((sum, p) => sum + (p.newLeadCount ?? 0), 0);
  const productCount   = products.length;
  const recentProducts = [...products]
    .sort((a, b) => {
      const aDate = new Date(a.lastSearchedAt ?? a.createdAt).getTime();
      const bDate = new Date(b.lastSearchedAt ?? b.createdAt).getTime();
      return bDate - aDate;
    })
    .slice(0, 3);

  const firstName = (user?.name || user?.email?.split("@")[0] || "there").split(" ")[0];

  return (
    <>
      <DashboardHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what's happening with your lead engine today."
      />

      {/* Plan limit banner */}
      {isStarter && features.jobsPerMonth !== null && (
        <div className="mb-6 p-4 rounded-2xl border border-accent/20 bg-accent-soft flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white border border-accent/20 flex items-center justify-center">
              <TrendingUp size={16} className="text-accent" />
            </div>
            <p className="text-sm text-text-secondary">
              You&apos;re on the <span className="text-text-primary font-medium">{features.label}</span> plan
              ({features.jobsPerMonth} products/month).
            </p>
          </div>
          <Link href="/pricing">
            <Button size="sm" variant="secondary" className="!text-accent border-accent/20">
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <StatCard
            icon={TrendingUp}
            label="Total Leads"
            value={totalLeads.toLocaleString()}
            hint={
              totalLeads === 0
                ? "Click Find Leads on a product to start"
                : newLeads24h > 0
                  ? `+${newLeads24h.toLocaleString()} new in the last 24 hours`
                  : "across all tracked products"
            }
            accent
          />
          <StatCard
            icon={Package}
            label="Products Tracked"
            value={productCount.toLocaleString()}
            hint={productCount === 0 ? "Add your first product to begin" : "scanning Reddit, LinkedIn & Twitter"}
          />
        </div>
      )}

      {/* Recent products header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Recent Products</h2>
        <Link href="/dashboard/products/new">
          <Button size="sm">
            <Plus size={16} />
            Add Product
          </Button>
        </Link>
      </div>

      {/* Recent products list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : products.length === 0 ? (
        <Card className="!p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent-soft border border-accent/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-accent" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
            Add your first product and LeadPulse will start finding buyers across Reddit, LinkedIn, and Twitter.
          </p>
          <Link href="/dashboard/products/new">
            <Button>
              <Plus size={16} /> Add your first product
            </Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {recentProducts.map((p) => <CompactProductRow key={p.id} product={p} />)}
          </div>
          {products.length > 3 && (
            <div className="text-center mt-4">
              <Link
                href="/dashboard/products"
                className="text-sm font-medium text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
              >
                View all {products.length} products
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        accent
          ? "bg-accent-soft border-accent/20"
          : "bg-bg-secondary border-border-default"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            accent ? "bg-white border border-accent/20" : "bg-bg-muted"
          }`}
        >
          <Icon size={14} className={accent ? "text-accent" : "text-text-secondary"} strokeWidth={2.5} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold text-text-primary tabular-nums mb-1">{value}</div>
      {hint && <div className="text-xs text-text-tertiary">{hint}</div>}
    </div>
  );
}

function CompactProductRow({ product }: { product: Product }) {
  const name      = product.name?.trim() || "Untitled product";
  const initial   = name[0]!.toUpperCase();
  const gradient  = gradientFor(name);
  const leadCount = product.leadCount ?? 0;

  return (
    <Link href={`/dashboard/products/${product.id}`} className="block group">
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-border-default bg-bg-secondary transition-all hover:border-accent/40 hover:shadow-[0_8px_30px_-12px_rgba(22,163,74,0.18)] hover:-translate-y-0.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-white text-base font-bold">{initial}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-text-primary">{name}</p>
            <p className="text-xs text-text-secondary line-clamp-1">{product.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <div className="text-lg font-bold text-text-primary tabular-nums leading-tight">
                {leadCount.toLocaleString()}
              </div>
              {(product.newLeadCount ?? 0) > 0 && (
                <span
                  title="Found within the last 24 hours"
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-soft text-accent cursor-help"
                >
                  <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                  +{product.newLeadCount}
                </span>
              )}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary font-semibold">
              {leadCount === 1 ? "lead" : "leads"}
            </div>
          </div>
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-accent-soft text-accent group-hover:bg-accent group-hover:text-white group-hover:translate-x-0.5 transition-all">
            <ArrowRight size={14} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// Keeping Search import alive for future "Find leads" quick action.
void Search;
