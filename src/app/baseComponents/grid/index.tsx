// app/baseComponents/grid/index.tsx
"use client";
import { useEffect } from "react";
import {
  useGridData,
  useColumnSizingState, 
  useEditingKey, 
  useOptimisticUpdateCell, 
} from "./hooks";
import { useDynamicColumns, useRowNumberColumn } from "./columns";
import TableView from "./tableView";
import { useViews } from "../ViewsLayout";

export default function BaseGrid({ tableId, viewId }: { tableId: string; viewId: string | null }) {
  const { columnsQ, rowsQ, data } = useGridData(tableId, viewId ?? undefined);
  const { columnSizing, setColumnSizing } = useColumnSizingState();
  const { editingKey, setEditingKey } = useEditingKey();
  const updateCell = useOptimisticUpdateCell(tableId, viewId ?? undefined);

  const rowNumCol = useRowNumberColumn();
  const dynamicCols = useDynamicColumns({
    columnsData: columnsQ.data?.map((c) => ({ id: c.id, name: c.name, type: c.type, width: c.width })),
    editingKey, setEditingKey, updateCell, tableId,
  });


  // view-switch–aware loading
  const { switchingViewId, setSwitchingViewId } = useViews();
  const switching = switchingViewId != null && switchingViewId === (viewId ?? null);

  // Show loader only when:
  //  - initial load OR
  //  - we are in the middle of a view switch AND the new rows aren’t ready yet
  const showLoader =
    columnsQ.isLoading ||
    rowsQ.isLoading ||
    (switching && (rowsQ.status !== "success" || rowsQ.fetchStatus === "fetching"));

  // Once the new view’s rows are ready, clear the “switching” flag
  useEffect(() => {
    if (switching && rowsQ.status === "success" && rowsQ.fetchStatus !== "fetching") {
      setSwitchingViewId(null);
    }
  }, [switching, rowsQ.status, rowsQ.fetchStatus, setSwitchingViewId]);

  if (showLoader) {
    return <div className="p-4 text-sm text-gray-500">Loading grid…</div>;
  }

  return (
    <TableView
      tableId={tableId}
      viewId={viewId ?? undefined}
      data={data}
      columns={[rowNumCol, ...dynamicCols]}
      columnSizing={columnSizing}
      setColumnSizing={setColumnSizing}
    />
  );
}
