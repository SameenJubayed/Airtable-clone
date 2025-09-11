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
    // Fills the height provided by BaseLayout <main>
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[#f6f7f9] text-gray-900">
      <div className="shrink-0">
        <TableTabs baseId={baseId} activeTableId={tableId} />
      </div>

      <ViewsLayout tableId={tableId}>
        <TableActionBar tableId={tableId} />
        <main className="flex-1 min-h-0 overflow-auto">
          {children}
        </main>
      </ViewsLayout>
    </div>
  );
}
