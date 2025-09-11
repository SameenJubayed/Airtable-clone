// app/baseComponents/grid/tableView.tsx
"use client";

import { useMemo, useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ColumnSizingState } from "@tanstack/react-table";
import type { CellRecord, ColMeta } from "./types";
import { ROW_H, ADD_FIELD_W, MIN_COL_W } from "./constants";
import AddFieldButton from "./AddFieldButton";
import Portal from "./Portal";
import { useOptimisticInsertRow, useOptimisticDeleteRow, useRowHeight } from "./hooks";
import { useFloatingForAnchor, useCloseOnOutside, MenuItem } from "./uiPopover";
// UI
import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardOutlinedIcon from '@mui/icons-material/ArrowUpwardOutlined';
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined';
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

type Props = {
  tableId: string;  
  viewId?: string; 
  data: CellRecord[];
  columns: ColumnDef<CellRecord, unknown>[];
  columnSizing: ColumnSizingState;
  setColumnSizing: Dispatch<SetStateAction<ColumnSizingState>>;
};

// row context menu (insert above/below, delete)
function RowMenu({
  open,
  anchorEl,
  onClose,
  onInsertAbove,
  onInsertBelow,
  onDelete,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void; 
}) {
  const { x, y, strategy, refs } = useFloatingForAnchor(
    anchorEl,
    open,
    "right-start",
  );

  // close on ESC / outside
  const panelRef = { current: null as HTMLDivElement | null };
  useCloseOnOutside(open, onClose, panelRef, anchorEl ?? undefined);

  if (!open || !anchorEl) return null;

  return (
    <Portal>
      <div
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        data-menulayer="true"
        role="menu"
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[2000] py-1"
        style={{ position: strategy, top: y , left: x , width: 200 }}
      >
        <MenuItem
          onClick={() => {
            onInsertAbove();
            onClose();
          }}
          className="flex items-center"
        >
          <ArrowUpwardOutlinedIcon fontSize="small" className="text-gray-500 mr-2" />
          Insert row above
        </MenuItem>
        <MenuItem
          onClick={() => {
            onInsertBelow();
            onClose();
          }}
          className="flex items-center"
        >
          <ArrowDownwardOutlinedIcon fontSize="small" className="text-gray-500 mr-2" />
          Insert row below
        </MenuItem>

        <div className="my-1 mx-2 border-t border-gray-200" />

        <MenuItem
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="flex items-center text-red-500"
        >
          <DeleteOutlineOutlinedIcon fontSize="small" className="text-gray-500 mr-2" />
          Delete row
        </MenuItem>
      </div>
    </Portal>
  );
}

export default function TableView({ 
  tableId,
  viewId,
  data, 
  columns, 
  columnSizing, 
  setColumnSizing
}: Props) {  
  const { insertAtEnd, insertAbove, insertBelow } = useOptimisticInsertRow(tableId, viewId);
  const { deleteByIndex } = useOptimisticDeleteRow(tableId, viewId); 

  // right-click menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuRowIndex, setMenuRowIndex] = useState<number | null>(null);
  const { rowHeight } = useRowHeight(tableId);

  // column resizing control innit brev cmon now 
  const handleColumnSizingChange = useCallback(
    (updater: SetStateAction<ColumnSizingState>) => {
      setColumnSizing((prev) => {
        const next =
          typeof updater === "function" 
            ? (updater as (s: ColumnSizingState) => ColumnSizingState)(prev) 
            : updater;
        const clamped: ColumnSizingState = {};
        for (const [colId, w] of Object.entries(next)) {
          // TanStack stores widths as numbers; ensure number + clamp
          const n = Math.max(MIN_COL_W, Math.round(Number(w)));
          clamped[colId] = n;
        }
        return clamped;
      });
    },
    [setColumnSizing]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // for column resizing
    columnResizeMode: "onChange", // fire updates as user drags
    state: { columnSizing }, // controlled state
    onColumnSizingChange: handleColumnSizingChange, // updates our state and sets min 60px width
    defaultColumn: { minSize: MIN_COL_W },  // enforce min size
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
              {hg.headers.map((h, colIdx) => {
                const thExtra =
                  ((h.column.columnDef as { meta?: ColMeta }).meta?.thClassName) ?? "";
                return (
                  <th
                    key={h.id}
                    className={[
                      "relative",         
                      // uniform borders like body
                      "border border-gray-300",
                      // remove top border (avoid thicker top edge)
                      "border-t-0",
                      // remove left border on first column (avoid thicker left edge)
                      colIdx === 0 ? "border-l-0" : "",
                      // header text style
                      "text-left text-sm font-medium text-gray-700",
                      "bg-white",
                      thExtra // applying column meta to <th>
                    ].join(" ")}
                    style={{ height: ROW_H }}
                  >
                    {h.isPlaceholder 
                      ? null 
                      : flexRender(h.column.columnDef.header, h.getContext())}
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
                );
              })}
              {/* Add field header cell */}
              <th
                className="border border-gray-300 border-t-0 px-0 bg-white"
                style={{ height: ROW_H, width: ADD_FIELD_W }}
              >
                <AddFieldButton tableId={tableId} />
              </th>
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((r, rowIdx) => (
            <tr key={r.id} className="bg-white hover:bg-gray-50">
              {r.getVisibleCells().map((c, colIdx) => {
                const tdExtra =
                  ((c.column.columnDef as { meta?: ColMeta }).meta?.tdClassName) ?? "";
                const isRowNumberCell = colIdx === 0;
                return (
                  <td 
                    key={c.id} 
                    className={[
                      "relative p-0 align-middle",
                      "text-sm border border-gray-300",
                      colIdx === 0 ? "border-l-0" : "",
                      tdExtra
                    ].join(" ")}
                    style={{ height: rowHeight }}
                    onContextMenu={
                      isRowNumberCell
                        ? (e) => {
                            e.preventDefault();
                            setMenuAnchor(e.currentTarget as HTMLElement);
                            setMenuRowIndex(rowIdx);
                            setMenuOpen(true);
                          }
                        : undefined
                    }
                    title={isRowNumberCell ? "Right-click for row menu" : undefined}
                  >
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* + (add row) footer row */}
          <tr
            className="bg-white hover:bg-gray-100 cursor-pointer select-none"
            onClick={() => insertAtEnd()}
          >
            <td
              colSpan={leafCols.length}
              className={[
                // one border around the whole row (match the grid’s look)
                "border border-gray-300 border-l-0",
                // no padding; we’ll vertically center with a wrapper
                "p-0",
              ].join(" ")}
              style={{ height: ROW_H }}
            >
              <div className="h-full flex">
                {/* plus icon only, no box/border */}
                <span className="mx-2 inline-flex items-center justify-center">
                  <AddIcon fontSize="small" className="text-gray-500" />
                </span>
              </div>
            </td>
          </tr>

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

      {/* Floating UI row menu (aligned to left/top of the row-number cell) */}
      <RowMenu
        open={menuOpen}
        anchorEl={menuAnchor}
        onClose={() => setMenuOpen(false)}
        onInsertAbove={() => {
          if (menuRowIndex == null) return;
          insertAbove(menuRowIndex);
        }}
        onInsertBelow={() => {
          if (menuRowIndex == null) return;
          insertBelow(menuRowIndex);
        }}
        onDelete={() => {
          if (menuRowIndex == null) return;
          deleteByIndex(menuRowIndex);
        }}
      />
    </div>
  );
}
