// app/baseComponents/grid/hooks.ts
"use client";

import { useMemo, useState } from "react";
import { type ColumnSizingState } from "@tanstack/react-table";
import { api } from "~/trpc/react";
import type { CellRecord, EditingKey } from "./types";
import type { RouterOutputs } from "~/trpc/react";
import { isCuid } from "./isCuid";

type RowList = RouterOutputs["row"]["list"];
type ColumnLite = { id: string; name: string; type: "TEXT" | "NUMBER" };
type ColumnItem = RouterOutputs["column"]["listByTable"][number];

export function useGridData(tableId: string) {
  const enabled = isCuid(tableId); // don't run queries with temp ids
  const key = { tableId, skip: 0, take: 200 } as const;
  const columnsQ = api.column.listByTable.useQuery(
    { tableId },
    { enabled }               // ⬅️ don't run until we have a real id
  );
  const rowsQ = api.row.list.useQuery(key, { enabled });

  // Convert server rows+cells -> table rows
  const data: CellRecord[] = useMemo(() => {
    if (!rowsQ.data) return [];
    const { rows, cells } = rowsQ.data;
    const map = new Map<string, CellRecord>();
    rows.forEach((r) => map.set(r.id, { rowId: r.id }));
    cells.forEach((c) => {
      const target = map.get(c.rowId);
      if (target) target[c.columnId] = c.textValue ?? c.numberValue ?? null;
    });
    return Array.from(map.values());
  }, [rowsQ.data]);

  return { columnsQ, rowsQ, data };
}

export function useColumnSizingState() {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  return { columnSizing, setColumnSizing };
}

export function useEditingKey() {
  const [editingKey, setEditingKey] = useState<EditingKey>(null);
  return { editingKey, setEditingKey };
}

export function useOptimisticInsertRow(tableId: string) {
  const utils = api.useUtils();
  const key = { tableId, skip: 0, take: 200 } as const;

  const enabled = isCuid(tableId);
  const columnsQ = api.column.listByTable.useQuery({ tableId }, { enabled });
  const rowsQ = api.row.list.useQuery(key, { enabled });

  const getEndPosition = () => {
    const rows = utils.row.list.getData(key)?.rows ?? [];
    if (rows.length === 0) return 0;
    let maxPos = -1;
    for (const r of rows) if (r.position > maxPos) maxPos = r.position;
    return maxPos + 1;
  };

  const insertRow = api.row.insertAt.useMutation({
    onMutate: async (vars) => {
      await utils.row.list.cancel(key);

      const previous = utils.row.list.getData(key);
      const cols = (columnsQ.data ?? []) as ColumnLite[];
      const tempRowId = `optimistic-${Date.now()}`;
      const now = new Date();

      utils.row.list.setData(key, (old) => {
        const base: RowList = old ?? { rows: [], cells: [] as RowList["cells"] };

        // compute end from max(position), not rows.length
        let end = 0;
        for (const r of base.rows) if (r.position >= end) end = r.position + 1;

        // clamp requested position against [0, end]
        const requested = vars.position ?? end;
        const desired = Math.max(0, Math.min(requested, end));

        // ensure we operate on a position-sorted view
        const sorted = [...base.rows].sort((a, b) => a.position - b.position);

        // bump positions >= desired
        const bumped = sorted.map((r) =>
          r.position >= desired ? { ...r, position: r.position + 1 } : r
        );

        // insert temp row at desired pos
        const newRow = {
          id: tempRowId,
          tableId,
          position: desired,
          createdAt: now,
          updatedAt: now,
        };

        const rows = [...bumped, newRow].sort((a, b) => a.position - b.position);

        // add empty cells for all columns for the new temp row
        const addCells = cols.map((c) => ({
          rowId: tempRowId,
          columnId: c.id,
          textValue: null,
          numberValue: null,
          createdAt: now,
          updatedAt: now,
        }));

        return {
          rows,
          cells: [...base.cells, ...addCells],
        } as RowList;
      });

      return { previous, tempRowId };
    },
    // If server fails, roll back cache
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) utils.row.list.setData(key, ctx.previous);
    },

    // replace optimistic id with real id returned by the server
    onSuccess: (data, _v, ctx) => {
      const realId = (data as { id: string } | undefined)?.id;
      if (!realId || !ctx?.tempRowId) return;

      utils.row.list.setData(key, (old) => {
        if (!old) return old;
        return {
          rows: old.rows.map((r) => 
            (r.id === ctx.tempRowId ? { ...r, id: realId } : r)
          ),
          cells: old.cells.map((c) => 
            (c.rowId === ctx.tempRowId ? { ...c, rowId: realId } : c)
          ),
        } as typeof old;
      });
    },
    onSettled: () => void rowsQ.refetch()
  });

  const insertAtEnd = () => {
    insertRow.mutate({ tableId, position: getEndPosition() });
  };

  const insertAbove = (rowIndex: number) => {
    const list = utils.row.list.getData(key);
    const pos = list?.rows?.[rowIndex]?.position ?? rowIndex;
    insertRow.mutate({ tableId, position: pos });
  };

  const insertBelow = (rowIndex: number) => {
    const list = utils.row.list.getData(key);
    const pos = (list?.rows?.[rowIndex]?.position ?? rowIndex) + 1;
    insertRow.mutate({ tableId, position: pos });
  };

  return { insertRow, insertAtEnd, insertAbove, insertBelow };
}

export function useOptimisticDeleteRow(tableId: string) {
  const utils = api.useUtils();
  const listKey = { tableId, skip: 0, take: 200 } as const;
  const rowsQ = api.row.list.useQuery(listKey);

  const del = api.row.delete.useMutation({
    onMutate: async ({ rowId }: { rowId: string }) => {
      await utils.row.list.cancel(listKey);
      const previous = utils.row.list.getData(listKey);

      utils.row.list.setData(listKey, (old) => {
        if (!old) return old as any;
        const removed = old.rows.find((r) => r.id === rowId);
        const afterPos = removed?.position ?? Number.MAX_SAFE_INTEGER;
        return {
          rows: old.rows
            .filter((r) => r.id !== rowId)
            .map((r) => (r.position > afterPos ? { ...r, position: r.position - 1 } : r)),
          cells: old.cells.filter((c) => c.rowId !== rowId),
        } as RowList;
      });

      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) utils.row.list.setData(listKey, ctx.previous);
    },
    onSettled: () => { void rowsQ.refetch(); },
  });

  const deleteById = (rowId: string) => del.mutate({ rowId });

  const deleteByIndex = (rowIndex: number) => {
    const list = utils.row.list.getData(listKey);
    const rowId = list?.rows?.[rowIndex]?.id;
    if (rowId) del.mutate({ rowId });
  };

  return { deleteById, deleteByIndex };
}

export function useOptimisticUpdateCell( 
  tableId: string, 
  rowsQ: ReturnType<typeof api.row.list.useQuery>
) {
  const utils = api.useUtils();
  const key = { tableId, skip: 0, take: 200 } as const;

  const updateCell = api.row.updateCell.useMutation({
    onMutate: async ({ rowId, columnId, textValue, numberValue }) => {
      // Cancel any ongoing fetches
      await utils.row.list.cancel(key);
      // getting previous data for rollback
      const previousData = utils.row.list.getData(key);

      utils.row.list.setData(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          cells: old.cells.map((cell) =>
            cell.rowId === rowId && cell.columnId === columnId
              ? {
                  ...cell,
                  textValue: textValue !== undefined ? textValue : cell.textValue,
                  numberValue: numberValue !== undefined ? numberValue : cell.numberValue,
                }
              : cell,
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _var, ctx) => {
      if (ctx?.previousData) utils.row.list.setData(key, ctx.previousData);
    },
    onSettled: () => { void rowsQ.refetch(); },
  });

  return updateCell;
}

export function useOptimisticAddColumn(
  tableId: string,
  opts?: { onOptimisticApplied?: () => void }
) {
  const utils = api.useUtils();
  const colKey = { tableId } as const;
  const rowKey = { tableId, skip: 0, take: 200 } as const;

  return api.column.add.useMutation({
    // Optimistic add
    onMutate: async (vars) => {
      // Cancel so our writes aren't overwritten by in-flight refetches
      await Promise.all([
        utils.column.listByTable.cancel(colKey),
        utils.row.list.cancel(rowKey),
      ]);

      // Snapshots for rollback
      const previousCols = utils.column.listByTable.getData(colKey);
      const previousRows = utils.row.list.getData(rowKey);

      const tempId = `optimistic-col-${Date.now()}`;
      const now = new Date();

      // 1) Optimistically insert the column
      utils.column.listByTable.setData(colKey, (old) => {
        const current = (old ?? []);

        // clamp desired index; default to append when not provided
        const desired =
          typeof (vars).position === "number" 
            ? Math.max(0, Math.min((vars).position, current.length))
            : current.length;

        // build new array with the temp column inserted
        const next = [
          ...current.slice(0, desired),
          { id: tempId, name: vars.name, type: vars.type, position: desired } as ColumnItem,
          ...current.slice(desired),
        ].map((c, idx) => ({ ...c, position: idx })); // reindex positions

        return next;
      });

      // 2) Optimistically add empty cells for existing rows
      if (previousRows) {
        utils.row.list.setData(rowKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cells: [
              ...old.cells,
              ...old.rows.map((r) => ({
                rowId: r.id,
                columnId: tempId,
                textValue: null,
                numberValue: null,
                createdAt: now,
                updatedAt: now,
              })),
            ],
          } as RowList;
        });
      }

      // Let the caller (the button) close/reset its UI immediately
      opts?.onOptimisticApplied?.();

      return { colKey, rowKey, previousCols, previousRows, tempId };
    },

    onSuccess: ({ id }, _vars, ctx) => {
      if (!ctx) return;

      // Swap temp id -> real id in both places
      utils.column.listByTable.setData(ctx.colKey, (old) =>
        old?.map((c) => (c.id === ctx.tempId ? { ...c, id } : c))
      );

      utils.row.list.setData(ctx.rowKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          cells: old.cells.map((cell) =>
            cell.columnId === ctx.tempId ? { ...cell, columnId: id } : cell
          ),
        } as RowList;
      });
    },

    // rollback on error
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      utils.column.listByTable.setData(ctx.colKey, ctx.previousCols);
      utils.row.list.setData(ctx.rowKey, ctx.previousRows);
    },

    // Final sync
    onSettled: async () => {
      await Promise.all([
        utils.column.listByTable.invalidate(colKey),
        utils.row.list.invalidate(rowKey),
      ]);
    },
  });
}

export function useRowHeight(tableId: string) {
  const enabled = isCuid(tableId);
  const utils = api.useUtils();

  const prefsQ = api.table.getUiPrefs.useQuery({ tableId }, { enabled });

  const rowHeight = prefsQ.data?.rowHeight ?? 32; // default 32px

  const setHeight = api.table.setRowHeight.useMutation({
    onMutate: async ({rowHeight}) => {
      await utils.table.getUiPrefs.cancel({ tableId });

      const prev = utils.table.getUiPrefs.getData({ tableId });
      utils.table.getUiPrefs.setData({ tableId }, (old) =>
        old ? { ...old, rowHeight } : { id: tableId, rowHeight }
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) {
        utils.table.getUiPrefs.setData({ tableId }, ctx.prev);
      }
    },
    onSettled: () => {
      void utils.table.getUiPrefs.invalidate({ tableId });
    },
  });

  const setRowHeight = (h: number) => {
    // clamp client-side too
    const clamped = Math.max(32, Math.min(128, Math.round(h)));
    setHeight.mutate({ tableId, rowHeight: clamped });
  };

  return { rowHeight, setRowHeight };
}