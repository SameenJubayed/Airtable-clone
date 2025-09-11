// app/base/[baseId]/layout.tsx
import { type ReactNode } from "react";
import { api } from "~/trpc/server";
import BaseHeader from "../../baseComponents/BaseHeader";
import BaseSidebar from "../../baseComponents/BaseSidebar";

export default async function BaseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ baseId: string }>;
}) {
  const { baseId } = await params;
  const base = await api.base.get({ baseId });

  return (
    // Own the viewport and prevent body scrolling
    <div className="h-screen overflow-hidden bg-[#f6f7f9] text-gray-900">
      <BaseSidebar baseId={base.id} />   {/* fixed 56px wide */}
      <BaseHeader baseId={base.id} initialName={base.name} /> {/* fixed 56px tall */}

      {/* Offset for header+rail, and give the remaining area a real height */}
      <main className="pl-14 pt-14 h-full min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
