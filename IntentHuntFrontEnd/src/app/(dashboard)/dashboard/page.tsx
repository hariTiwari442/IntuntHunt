"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts } from "@/hooks/useJobs";
import { usePlan } from "@/hooks/usePlan";
import { Package, TrendingUp, Plus, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const { data: productsData, isLoading } = useProducts();
  const { features, isStarter } = usePlan();

  const products = productsData?.products ?? [];

  return (
    <>
      <DashboardHeader title="Dashboard" subtitle="Overview of your lead discovery" />

      {/* Plan limit warning */}
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : products.length === 0 ? (
        <Card className="!p-12 text-center">
          <Package className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-sm text-text-secondary mb-6">
            Add your first product and we&apos;ll find buyers for it.
          </p>
          <Link href="/dashboard/products/new">
            <Button>
              <Plus size={16} /> Add your first product
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.slice(0, 5).map((product) => (
            <Link key={product.id} href={`/dashboard/products/${product.id}`}>
              <Card className="!p-4 flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-bg-muted flex items-center justify-center shrink-0">
                    <Package size={18} className="text-text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{product.name || "Untitled"}</p>
                    <p className="text-xs text-text-secondary line-clamp-1">{product.description}</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0" />
              </Card>
            </Link>
          ))}
          {products.length > 5 && (
            <div className="text-center pt-2">
              <Link href="/dashboard/products" className="text-sm text-accent hover:text-accent-hover transition-colors">
                View all {products.length} products &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
