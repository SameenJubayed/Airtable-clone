// app/baseComponents/grid/index.tsx
"use client";

import AddIcon from "@mui/icons-material/Add";
// If you prefer separate imports:
import { useGridData, useColumnSizingState, useEditingKey, useOptimisticCreateRow, useOptimisticUpdateCell } from "./hooks";
import { useDynamicColumns, useRowNumberColumn } from "./columns";

import TableView from "./tableView";

export default function BaseGrid({ tableId }: { tableId: string }) {
  const { key, columnsQ, rowsQ, data } = useGridData(tableId);
  const { columnSizing, setColumnSizing } = useColumnSizingState();
  const { editingKey, setEditingKey } = useEditingKey();

  const updateCell = useOptimisticUpdateCell(tableId, rowsQ);
  const createRow = useOptimisticCreateRow(tableId, columnsQ, rowsQ);

  const rowNumCol = useRowNumberColumn();
  const dynamicCols = useDynamicColumns({
    columnsData: columnsQ.data?.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    editingKey,
    setEditingKey,
    updateCell,
  });

  const columns = [rowNumCol, ...dynamicCols];

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Top bar: table name area & add row */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div className="text-sm text-gray-600">Grid view</div>
        <button
          onClick={() => createRow.mutate({ tableId })}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
        >
          <AddIcon fontSize="small" />
          Add row
        </button>
      </div>

      <TableView
        data={data}
        columns={columns}
        columnSizing={columnSizing}
        setColumnSizing={setColumnSizing}
      />
    </div>
  );
}
