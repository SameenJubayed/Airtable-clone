// app/(dashboard)/home/Bases.tsx
"use client";

import { api } from "~/trpc/react";
import { BaseCard } from "../../_components/BaseCard";

export default function UserBases() {
  // prevent refetches during navigation by turning off focus/reconnect refetches:
  const { data, isLoading } = api.base.listMine.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return (
    <>
      <h2 className="mb-3 text-xl font-semibold">Bases</h2>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="h-[88px] rounded-xl border border-gray-200 bg-white/60" />
        )}
        {data?.map((b) => <BaseCard key={b.id} id={b.id} name={b.name} updatedAt={b.lastOpenedAt} starred={b.starred} />)}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="text-sm text-gray-500">No bases yet.</div>
        )}
      </section>
    </>
  );
}
