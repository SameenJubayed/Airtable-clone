// app/base/[baseId]/table/[tableId]/layout.tsx
import { type ReactNode } from "react";
import TableTabs from "~/app/baseComponents/tabs";
import TableActionBar from "~/app/baseComponents/TableActionBar";
import ViewsLayout from "~/app/baseComponents/ViewsLayout";

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

      <ViewsLayout tableId={tableId}>
        {/* child[0] → action bar (controls sidebar) */}
        <TableActionBar tableId={tableId} />
        {/* child[1] → the scrolling region */}
        <main className="min-h-0 flex-1 overflow-auto">
          {children}
        </main>
      </ViewsLayout>
    </div>
  );
}