// app/baseComponents/grid/index.tsx
"use client";
import { useEffect, useMemo } from "react";
import {
  useGridData,
  useColumnSizingState, 
  useEditingKey, 
  useOptimisticUpdateCell, 
} from "./hooks";
import { useDynamicColumns, useRowNumberColumn } from "./columns";
import TableView from "./tableView";
import { useViews } from "../ViewsLayout";
import { api } from "~/trpc/react";

export default function BaseGrid({ tableId, viewId }: { tableId: string; viewId: string | null }) {
  const { columnsQ, rowsQ, data } = useGridData(tableId, viewId ?? undefined);
  const { columnSizing, setColumnSizing } = useColumnSizingState();
  const { editingKey, setEditingKey } = useEditingKey();
  const updateCell = useOptimisticUpdateCell(tableId, viewId ?? undefined);

  const viewsQ = api.view.listByTable.useQuery({ tableId });

  const hiddenIds = useMemo<string[]>(() => {
    const list = viewsQ.data ?? [];
    const active =
      (viewId && list.find(v => v.id === viewId)) ??
      list.find(v => v.name === "Grid view") ??
      list[0];
    const raw = (active as { hidden?: unknown } | undefined)?.hidden;
    return Array.isArray(raw)
      ? (raw as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
  }, [viewsQ.data, viewId]);

  const searchTerm = useMemo(() => {
    const list = viewsQ.data ?? [];
    const active =
      (viewId && list.find(v => v.id === viewId)) ??
      list.find(v => v.name === "Grid view") ??
      list[0];
    const raw = (active as { search?: unknown } | undefined)?.search;
    return typeof raw === "string" ? raw : "";
  }, [viewsQ.data, viewId]);

  const rowNumCol = useRowNumberColumn();
  const dynamicCols = useDynamicColumns({
    columnsData: columnsQ.data
      ?.filter(c => !hiddenIds.includes(c.id))             
      .map(c => ({ id: c.id, name: c.name, type: c.type, width: c.width })),
    editingKey, setEditingKey, updateCell, tableId, searchTerm
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
