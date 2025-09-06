// app/baseComponents/grid/columns.tsx
"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CellRecord, EditingKey, ColMeta } from "./types";
import { COL_W, MIN_COL_W, ROWNUM_W } from "./constants";
import type { api } from "~/trpc/react";

type MakeColsArgs = {
  columnsData: { id: string; name: string; type: "TEXT" | "NUMBER" }[] | undefined;
  editingKey: EditingKey;
  setEditingKey: (k: EditingKey) => void;
  updateCell: ReturnType<typeof api.row.updateCell.useMutation>;
};

export function useRowNumberColumn(): ColumnDef<CellRecord, unknown> {
  return useMemo<ColumnDef<CellRecord, unknown>>(
    () => ({
      id: "__rownum",
      header: () => <span className="text-gray-500 flex items-center justify-center">#</span>,
      size: ROWNUM_W,
      maxSize: ROWNUM_W,
      enableResizing: false,
      cell: (ctx) => (
        <div className="
          w-full h-full flex items-center justify-center
          text-gray-500 select-none">
          {ctx.row.index + 1}
        </div>
      ),
      // no right border for this column (both th & td)
      meta: {
        tdClassName: "border-r-0",
        thClassName: "border-r-0",
      } as ColMeta,
    }),
    [],
  );
}

export function useDynamicColumns({
  columnsData,
  editingKey,
  setEditingKey,
  updateCell,
}: MakeColsArgs) {
  return useMemo<ColumnDef<CellRecord, unknown>[]>(() => {
    if (!columnsData) return [];
    return columnsData.map((col, idx) => ({
      id: col.id,
      header: () => (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="font-bold truncate">{col.name}</span>
        </div>
      ),
      // tell TanStack to read row[col.id] for this column's value
      accessorKey: col.id,
      // defaul col width 180
      size: COL_W,
      // min possible size 60
      minSize: MIN_COL_W,
      meta: (idx === 0
        ? { tdClassName: "border-l-0", thClassName: "border-l-0" }
        : {}) as ColMeta,

      cell: (ctx) => {
        const rowId = ctx.row.original.rowId;
        const columnId = col.id;
        const value = ctx.getValue() as string | number | null | undefined;
        // boolean, check if cell is being edited
        const isEditing = editingKey?.rowId === rowId && editingKey?.columnId === columnId;

        if (!isEditing) {
          return (
            <div
              className="w-full h-8 px-3 flex items-center whitespace-nowrap overflow-hidden text-ellipsis"
              onDoubleClick={() => setEditingKey({ rowId, columnId })}
              title={value == null ? "" : String(value)}
            >
              {value ?? ""}
            </div>
          );
        }

        const type = col.type;
        return (
          <input
            autoFocus
            type={type === "NUMBER" ? "number" : "text"}
            defaultValue={value === null || value === undefined ? "" : String(value)}
            className="
              absolute inset-0 block w-full h-full box-border 
              px-3 
              outline-none border-0 ring-1 ring-inset ring-gray-300 
              focus:ring-2 focus:ring-indigo-500 
              rounded-none bg-white
            "
            onBlur={(e) => {
              const raw = e.currentTarget.value;
              setEditingKey(null);
              if (type === "NUMBER") {
                const num = raw === "" ? null : Number(raw);
                updateCell.mutate({
                  rowId,
                  columnId,
                  numberValue: Number.isNaN(num) ? null : num,
                });
              } else {
                const txt = raw.trim();
                updateCell.mutate({
                  rowId,
                  columnId,
                  textValue: txt === "" ? null : txt,
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        );
      },
    }));
  }, [columnsData, editingKey, setEditingKey, updateCell]);
}
