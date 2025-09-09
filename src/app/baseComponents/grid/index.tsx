// app/baseComponents/grid/index.tsx
"use client";
import {
  useGridData,
  useColumnSizingState, 
  useEditingKey, 
  useOptimisticUpdateCell, 
} from "./hooks";
import { useDynamicColumns, useRowNumberColumn } from "./columns";
import TableView from "./tableView";
import { isCuid } from "./isCuid";

// ...imports stay the same, but REMOVE all the action-bar UI and related state
export default function BaseGrid({ tableId }: { tableId: string }) {
  const { columnsQ, rowsQ, data } = useGridData(tableId);
  const { columnSizing, setColumnSizing } = useColumnSizingState();
  const { editingKey, setEditingKey } = useEditingKey();
  const updateCell = useOptimisticUpdateCell(tableId, rowsQ);

  const rowNumCol = useRowNumberColumn();
  const dynamicCols = useDynamicColumns({
    columnsData: columnsQ.data?.map((c) => ({ id: c.id, name: c.name, type: c.type, width: c.width })),
    editingKey, setEditingKey, updateCell, tableId,
  });

  // keep your column width init + debounce save effects here unchanged...

  const columns = [rowNumCol, ...dynamicCols];
  const loading = columnsQ.isLoading || rowsQ.isLoading;
  const creatingOptimistic = !isCuid(tableId);

  if (creatingOptimistic) return <div className="p-4 text-sm text-gray-500">Creating table…</div>;

  return loading ? (
    <div className="p-4 text-sm text-gray-500">Loading grid…</div>
  ) : (
    <TableView
      tableId={tableId}
      data={data}
      columns={columns}
      columnSizing={columnSizing}
      setColumnSizing={setColumnSizing}
    />
  );
}
