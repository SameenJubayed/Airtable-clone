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
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900">
      {/* Rail owns the extreme top-left corner */}
      <BaseSidebar baseId={base.id} />

      {/* Header sits underneath the rail at the left (padding-left prevents overlap) */}
      <BaseHeader baseId={base.id} initialName={base.name} />

      {/* Content: account for both header (top) and rail (left) */}
      <main className="pt-14 pl-14 h-[calc(100vh-56px)] overflow-auto">
        {children}
      </main>
    </div>
  );
}
