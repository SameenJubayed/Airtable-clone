
// app/baseComponents/grid/TableView.tsx
"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { 
  flexRender, 
  getCoreRowModel, 
  useReactTable, 
  type ColumnDef, 
  type ColumnSizingState,
} from "@tanstack/react-table";
import type { CellRecord } from "./types";
import { ROW_H } from "./constants";

type Props = {
  data: CellRecord[];
  columns: ColumnDef<CellRecord, unknown>[];
  columnSizing: ColumnSizingState;
  setColumnSizing: Dispatch<SetStateAction<ColumnSizingState>>;
};

export default function TableView({ data, columns, columnSizing, setColumnSizing }: Props) {  
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // for column resizing
    columnResizeMode: "onChange",
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
  });

  // compute widths once per render from TanStack
  const leafCols = table.getVisibleLeafColumns();
  const totalWidth = useMemo(
    () => leafCols.reduce((sum, col) => sum + col.getSize(), 0),
    [leafCols]
  );

  return (
    <div className="overflow-auto">
      <table 
        className="border-collapse table-fixed inline-table" 
        style={{ width: totalWidth }}
      >
        {/* Set column widths */}
        <colgroup>
          {leafCols.map((col) => (
            <col key={col.id} style={{ width: col.getSize() }} />
          ))}
        </colgroup>

        <thead className="sticky top-0 z-10 bg-white">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="
                    relative border border-gray-300 
                    px-3 py-2 
                    text-left text-sm 
                    font-medium text-gray-700
                  "
                  style={{ height: ROW_H }}
                >
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  {/* Resizer handle */}
                  {h.column.getCanResize() && (
                    <div
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      className="
                        absolute top-0 right-0 h-full w-1 
                        cursor-col-resize select-none 
                        hover:bg-indigo-400/50 
                        active:bg-indigo-500
                      "
                    />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="even:bg-gray-50/40">
              {r.getVisibleCells().map((c) => (
                <td 
                  key={c.id} 
                  className="relative border border-gray-200 p-0 align-middle" 
                  style={{ height: ROW_H }}
                >
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {/* empty-state filler */}
          {data.length === 0 && (
            <tr>
              <td 
              className="px-3 py-6 text-sm text-gray-500 border-gray-400" 
              colSpan={columns.length || 1}
              >
                No rows yet. Click “Add row”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
