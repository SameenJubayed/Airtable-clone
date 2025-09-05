
// app/baseComponents/grid/tableView.tsx
"use client";

import { useMemo, useCallback, type Dispatch, type SetStateAction } from "react";
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
  // wrapper so tanstack can pass either a value or an updater without recreating a new function each render
  const handleColumnSizingChange = useCallback(
    (updater: SetStateAction<ColumnSizingState>) => {
      setColumnSizing(updater);
    },
    [setColumnSizing]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // for column resizing
    columnResizeMode: "onChange",
    state: { columnSizing },
    onColumnSizingChange: handleColumnSizingChange,
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

        <thead 
          className={[
            "sticky top-0 z-10 bg-white",
            // fixing the "sticky header + boarder-collapse" bug using after: 
            // (missing row border between body and header) 
            "relative after:content-[''] after:absolute",
            "after:left-0 after:right-0 after:bottom-0 after:h-0 after:bg-gray-200"
          ].join(" ")}
        >
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h, colIdx) => (
                <th
                  key={h.id}
                  className={[
                    "relative px-3",         
                    // uniform borders like body
                    "border border-gray-300",
                    // remove top border (avoid thicker top edge)
                    "border-t-0",
                    // remove left border on first column (avoid thicker left edge)
                    colIdx === 0 ? "border-l-0" : "",
                    // header text style
                    "text-left text-sm font-medium text-gray-700",
                    "bg-white",
                  ].join(" ")}
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
            <tr key={r.id} className="bg-white">
              {r.getVisibleCells().map((c, colIdx) => (
                <td 
                  key={c.id} 
                  className={[
                    "relative p-0 align-middle",
                    "border border-gray-300",
                     colIdx === 0 ? "border-l-0" : "",
                     "text-sm"
                  ].join(" ")}
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
