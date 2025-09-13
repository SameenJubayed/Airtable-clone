// app/baseComponents/grid/hooks.ts
"use client";

import { useMemo, useState } from "react";
import { type ColumnSizingState } from "@tanstack/react-table";
import { api } from "~/trpc/react";
import type { CellRecord, EditingKey } from "./types";
import type { RouterOutputs } from "~/trpc/react";
import { isCuid } from "./isCuid";
// mutate all infinite pages immutably
import type { InfiniteData } from "@tanstack/react-query";

type RowList = RouterOutputs["row"]["list"];
type RowPage = RowList;
type ColumnLite = { id: string; name: string; type: "TEXT" | "NUMBER" };
type ColumnItem = RouterOutputs["column"]["listByTable"][number];

function mapInfinitePages<TPage, TPageParam = unknown>(
  data: InfiniteData<TPage, TPageParam> | undefined,
  fn: (page: TPage) => TPage
): InfiniteData<TPage, TPageParam> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map(fn),
    pageParams: data.pageParams,
  };
}

export function useGridData(tableId: string, viewId?: string) {
  const enabled = isCuid(tableId); // don't run queries with temp ids
  const rowKey = { tableId, viewId, skip: 0 } as const;
  const columnsQ = api.column.listByTable.useQuery(
    { tableId },
    { enabled }              
  );
  const rowsQ = api.row.list.useQuery(rowKey, {
    enabled,
    refetchOnMount: "always",        // fetch even if cached
    refetchOnReconnect: "always",
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

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

export function useOptimisticInsertRow(
  tableId: string,
  viewId?: string,
  take= 200
) {
  const utils = api.useUtils();
  const colQ = api.column.listByTable.useQuery({ tableId }, { enabled: isCuid(tableId) });
  const key = { tableId, viewId, take } as const;

  const insertRow = api.row.insertAt.useMutation({
    async onMutate(vars) {
      await utils.row.list.cancel(key);
      const prev = utils.row.list.getInfiniteData(key);

      const cols = (colQ.data ?? []) as ColumnLite[];
      const now = new Date();
      const tempRowId = `optimistic-${Date.now()}`;

      // compute desired position
      const current = prev?.pages ?? [];
      let maxPos = -1;
      for (const p of current) for (const r of p.rows) if (r.position > maxPos) maxPos = r.position;
      const endPos = maxPos + 1;
      const desired = Math.max(0, Math.min(vars.position ?? endPos, endPos));

      // bump positions >= desired across pages
      const bumped = (data: typeof prev | undefined) =>
        mapInfinitePages(data, (page) => ({
          ...page,
          rows: page.rows.map((r) =>
            r.position >= desired ? { ...r, position: r.position + 1 } : r
          ),
        } as RowPage));

      // choose a page to physically insert into:
      // - if the page that contains the row at `desired` exists, put it there
      // - else append to the last page (or create a first page)
      const pickPageIndex = () => {
        if (!current.length) return 0;
        // find page that has a row with target position
        for (let i = 0; i < current.length; i++) {
          if (current[i]!.rows.some((r) => r.position === desired)) return i;
        }
        return current.length - 1; // append to last page
      };

      const emptyCells = cols.map((c) => ({
        rowId: tempRowId,
        columnId: c.id,
        textValue: null,
        numberValue: null,
        createdAt: now,
        updatedAt: now,
      }));

      utils.row.list.setInfiniteData(key, (data) => {
        // no pages yet? create a first page shell
        if (!data || data.pages.length === 0) {
          return {
            pages: [
              {
                rows: [
                  { id: tempRowId, position: desired, createdAt: now, updatedAt: now },
                ],
                cells: emptyCells,
                hasMore: false,
                nextSkip: 0,
              } as RowPage,
            ],
            pageParams: [null],
          };
        }

        // bump positions everywhere
        const next = bumped(data);

        // insert into chosen page
        const idx = pickPageIndex();
        const page = next!.pages[idx]!;
        const rows = [
          ...page.rows,
          { id: tempRowId, position: desired, createdAt: now, updatedAt: now }
        ].sort((a, b) => a.position - b.position);

        const newPage: RowPage = {
          ...page,
          rows,
          cells: [...page.cells, ...emptyCells],
          hasMore: page.hasMore ?? false,
          nextSkip: page.nextSkip ?? 0,
        };

        next!.pages = next!.pages.map((p, i) => (i === idx ? newPage : p));
        return next!;
      });

      return { prev, tempRowId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.row.list.setInfiniteData(key, ctx.prev);
    },
    onSuccess: (row, _v, ctx) => {
      const realId = (row as { id: string } | undefined)?.id;
      if (!realId) return;
      utils.row.list.setInfiniteData(key, (data) =>
        mapInfinitePages(data, (page) => ({
          ...page,
          rows: page.rows.map((r) => (r.id === ctx?.tempRowId ? { ...r, id: realId } : r)),
          cells: page.cells.map((c) => (c.rowId === ctx?.tempRowId ? { ...c, rowId: realId } : c)),
          hasMore: page.hasMore ?? false,
          nextSkip: page.nextSkip ?? 0,
        }))
      );
    },
    onSettled: () => {
      void utils.row.list.invalidate(key);
    },
  });

  // helpers that compute target positions using infinite cache
  const getRowPosition = (rowId: string) => {
    const data = utils.row.list.getInfiniteData(key);
    for (const p of data?.pages ?? []) {
      const found = p.rows.find((r) => r.id === rowId);
      if (found) return found.position;
    }
    return 0;
  };

  const insertAtEnd = () => {
    const data = utils.row.list.getInfiniteData(key);
    let maxPos = -1;
    for (const p of data?.pages ?? []) for (const r of p.rows) if (r.position > maxPos) maxPos = r.position;
    insertRow.mutate({ tableId, position: maxPos + 1 });
  };

  const insertAbove = (rowId: string) => {
    insertRow.mutate({ tableId, position: getRowPosition(rowId) });
  };

  const insertBelow = (rowId: string) => {
    insertRow.mutate({ tableId, position: getRowPosition(rowId) + 1 });
  };

  return { insertRow, insertAtEnd, insertAbove, insertBelow };
}

export function useOptimisticDeleteRow(
  tableId: string,
  viewId?: string,
  take = 200
) {
  const utils = api.useUtils();
  const key = { tableId, viewId, take } as const;

  const del = api.row.delete.useMutation({
    async onMutate({ rowId }: { rowId: string }) {
      await utils.row.list.cancel(key);
      const prev = utils.row.list.getInfiniteData(key);

      // find position to decrement rows after
      let removedPos = Number.MAX_SAFE_INTEGER;
      for (const p of prev?.pages ?? []) {
        const found = p.rows.find((r) => r.id === rowId);
        if (found) { removedPos = found.position; break; }
      }

      utils.row.list.setInfiniteData(key, (data) =>
        mapInfinitePages(data, (page) => ({
          ...page,
          rows: page.rows
            .filter((r) => r.id !== rowId)
            .map((r) => (r.position > removedPos ? { ...r, position: r.position - 1 } : r)),
          cells: page.cells.filter((c) => c.rowId !== rowId),
          hasMore: page.hasMore ?? false,
          nextSkip: page.nextSkip ?? 0,
        }))
      );

      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.row.list.setInfiniteData(key, ctx.prev);
    },
    onSettled: () => {
      void utils.row.list.invalidate(key);
    },
  });

  const deleteById = (rowId: string) => del.mutate({ rowId });
  return { deleteById };
}

function makeThrottledInvalidate<T>(fn: (arg: T) => Promise<unknown>, ms = 750) {
  let t: number | null = null, lastArgs: T | null = null;
  return (args: T) => {
    lastArgs = args;
    if (t != null) return;
    t = window.setTimeout(() => {
      const a = lastArgs!;
      lastArgs = null;
      t = null;
      void fn(a);
    }, ms);
  };
}

export function useOptimisticUpdateCell(tableId: string, viewId?: string, take = 200) {
  const utils = api.useUtils();
  const key = { tableId, viewId, take } as const;
  const throttledInvalidate = useMemo(
    () => makeThrottledInvalidate<typeof key>((args) => utils.row.list.invalidate(args)),
    [utils] // depend on utils, not utils.row.list
  );

  const updateCell = api.row.updateCell.useMutation({
    async onMutate({ rowId, columnId, textValue, numberValue }) {
      await utils.row.list.cancel(key);
      const prev = utils.row.list.getInfiniteData(key);
      utils.row.list.setInfiniteData(key, (data) =>
        mapInfinitePages(data, (page) => {
          if (!page.rows.length) return page;
          if (!page.rows.some(r => r.id === rowId)) return page;
          return {
            ...page,
            cells: page.cells.map(c =>
              c.rowId === rowId && c.columnId === columnId
                ? { ...c,
                    textValue: textValue !== undefined ? textValue : c.textValue,
                    numberValue: numberValue !== undefined ? numberValue : c.numberValue
                  }
                : c)
          } as typeof page;
        }) 
      );

      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.row.list.setInfiniteData(key, ctx.prev);
    },
    // don’t invalidate immediately; throttle it
    onSettled: () => throttledInvalidate(key),
  });

  return updateCell;
}

export function useOptimisticAddColumn(
  tableId: string,
  viewId?: string,
  take = 200,
  opts?: { onOptimisticApplied?: () => void }
) {
  const utils = api.useUtils();

  // keys that this mutation touches
  const colKey = { tableId } as const;
  const infKey = { tableId, viewId, take } as const;

  return api.column.add.useMutation({
    // Optimistic add
    onMutate: async (vars) => {
      // Stop in-flight refetches from stomping our optimistic writes
      await Promise.all([
        utils.column.listByTable.cancel(colKey),
        utils.row.list.cancel(infKey), // cancel infinite query
      ]);

      // Snapshots for rollback
      const previousCols = utils.column.listByTable.getData(colKey);
      const previousInf = utils.row.list.getInfiniteData(infKey);

      const tempId = `optimistic-col-${Date.now()}`;
      const now = new Date();

      // 1) Optimistically insert the column in the columns list
      utils.column.listByTable.setData(colKey, (old) => {
        const current = old ?? [];
        const desired =
          typeof vars.position === "number"
            ? Math.max(0, Math.min(vars.position, current.length))
            : current.length;

        const next = [
          ...current.slice(0, desired),
          {
            id: tempId,
            name: vars.name,
            type: vars.type,
            position: desired,
            width: 180,
          } as ColumnItem,
          ...current.slice(desired),
        ].map((c, idx) => ({ ...c, position: idx }));

        return next;
      });

      // 2) Optimistically add empty cells for this new column
      //    to every already-loaded page in the infinite rows cache.
      utils.row.list.setInfiniteData(infKey, (data) =>
        mapInfinitePages<RowPage, number | null>(data, (page) => {
          if (!page || page.rows.length === 0) return page;
          const hasAny = page.cells.some(c => c.columnId === tempId);
          if (hasAny) return page;
          return {
            ...page,
            cells: [
              ...page.cells,
              ...page.rows.map((r) => ({
                rowId: r.id,
                columnId: tempId,
                textValue: null,
                numberValue: null,
                createdAt: now,
                updatedAt: now,
              })),
            ],
            hasMore: page.hasMore ?? false,
            nextSkip: page.nextSkip ?? 0,
          };
        })
      );

      // Let the caller (e.g., AddFieldButton) close/reset its UI immediately
      opts?.onOptimisticApplied?.();

      return { colKey, infKey, previousCols, previousInf, tempId };
    },

    // Swap temp id -> real id everywhere
    onSuccess: ({ id }, _vars, ctx) => {
      if (!ctx) return;

      utils.column.listByTable.setData(ctx.colKey, (old) =>
        old?.map((c) => (c.id === ctx.tempId ? { ...c, id } : c))
      );

      utils.row.list.setInfiniteData(ctx.infKey, (data) =>
        mapInfinitePages<RowPage, number | null>(data, (page) => ({
          ...page,
          cells: page.cells.map((cell) =>
            cell.columnId === ctx.tempId ? { ...cell, columnId: id } : cell
          ),
          hasMore: page.hasMore ?? false,
          nextSkip: page.nextSkip ?? 0,
        }))
      );
    },

    // rollback on error
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      utils.column.listByTable.setData(ctx.colKey, ctx.previousCols);
      utils.row.list.setInfiniteData(ctx.infKey, ctx.previousInf);
    },

    // Final sync
    onSettled: async () => {
      await Promise.all([
        utils.column.listByTable.invalidate(colKey),
        utils.row.list.invalidate(infKey),
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

export function useInfiniteRows(params: {
  tableId: string;
  viewId?: string;
  take?: number; 
}) {
  const { tableId, viewId, take = 200 } = params;

  const query = api.row.list.useInfiniteQuery(
    { tableId, viewId, take },
    {
      getNextPageParam: (last) => (last?.hasMore ? last.nextSkip : undefined),
      refetchOnWindowFocus: false,
      staleTime: 15_000, 
      gcTime: 5 * 60 * 1000,
    }
  );

  // shape into your existing CellRecord[] (rows + cells)
  const flatRecords: CellRecord[] = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const out = new Map<string, CellRecord>();

    for (const page of pages) {
      const map = new Map<string, CellRecord>();
      page.rows.forEach((r) => map.set(r.id, { rowId: r.id }));
      page.cells.forEach((c) => {
        const target = map.get(c.rowId);
        if (target) target[c.columnId] = c.textValue ?? c.numberValue ?? null;
      });
      // append in order
      for (const rec of map.values()) out.set(rec.rowId, rec);
    }

    return Array.from(out.values());
  }, [query.data?.pages]);

  return { ...query, records: flatRecords };
}

