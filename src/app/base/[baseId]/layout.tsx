// app/base/[baseId]/layout.tsx
import { type ReactNode } from "react";
import { api } from "~/trpc/server";
import BaseHeader from "../../baseComponents/BaseHeader";
import BaseSidebar from "../../baseComponents/BaseSidebar";

type Props = {
  children: ReactNode;
  params: { baseId: string };
};

export default async function BaseLayout({ children, params }: Props) {
  const base = await api.base.get({ baseId: params.baseId }); // auth happens in router

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900">
      {/* Rail owns the extreme top-left corner */}
      <BaseSidebar />

      {/* Header sits underneath the rail at the left (padding-left prevents overlap) */}
      <BaseHeader baseId={base.id} initialName={base.name} />

      {/* Content: account for both header (top) and rail (left) */}
      <main className="pt-14 pl-14">{children}</main>
    </div>
  );
}
