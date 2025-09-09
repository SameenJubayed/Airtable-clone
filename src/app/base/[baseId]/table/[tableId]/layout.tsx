// app/base/[baseId]/table/[tableId]/layout.tsx
import { type ReactNode } from "react";
import TableTabs from "./tabs";
import TableActionBar from "~/app/baseComponents/grid/TableActionBar";

export default async function TableLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ baseId: string; tableId: string }>;
}) {
  const { baseId, tableId } = await params;

return (
    <div className="h-full bg-[#f6f7f9] text-gray-900 flex flex-col overflow-hidden">
      <div className="shrink-0">
        <TableTabs baseId={baseId} activeTableId={tableId} />
      </div>

      {/* Action bar pinned under tabs */}
      <div className="shrink-0">
        <TableActionBar tableId={tableId} />
      </div>

      {/* Only this region scrolls */}
      <main className="min-h-0 flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
