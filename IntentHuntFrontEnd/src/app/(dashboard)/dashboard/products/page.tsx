"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobs, useProducts, useDeleteProduct, type Job, type Product } from "@/hooks/useJobs";
import {
  Package,
  Plus,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
  TrendingUp,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";

function DeleteProductModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const deleteProduct = useDeleteProduct();
  const isMatch = confirmName.trim().toLowerCase() === product.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isMatch) return;
    try {
      await deleteProduct.mutateAsync(product.id);
      onClose();
    } catch {
      // error handled by react-query
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-red-500/20 bg-bg-secondary p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Delete Product</h3>
            <p className="text-xs text-white/40">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-white/50 mb-4">
          This will permanently delete <span className="text-white font-medium">{product.name}</span> and all its associated crawl jobs and leads.
        </p>

        <div className="mb-5">
          <label className="block text-xs text-white/40 mb-2">
            Type <span className="text-red-400 font-medium">{product.name}</span> to confirm
          </label>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={product.name}
            className="!border-red-500/20 focus:!border-red-500/40 focus:!shadow-[0_0_0_3px_rgba(239,68,68,0.1)]"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <button
            onClick={handleDelete}
            disabled={!isMatch || deleteProduct.isPending}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isMatch
                ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 cursor-pointer"
                : "bg-white/5 text-white/20 border border-white/5 cursor-not-allowed"
            }`}
          >
            {deleteProduct.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            {deleteProduct.isPending ? "Deleting..." : "Delete Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProductWithJobs {
  product: Product;
  jobs: Job[];
  totalLeads: number;
  latestJob: Job | null;
}

function buildProductsWithJobs(products: Product[], jobs: Job[]): ProductWithJobs[] {
  return products.map((product) => {
    const productJobs = jobs
      .filter((j) => j.productId === product.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      product,
      jobs: productJobs,
      totalLeads: productJobs.reduce((sum, j) => sum + (j.resultCount || 0), 0),
      latestJob: productJobs[0] || null,
    };
  });
}

function ProductCard({ data }: { data: ProductWithJobs }) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { product, jobs, totalLeads, latestJob } = data;
  const latestIsRunning =
    latestJob?.status === "pending" || latestJob?.status === "running";

  const sources = [
    ...(product.queries?.redditGlobal?.length || product.queries?.redditSubreddit?.length
      ? ["Reddit"]
      : []),
    ...(product.queries?.hackernews?.length ? ["HN"] : []),
  ];

  return (
    <div className="space-y-0">
      <Card
        className="!p-5 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
              {latestIsRunning ? (
                <Loader2 size={20} className="text-accent animate-spin" />
              ) : (
                <Package size={20} className="text-white/40" />
              )}
            </div>
            <div>
              <p className="text-base font-medium mb-1">{product.name}</p>
              <div className="flex items-center gap-2 text-xs text-white/40">
                {sources.length > 0 && (
                  <>
                    <span>{sources.join(" + ")}</span>
                    <span>&middot;</span>
                  </>
                )}
                <span>{totalLeads} leads</span>
                <span>&middot;</span>
                <span>{jobs.length} {jobs.length === 1 ? "crawl" : "crawls"}</span>
                <span>&middot;</span>
                <span>{new Date(product.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
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
                {latestIsRunning && <Loader2 size={12} className="animate-spin" />}
                {latestJob.status}
              </Badge>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteModal(true);
              }}
              className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Delete product"
            >
              <Trash2 size={15} />
            </button>
            {jobs.length > 0 ? (
              expanded ? (
                <ChevronUp size={16} className="text-white/30" />
              ) : (
                <ChevronDown size={16} className="text-white/30" />
              )
            ) : (
              <span className="text-xs text-white/30">No crawls yet</span>
            )}
          </div>
        </div>
      </Card>

      {expanded && jobs.length > 0 && (
        <div className="ml-8 border-l-2 border-border-default pl-4 pt-2 pb-1 space-y-2">
          {jobs.map((job) => {
            const isRunning = job.status === "pending" || job.status === "running";
            return (
              <Link key={job.jobId} href={`/dashboard/products/${job.jobId}`}>
                <Card className="!p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                      {isRunning ? (
                        <Loader2 size={14} className="text-accent animate-spin" />
                      ) : (
                        <Calendar size={14} className="text-white/30" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80">
                        {new Date(job.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-white/35">
                        <span className="flex items-center gap-1">
                          <TrendingUp size={10} />
                          {job.resultCount} leads
                        </span>
                        <span>&middot;</span>
                        <span>{job.keywords.length} keywords</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "good"
                          : job.status === "running"
                            ? "accent"
                            : job.status === "failed"
                              ? "hot"
                              : "default"
                      }
                    >
                      {isRunning && <Loader2 size={10} className="animate-spin" />}
                      {job.status}
                    </Badge>
                    <ArrowRight
                      size={14}
                      className="text-white/20 hover:text-white/60 transition-colors"
                    />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {showDeleteModal && (
        <DeleteProductModal
          product={product}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

export default function ProductsPage() {
  const { data: productsData, isLoading: productsLoading } = useProducts();
  const { data: jobsData, isLoading: jobsLoading } = useJobs();

  const isLoading = productsLoading || jobsLoading;
  const products = productsData?.products ?? [];
  const jobs = jobsData?.jobs ?? [];
  const productsWithJobs = buildProductsWithJobs(products, jobs);

  return (
    <>
      <DashboardHeader title="Products" subtitle="Your tracked products and their leads" />

      <div className="flex justify-end mb-6">
        <Link href="/dashboard/products/new">
          <Button>
            <Plus size={16} />
            Add Product
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : productsWithJobs.length === 0 ? (
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
          {productsWithJobs.map((data) => (
            <ProductCard key={data.product.id} data={data} />
          ))}
        </div>
      )}
    </>
  );
}
