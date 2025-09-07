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

export function useOptimisticCreateRow(
    tableId: string, 
    columnsQ: ReturnType<typeof api.column.listByTable.useQuery>, 
    rowsQ: ReturnType<typeof api.row.list.useQuery>
) {
  const utils = api.useUtils();
  const key = { tableId, skip: 0, take: 200 } as const;

  const createRow = api.row.create.useMutation({
    onMutate: async () => {
      // Cancel any ongoing fetches
      await utils.row.list.cancel(key);
      // snapshot for rollback
      const previous = utils.row.list.getData(key);

      // build an optimistic row id & position + find columns to write empty cells for
      const tempRowId = `optimistic-${Date.now()}`;
      const position = (previous?.rows?.length ?? 0);
      const cols: ColumnLite[] = (columnsQ.data ?? []) as ColumnLite[];

      // writing optimistic cache
      utils.row.list.setData(key, (old: RowList | undefined)  => {
        const now = new Date();
        if (!old) {
          return {
            rows: [{ id: tempRowId, tableId, position, createdAt: now, updatedAt: now }],
            cells: cols.map((c) => ({
              rowId: tempRowId,
              columnId: c.id,
              textValue: null,
              numberValue: null,
              createdAt: now,
              updatedAt: now,
            })),
          };
        }
        return {
          rows: [
            ...old.rows,
            { id: tempRowId, tableId, position, createdAt: now, updatedAt: now },
          ],
          cells: [
            ...old.cells,
            ...cols.map((c) => ({
              rowId: tempRowId,
              columnId: c.id,
              textValue: null,
              numberValue: null,
              createdAt: now,
              updatedAt: now,
            })),
          ],
        } as typeof old;
      });
      // pass context to onError/onSuccess
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
    onSettled: () => { void rowsQ.refetch(); },
  });

  return createRow;
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

      // 1) Optimistically append the column
      utils.column.listByTable.setData(colKey, (old) => {
        const arr = (old ?? []);
        const position = arr.length;
        return [
          ...arr,
          { id: tempId, name: vars.name, type: vars.type, position },
        ] as ColumnItem[];
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

  return { rowHeight, setRowHeight, loading: !prefsQ.data && prefsQ.isLoading };
}