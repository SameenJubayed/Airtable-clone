// app/baseComponents/grid/tableView.tsx
"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ColumnSizingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CellRecord, ColMeta } from "./types";
import { ROW_H, ADD_FIELD_W, MIN_COL_W } from "./constants";
import AddFieldButton from "./AddFieldButton";
import Portal from "./Portal";
import { useRowHeight } from "./hooks";
import { useFloatingForAnchor, useCloseOnOutside, MenuItem } from "./uiPopover";
// UI
import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardOutlinedIcon from '@mui/icons-material/ArrowUpwardOutlined';
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined';
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

type Props = {
  tableId: string;  
  viewId?: string; 
  pageTake: number;
  data: CellRecord[];
  columns: ColumnDef<CellRecord, unknown>[];
  // column sizing
  columnSizing: ColumnSizingState;
  setColumnSizing: Dispatch<SetStateAction<ColumnSizingState>>;
  // infinite scrolling
  fetchNextPage?: () => Promise<unknown>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  // optimistic actions (rowId-based)
  onInsertAtEnd: () => void;
  onInsertAbove: (rowId: string) => void;
  onInsertBelow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
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
  pageTake,
  data,
  columns,
  columnSizing,
  setColumnSizing,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  onInsertAtEnd,
  onInsertAbove,
  onInsertBelow,
  onDeleteRow,
}: Props) { 
  // right-click menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
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

  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });  
  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop =
    virtualRows.length > 0 ? virtualRows[0]!.start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
      : 0;

  // prefetch next page when near the bottom
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;

    const remaining = rows.length - 1 - last.index;
    if (remaining < 20) void fetchNextPage?.();
  }, [rows.length, hasNextPage, isFetchingNextPage, fetchNextPage, virtualRows]);

  return (
    <div ref={parentRef} className="overflow-auto">
      <table className="border-collapse table-fixed inline-table" style={{ width: totalWidth }}>
        <colgroup>
          {leafCols.map((col) => (
            <col key={col.id} style={{ width: col.getSize() }} />
          ))}
        </colgroup>

        {/* header unchanged */}
        <thead className={[
          "sticky top-0 z-10 bg-white",
          "relative after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0 after:bg-gray-200"
        ].join(" ")}>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h, colIdx) => {
                const thExtra = ((h.column.columnDef as { meta?: ColMeta }).meta?.thClassName) ?? "";
                return (
                  <th
                    key={h.id}
                    className={[
                      "relative border border-gray-300",
                      "border-t-0",
                      colIdx === 0 ? "border-l-0" : "",
                      "text-left text-sm font-medium text-gray-700 bg-white",
                      thExtra,
                    ].join(" ")}
                    style={{ height: ROW_H }}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getCanResize() && (
                      <div
                        onMouseDown={h.getResizeHandler()}
                        onTouchStart={h.getResizeHandler()}
                        className="absolute top-0 right-0 h-full w-1 cursor-col-resize select-none hover:bg-indigo-400/50 active:bg-indigo-500"
                      />
                    )}
                  </th>
                );
              })}
              <th
                className="border border-gray-300 border-t-0 px-0 bg-white"
                style={{ height: ROW_H, width: ADD_FIELD_W }}
              >
                <AddFieldButton tableId={tableId} viewId={viewId} pageTake={pageTake} />
              </th>
            </tr>
          ))}
        </thead>

        <tbody>
          {/* TOP spacer */}
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={leafCols.length} className="p-0 border-0" style={{ height: paddingTop }} />
            </tr>
          )}

          {/* VIRTUAL ROWS */}
          {virtualRows.map((vi) => {
            const r = rows[vi.index];
            if (!r) return null;
            const rowId = r.original.rowId; // <-- get rowId from original data

            return (
              <tr key={r.id} className="bg-white hover:bg-gray-50">
                {r.getVisibleCells().map((c, colIdx) => {
                  const tdExtra = ((c.column.columnDef as { meta?: ColMeta }).meta?.tdClassName) ?? "";
                  const isRowNumberCell = colIdx === 0;
                  return (
                    <td
                      key={c.id}
                      className={[
                        "relative p-0 align-middle",
                        "text-sm border border-gray-300",
                        colIdx === 0 ? "border-l-0" : "",
                        tdExtra,
                      ].join(" ")}
                      style={{ height: rowHeight }}
                      onContextMenu={
                        isRowNumberCell
                          ? (e) => {
                              e.preventDefault();
                              setMenuAnchor(e.currentTarget as HTMLElement);
                              setMenuRowId(rowId);
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
            );
          })}

          {/* BOTTOM spacer */}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={leafCols.length} className="p-0 border-0" style={{ height: paddingBottom }} />
            </tr>
          )}

          {/* + (add row) footer row – outside virtual range */}
          <tr
            className="bg-white hover:bg-gray-100 cursor-pointer select-none"
            onClick={() => onInsertAtEnd()}
          >
            <td
              colSpan={leafCols.length}
              className="border border-gray-300 border-l-0 p-0"
              style={{ height: ROW_H }}
            >
              <div className="h-full flex">
                <span className="mx-2 inline-flex items-center justify-center">
                  <AddIcon fontSize="small" className="text-gray-500" />
                </span>
              </div>
            </td>
          </tr>

          {/* tiny loader while fetching next page (optional) */}
          {isFetchingNextPage && (
            <tr>
              <td colSpan={leafCols.length} className="py-2 text-center text-xs text-gray-500">
                Loading more…
              </td>
            </tr>
          )}

          {/* empty state */}
          {data.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-sm text-gray-500 border-gray-400" colSpan={columns.length || 1}>
                No rows yet. Click “Add row”.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <RowMenu
        open={menuOpen}
        anchorEl={menuAnchor}
        onClose={() => setMenuOpen(false)}
        onInsertAbove={() => {
          if (menuRowId == null) return;
          onInsertAbove(menuRowId);
        }}
        onInsertBelow={() => {
          if (menuRowId == null) return;
          onInsertBelow(menuRowId);
        }}
        onDelete={() => {
          if (menuRowId == null) return;
          onDeleteRow(menuRowId);
        }}
      />
    </div>
  );
}
