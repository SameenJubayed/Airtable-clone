// app/baseComponents/grid/columns.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CellRecord, EditingKey, ColMeta } from "./types";
import { COL_W, MIN_COL_W, ROWNUM_W } from "./constants";
import { useOptimisticAddColumn } from "./hooks";
import ColumnHeaderMenu from "./ColumnHeaderMenu";
import FieldEditorPopover from "./FieldEditorPopover";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api } from "~/trpc/react";

type MakeColsArgs = {
  columnsData: { id: string; name: string; type: "TEXT" | "NUMBER"; width: number }[] | undefined;
  editingKey: EditingKey;
  setEditingKey: (k: EditingKey) => void;
  updateCell: ReturnType<typeof api.row.updateCell.useMutation>;
  tableId?: string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function focusCellByIndex(rowIndex: number, colIndex: number) {
  const el = document.querySelector<HTMLElement>(
    `[data-cell="1"][data-rowindex="${rowIndex}"][data-colindex="${colIndex}"]`
  );
  if (el) {
    el.focus();
    // ensure visibility within the scrollport
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

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
    onOptimisticApplied: () => setEditor(null),
  });

  const ref = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
    const [editor, setEditor] = useState<
    | null
    | {
        mode: "create" | "edit";
        align: "leftEdge" | "leftAtRightEdge";
        initial?: { columnId?: string; name?: string; type?: "TEXT" | "NUMBER"; position?: number };
      }
  >(null);

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
        onEdit={() => setEditor({ mode: "edit", align: "leftEdge" })}
        onInsertLeft={() => setEditor({ mode: "create", align: "leftEdge", initial: { position } })}
        onInsertRight={() => setEditor({ mode: "create", align: "leftAtRightEdge", initial: { position: position + 1 } })}
        onDelete={async () => {
          await del.mutateAsync({ columnId: col.id });
          await utils.column.listByTable.invalidate({ tableId });
          await utils.row.list.invalidate({ tableId, skip: 0 });
        }}
        // Optional stubs (wire when you implement)
        onDuplicate={undefined}
        onSortAsc={undefined}
        onSortDesc={undefined}
        onFilter={undefined}
        onHide={undefined}
      />

      {editor && (
        <FieldEditorPopover
          tableId={tableId}
          open
          onClose={() => setEditor(null)}
          anchorEl={ref.current} // ⟵ anchor to real element (autoUpdate will follow)
          align={editor.align}                 
          mode={editor.mode}
          initial={editor.initial}
          labels={editor.mode === "edit" ? { btnSave: "Save" } : { btnCreate: "Create field" }}
          onCreate={({ name, type, position: pos }) => {
            // only called in create mode
            addColumn.mutate({
              tableId,
              name,
              type,
              position: pos, 
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

        const ek = editingKey;
        const isEditing = ek?.rowId === rowId && ek?.columnId === columnId;

        const rowIndex = ctx.row.index;
        const colIndex = ctx.column.getIndex();

        const move = (dx: number, dy: number) => {
          const colCount = ctx.table.getVisibleLeafColumns().length;
          const rowCount = ctx.table.getRowModel().rows.length;
          const nextCol = clamp(colIndex + dx, 0, colCount - 1);
          const nextRow = clamp(rowIndex + dy, 0, rowCount - 1);
          if (nextCol !== colIndex || nextRow !== rowIndex) {
            focusCellByIndex(nextRow, nextCol);
          }
        };

        // ----- type-to-edit helpers (same behavior you asked for) -----
        const allowNumeric = col.type === "NUMBER";
        const prefillFromKey = (e: React.KeyboardEvent<HTMLDivElement>): string | null => {
          if (e.ctrlKey || e.metaKey || e.altKey) return null;
          if (e.key === "Backspace" || e.key === "Delete") return "";
          if (e.key.length !== 1) return null;

          const ch = e.key;
          if (!allowNumeric) return ch;

          const isDigit = ch >= "0" && ch <= "9";
          if (isDigit || ch === "." || ch === "-") return ch;
          return null;
        };

        if (!isEditing) {
          return (
            <div
              data-cell="1"
              data-rowindex={rowIndex}
              data-colindex={colIndex}
              role="gridcell"
              tabIndex={0}
              className="w-full h-8 px-3 flex items-center whitespace-nowrap overflow-hidden text-ellipsis
                        focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-default"
              title={value == null ? "" : String(value)}
              onClick={(e) => (e.currentTarget as HTMLDivElement).focus()} // single-click selects
              onDoubleClick={() => setEditingKey({ rowId, columnId })} // double-click edits
              onKeyDown={(e) => {
                // type to edit (replace content)
                const prefill = prefillFromKey(e);
                if (prefill != null) {
                  e.preventDefault();
                  setEditingKey({ rowId, columnId, prefill });
                  return;
                }

                // navigation
                if (e.key === "ArrowRight") { e.preventDefault(); move(1, 0); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1, 0); }
                else if (e.key === "ArrowDown") { e.preventDefault(); move(0, 1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); move(0, -1); }
                else if (e.key === "Tab") {
                  e.preventDefault();
                  move(e.shiftKey ? -1 : 1, 0); // keep Tab within the row
                }
              }}
            >
              {value ?? ""}
            </div>
          );
        }

        // In edit mode: keep your existing input behavior
        const initial = ek?.prefill ?? (value == null ? "" : String(value));

        const type = col.type;

        return (
          <input
            autoFocus
            type={type === "NUMBER" ? "number" : "text"}
            defaultValue={initial}
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
                const txt = raw; // keep spaces; user is replacing intentionally
                updateCell.mutate({
                  rowId,
                  columnId,
                  textValue: txt === "" ? null : txt,
                });
              }
            }}
            onKeyDown={(e) => {
              // keep your current commit/cancel
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

