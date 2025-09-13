// app/baseComponents/grid/index.tsx
"use client";
import { useEffect, useMemo } from "react";
import {
  useColumnSizingState, 
  useEditingKey, 
  useOptimisticUpdateCell,
  useInfiniteRows,
  useOptimisticInsertRow,
  useOptimisticDeleteRow, 
} from "./hooks";
import { useDynamicColumns, useRowNumberColumn } from "./columns";
import TableView from "./tableView";
import { useViews } from "../ViewsLayout";
import { api } from "~/trpc/react";
import { PAGE_TAKE } from "./constants";

export default function BaseGrid({ tableId, viewId }: { tableId: string; viewId: string | null }) {
  // columns query
  const columnsQ = api.column.listByTable.useQuery({ tableId });

  // infinite rows (replaces rowsQ/data from useGridData)
  const rowsQ = useInfiniteRows({ tableId, viewId: viewId ?? undefined, take: PAGE_TAKE });
  const data = rowsQ.records;

  const { columnSizing, setColumnSizing } = useColumnSizingState();
  const { editingKey, setEditingKey } = useEditingKey();
  const { insertAtEnd, insertAbove, insertBelow } = useOptimisticInsertRow(tableId, viewId ?? undefined, PAGE_TAKE);
  const updateCell = useOptimisticUpdateCell(tableId, viewId ?? undefined, PAGE_TAKE);
  const { deleteById } = useOptimisticDeleteRow(tableId, viewId ?? undefined, PAGE_TAKE);

  const { searchQ, switchingViewId, setSwitchingViewId } = useViews();
  const rowIds = useMemo(() => data.map((r) => r.rowId), [data]);

  // Ask server for matches only when we have a query and rows loaded
  const matchesQ = api.row.searchMatches.useQuery(
    { tableId, q: searchQ, rowIds },
    { enabled: !!searchQ.trim() && rowIds.length > 0 }
  );
  const matchSet = useMemo(() => {
    const hits = matchesQ.data?.matches ?? [];
    return new Set(hits.map((m) => `${m.rowId}|${m.columnId}`));
  }, [matchesQ.data?.matches]);

  // hidden columns from view
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

  const rowNumCol = useRowNumberColumn();
  const dynamicCols = useDynamicColumns({
    columnsData: columnsQ.data
      ?.filter(c => !hiddenIds.includes(c.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        width: c.width,
        position: c.position, 
      })),
    editingKey,
    setEditingKey,
    updateCell,
    tableId,
    matchSet,
    viewId: viewId ?? undefined,
    pageTake: PAGE_TAKE
  });

  // view-switch–aware loading
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
      pageTake={PAGE_TAKE}
      data={data}
      columns={[rowNumCol, ...dynamicCols]}
      columnSizing={columnSizing}
      setColumnSizing={setColumnSizing}
      fetchNextPage={rowsQ.fetchNextPage}
      hasNextPage={rowsQ.hasNextPage}
      isFetchingNextPage={rowsQ.isFetchingNextPage}
      // optimistic actions (rowId-based)
      onInsertAtEnd={insertAtEnd}
      onInsertAbove={insertAbove}
      onInsertBelow={insertBelow}
      onDeleteRow={deleteById}
    />
  );
}
