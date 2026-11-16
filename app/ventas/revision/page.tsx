"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft } from "lucide-react";
import { StaffLoadState, useStaffData } from "@/components/layout/StaffLoadState";
import { ReviewList } from "@/components/sales/ReviewList";
import type { ReviewItem } from "@/lib/data/sales-source";
import { listReviewAction } from "@/lib/sales/review-actions";

function Header() {
  return (
    <div className="bg-turquesa-texto px-5 pb-8 pt-6 text-white">
      <Link href="/ventas" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold underline-offset-4 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />
        Ventas
      </Link>
      <h1 className="text-lg font-extrabold leading-tight">Ventas sin internet por aprobar</h1>
    </div>
  );
}

function OwnerReview() {
  const { state, data, retry } = useStaffData<ReviewItem[]>(() => listReviewAction());
  if (state !== "ready") return <StaffLoadState state={state} retry={retry} />;
  return (
    <main className="mx-auto max-w-2xl pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Header />
      <div className="-mt-3 space-y-3 rounded-t-2xl bg-niebla px-4 pb-6 pt-4">
        <ReviewList items={data ?? []} onChanged={retry} />
      </div>
    </main>
  );
}

export default function RevisionPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  if (status === "loading" || !role) return <StaffLoadState state="loading" retry={() => undefined} />;
  if (role !== "owner") {
    return (
      <main className="mx-auto max-w-2xl pb-8">
        <Header />
        <p role="alert" className="m-4 rounded-[11px] bg-white p-3 text-sm font-bold text-agotado">
          Solo el dueño aprueba ventas sin internet.
        </p>
      </main>
    );
  }
  return <OwnerReview />;
}
