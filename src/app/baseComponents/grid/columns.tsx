// app/baseComponents/grid/columns.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CellRecord, EditingKey, ColMeta } from "./types";
import { COL_W, MIN_COL_W, ROWNUM_W } from "./constants";
import { useOptimisticAddColumn } from "./hooks";
import ColumnHeaderMenu from "./ColumnHeaderMenu";
import FieldPanel from "./FieldPanel";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api } from "~/trpc/react";

type MakeColsArgs = {
  columnsData: { id: string; name: string; type: "TEXT" | "NUMBER"; width: number }[] | undefined;
  editingKey: EditingKey;
  setEditingKey: (k: EditingKey) => void;
  updateCell: ReturnType<typeof api.row.updateCell.useMutation>;
  tableId?: string;
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

function HeaderWithMenu({tableId, col, position}: {
  tableId: string;
  col: { id: string; name: string; type: "TEXT" | "NUMBER" };
  position: number;
}) {
  const utils = api.useUtils();
  const del = api.column.delete.useMutation();

  const addColumn = useOptimisticAddColumn(tableId, {
    onOptimisticApplied: () => setPanel(null),
  });

  const ref = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<null | { mode: "create" | "edit"; align: "leftEdge" | "rightEdge"; pos?: number }>(null);

  const rect = ref.current?.getBoundingClientRect() ?? null;

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        className={[
          "flex items-center justify-between overflow-hidden",
          hover ? "bg-gray-100" : "",
        ].join(" ")}
      >
        <span className="font-bold truncate pl-2">{col.name}</span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={[
            "shrink-0 inline-flex items-center justify-center h-8 rounded",
            hover ? "opacity-100" : "opacity-0",
            "transition-opacity cursor-pointer",
          ].join(" ")}
          aria-label="Field menu"
          title="Field menu"
        >
          <ExpandMoreIcon fontSize="small" />
        </button>
      </div>

      <ColumnHeaderMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRect={rect}
        // column={{ ...col, position }}
        onEdit={() => setPanel({ mode: "edit", align: "leftEdge" })}
        onInsertLeft={() => setPanel({ mode: "create", align: "leftEdge", pos: position })}
        onInsertRight={() => setPanel({ mode: "create", align: "rightEdge", pos: position + 1 })}
        onDelete={async () => {
          await del.mutateAsync({ columnId: col.id });
          await utils.column.listByTable.invalidate({ tableId });
          await utils.row.list.invalidate({ tableId, skip: 0, take: 200 });
        }}
        // Optional stubs (wire when you implement)
        onDuplicate={undefined}
        onSortAsc={undefined}
        onSortDesc={undefined}
        onFilter={undefined}
        onHide={undefined}
      />

      {panel && (
        <FieldPanel
          tableId={tableId}
          open
          onClose={() => setPanel(null)}
          anchorRect={rect}
          align={panel.align}
          mode={panel.mode}
          initial={
            panel.mode === "edit"
              ? { columnId: col.id, name: col.name, type: col.type, position }
              : { position: panel.pos }
          }
          onCreate={({ name, type, position: pos }) => {
            addColumn.mutate({
              tableId,
              name,
              type,
              position: pos, // left = position, right = position+1 passed in initial
            });
          }}
        />
      )}
    </>
  );
}

export function useDynamicColumns({
  columnsData,
  editingKey,
  setEditingKey,
  updateCell,
  tableId = ""
}: MakeColsArgs) {
  return useMemo<ColumnDef<CellRecord, unknown>[]>(() => {
    if (!columnsData) return [];
    return columnsData.map((col, idx) => ({
      id: col.id,
      header: () => (
        <HeaderWithMenu
          tableId={tableId}
          col={{ id: col.id, name: col.name, type: col.type }}
          position={idx}
        />
      ),
      // tell TanStack to read row[col.id] for this column's value
      accessorKey: col.id,
      // defaul col width 180
      size: col.width ?? COL_W,
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
  }, [columnsData, editingKey, setEditingKey, updateCell, tableId]);
}

