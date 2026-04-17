"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useJobs, useProducts } from "@/hooks/useJobs";
import { usePlan } from "@/hooks/usePlan";
import { Package, TrendingUp, MessageSquare, Plus, ArrowRight, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { data: productsData, isLoading: productsLoading } = useProducts();
  const { data: jobsData, isLoading: jobsLoading } = useJobs();
  const { features, isStarter } = usePlan();

  const isLoading = productsLoading || jobsLoading;
  const products = productsData?.products ?? [];
  const jobs = jobsData?.jobs ?? [];

  const totalLeads = jobs.reduce((sum, j) => sum + (j.resultCount || 0), 0);
  const totalKeywords = [...new Set(jobs.flatMap((j) => j.keywords || []))].length;

  const statCards = [
    {
      label: "Products",
      value: products.length,
      icon: Package,
      color: "text-accent",
    },
    {
      label: "Leads Found",
      value: totalLeads,
      icon: TrendingUp,
      color: "text-cyan-400",
    },
    {
      label: "Keywords Tracked",
      value: totalKeywords,
      icon: MessageSquare,
      color: "text-amber-400",
    },
  ];

  // Get latest job per product for the dashboard list
  const productSummaries = products.map((product) => {
    const productJobs = jobs
      .filter((j) => j.productId === product.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latestJob = productJobs[0] || null;
    const leads = productJobs.reduce((sum, j) => sum + (j.resultCount || 0), 0);
    return { product, latestJob, leads, crawlCount: productJobs.length };
  });

  return (
    <>
      <DashboardHeader title="Dashboard" subtitle="Overview of your lead discovery" />

      {/* Plan limit warning */}
      {isStarter && features.jobsPerMonth !== null && (
        <div className="mb-6 p-4 rounded-2xl border border-accent/15 bg-accent/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-accent" />
            </div>
            <p className="text-sm text-white/60">
              You&apos;re on the <span className="text-white font-medium">{features.label}</span> plan
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.label} className="!p-5">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/40 mb-2">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-xl bg-white/5 ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Your Products</h2>
        <Link href="/dashboard/products/new">
          <Button size="sm">
            <Plus size={16} />
            Add Product
          </Button>
        </Link>
      </div>

      {/* Products list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : productSummaries.length === 0 ? (
        <Card className="!p-12 text-center">
          <Package className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-sm text-white/40 mb-6">
            Add your first product and we&apos;ll find people who are looking for it.
          </p>
          <Link href="/dashboard/products/new">
            <Button>
              <Plus size={16} /> Add your first product
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {productSummaries.slice(0, 5).map(({ product, latestJob, leads, crawlCount }) => {
            const isRunning =
              latestJob?.status === "pending" || latestJob?.status === "running";
            return (
              <Link
                key={product.id}
                href={latestJob ? `/dashboard/products/${latestJob.jobId}` : "/dashboard/products"}
              >
                <Card className="!p-4 flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                      {isRunning ? (
                        <Loader2 size={18} className="text-accent animate-spin" />
                      ) : (
                        <Package size={18} className="text-white/40" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-white/40">
                        {leads} leads
                        {crawlCount > 1 && <> &middot; {crawlCount} crawls</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {latestJob && (
                      <Badge
                        variant={
                          latestJob.status === "completed"
                            ? "good"
                            : latestJob.status === "running"
                              ? "accent"
                              : latestJob.status === "failed"
                                ? "hot"
                                : "default"
                        }
                      >
                        {isRunning && <Loader2 size={12} className="animate-spin" />}
                        {latestJob.status}
                      </Badge>
                    )}
                    <ArrowRight
                      size={16}
                      className="text-white/20 group-hover:text-white/60 transition-colors"
                    />
                  </div>
                </Card>
              </Link>
            );
          })}
          {productSummaries.length > 5 && (
            <div className="text-center pt-2">
              <Link
                href="/dashboard/products"
                className="text-sm text-accent hover:text-accent-hover transition-colors"
              >
                View all {productSummaries.length} products &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
