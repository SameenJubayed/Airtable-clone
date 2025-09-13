// app/baseComponents/grid/SortMenuPopover.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Portal from "./Portal";
import {
  useCloseOnOutside,
  useFloatingForAnchor,
  DD,
  InlineMenu,
  ITEM_CLASS,
} from "./uiPopover";
import { api } from "~/trpc/react";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import type { Placement } from "@floating-ui/react";

type ColumnLite = { id: string; name: string; type: "TEXT" | "NUMBER" };
type DirUI = "ASC" | "DESC";
type SortRow = { id: string; fieldId: string; dir: DirUI };

// Server payload; `type` is optional on read, inferred from columns if missing
type ServerSort = { columnId: string; dir: "asc" | "desc"; type?: "TEXT" | "NUMBER" };

// normalize server sorts (accept missing type; infer from columns)
function normalizeServerSort(s: unknown, columns: ColumnLite[]): ServerSort | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const columnId =
    typeof o.columnId === "string"
      ? o.columnId
      : typeof o.fieldId === "string" 
      ? o.fieldId
      : null;
  if (!columnId) return null;
  const dir: "asc" | "desc" = o.dir === "desc" ? "desc" : "asc";
  const typeFromServer =
    o.type === "NUMBER" || o.type === "TEXT" ? o.type : undefined;
  const type = typeFromServer ?? (columns.find(c => c.id === columnId)?.type ?? "TEXT");
  return { columnId, dir, type };
}

// compare only on what the server actually stores
const compactSorts = (arr: ServerSort[]) => arr.map(s => ({ columnId: s.columnId, dir: s.dir }));

export default function SortMenuPopover({
  open,
  onClose,
  anchorEl,
  columns,
  tableId,
  viewId,
  pageTake = 200
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  columns: ColumnLite[];
  tableId: string;
  viewId: string | null;
  pageTake?: number;
}) {
  const utils = api.useUtils();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { x, y, strategy, refs } = useFloatingForAnchor(
    anchorEl,
    open,
    "bottom-end" as Placement
  );
  useCloseOnOutside(open, onClose, panelRef, anchorEl);

  // ---------- state ----------
  const [rows, setRows] = useState<SortRow[]>([]);
  const [autoSort, setAutoSort] = useState(true);
  const mode: "pick" | "configure" = rows.length ? "configure" : "pick";

  // Keep a canonical snapshot of the last payload we sent (or hydrated)
  const lastPayloadRef = useRef<string>("");

  // Load current sorts for this view
  // (Hydrates via listByTable + activeView, mirroring FilterMenuPopover)
  const viewsQ = api.view.listByTable.useQuery({ tableId }, { enabled: !!tableId && open });
  const viewList = viewsQ.data;
  const activeView = useMemo(
    () => viewList?.find(v => v.id === (viewId ?? "")),
    [viewList, viewId]
  );

  // Initialize rows whenever we open for a (new) view
  useEffect(() => {
    if (!open || !activeView) return;

    const sortsUnknown = (activeView as { sorts?: unknown } | undefined)?.sorts;
    const current: ServerSort[] = Array.isArray(sortsUnknown)
      ? (sortsUnknown as unknown[])
          .map(s => normalizeServerSort(s, columns))
          .filter((x): x is ServerSort => !!x)
      : [];

    // Hydrate UI rows
    setRows(
      current.map((s) => ({
        id: crypto.randomUUID(),
        fieldId: s.columnId,
        dir: s.dir === "desc" ? "DESC" : "ASC",
      }))
    );

    // Prime the "last sent" snapshot so opening the menu doesn't immediately re-save
    lastPayloadRef.current = JSON.stringify(compactSorts(current));
  }, [open, activeView, columns]);

  // Helpers
  const fieldById = (id: string | undefined) => columns.find((c) => c.id === id);
  const labelForDir = (t: ColumnLite["type"], d: DirUI) =>
    t === "NUMBER" ? (d === "ASC" ? "1 → 9" : "9 → 1") : d === "ASC" ? "A → Z" : "Z → A";

  // Stable builder for the server payload
  const rowsToPayload = useCallback((): ServerSort[] => {
    return rows.map((r) => {
      const col = columns.find((c) => c.id === r.fieldId);
      return {
        columnId: r.fieldId,
        dir: r.dir === "ASC" ? "asc" : "desc",
        // keep type for client semantics; server may ignore it
        type: col?.type ?? "TEXT",
      };
    });
  }, [rows, columns]);

  const updateConfig = api.view.updateConfig.useMutation({
    onSuccess: async (updated) => {
      if (!updated?.id) return;

      // refresh rows in the grid
      utils.row.list.setInfiniteData({ tableId, viewId: updated.id, take: pageTake }, undefined);
      await utils.row.list.invalidate({ tableId, viewId: updated.id, take: pageTake });

      // Keep caches in sync with what we just saved (use server result, like Filter)
      utils.view.get.setData({ viewId: updated.id }, (old) =>
        old ? { ...old, sorts: updated.sorts } : old
      );
      utils.view.listByTable.setData({ tableId }, (old) =>
        old?.map((v) => (v.id === updated.id ? { ...v, sorts: updated.sorts } : v))
      );
    },
  });

  // Stable committer (avoid depending directly on mutation object in the effect)
  const commitSorts = useCallback(
    (payload: ServerSort[]) => {
      if (!viewId) return;
      updateConfig.mutate({
        viewId,
        sorts: payload.map(s => ({
          ...s,
          type: s.type ?? "TEXT"
        }))
      });
    },
    [updateConfig, viewId]
  );

  // Auto-save ONLY when actual sort payload changes (debounced)
  useEffect(() => {
    if (!open) return; 
    if (!autoSort || !viewId) return;

    const payloadArr = rowsToPayload(); 
    const payloadStr = JSON.stringify(compactSorts(payloadArr));

    // Dedup: only send when changed (incl. going to [])
    if (payloadStr === lastPayloadRef.current) return;

    const t = window.setTimeout(() => {
      lastPayloadRef.current = payloadStr;
      commitSorts(payloadArr);   
    }, 200);

    return () => window.clearTimeout(t);
  }, [open, autoSort, viewId, rowsToPayload, commitSorts]);

  // Flush pending changes on close so quick close doesn't drop a change
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open && autoSort && viewId) {
      const payloadArr = rowsToPayload();
      const payloadStr = JSON.stringify(compactSorts(payloadArr));
      if (payloadStr !== lastPayloadRef.current) {
        lastPayloadRef.current = payloadStr;
        commitSorts(payloadArr);
      }
    }
    prevOpenRef.current = open;
  }, [open, autoSort, viewId, rowsToPayload, commitSorts]);

  // ---------- UI: submenu mgmt ----------
  const [openSubmenu, setOpenSubmenu] =
    useState<null | { rowId: string; kind: "field" | "dir" }>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onPanelMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const insideSubmenu = t.closest('[data-submenu="true"]');
      const onTrigger = t.closest('[data-submenu-trigger="true"]');
      if (!insideSubmenu && !onTrigger) setOpenSubmenu(null);
    };
    panel.addEventListener("mousedown", onPanelMouseDown);
    return () => panel.removeEventListener("mousedown", onPanelMouseDown);
  }, [open]);

  if (!open || !anchorEl) return null;

  const WIDTH = mode === "pick" ? 320 : 480;

  return (
    <Portal>
      <div
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        role="menu"
        aria-label="Sort menu"
        data-menulayer="true"
        style={{ position: strategy, top: y ?? 0, left: x ?? 0, width: WIDTH }}
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[1002]"
      >
        {/* Header */}
        <div className="p-3 pb-2 text-gray-600">
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-medium px-1">Sort by</span>
            <HelpOutlineOutlinedIcon fontSize="small" />
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-3" />

        <div className="pt-2 px-3 pb-3">
          {mode === "pick" ? (
            <div className="pt-1">
              {columns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={ITEM_CLASS}
                  onClick={() => {
                    setRows([{ id: crypto.randomUUID(), fieldId: c.id, dir: "ASC" }]);
                  }}
                >
                  <span className="inline-block w-4 text-gray-500">
                    {c.type === "NUMBER" ? "#" : "A"}
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="pt-1">
              <div className="flex flex-col gap-2">
                {rows.map((r, idx) => {
                  const col = fieldById(r.fieldId)!;
                  const used = new Set(rows.map((rr) => rr.fieldId));
                  const available = columns.filter(
                    (c) => c.id === r.fieldId || !used.has(c.id)
                  );

                  const fieldOpen =
                    !!openSubmenu && openSubmenu.rowId === r.id && openSubmenu.kind === "field";
                  const dirOpen =
                    !!openSubmenu && openSubmenu.rowId === r.id && openSubmenu.kind === "dir";

                  return (
                    <div key={r.id} className="relative">
                      <div className="w-full h-[36px] flex items-center gap-2">
                        {/* Field */}
                        <div className="relative">
                          <DD
                            label={col?.name ?? "Field"}
                            first
                            onClick={() =>
                              setOpenSubmenu((s) =>
                                s && s.rowId === r.id && s.kind === "field"
                                  ? null
                                  : { rowId: r.id, kind: "field" }
                              )
                            }
                            widthClass="w-56"
                            title="Field"
                            submenuTrigger
                          />
                          <InlineMenu open={fieldOpen} width={240}>
                            {available.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className={ITEM_CLASS}
                                onClick={() => {
                                  setRows((prev) =>
                                    prev.map((x) =>
                                      x.id === r.id ? { ...x, fieldId: c.id } : x
                                    )
                                  );
                                  setOpenSubmenu(null);
                                }}
                              >
                                <span className="inline-block w-4 text-gray-500">
                                  {c.type === "NUMBER" ? "#" : "A"}
                                </span>
                                <span className="truncate">{c.name}</span>
                              </button>
                            ))}
                          </InlineMenu>
                        </div>

                        {/* Direction */}
                        <div className="relative">
                          <DD
                            label={labelForDir(col.type, r.dir)}
                            onClick={() =>
                              setOpenSubmenu((s) =>
                                s && s.rowId === r.id && s.kind === "dir"
                                  ? null
                                  : { rowId: r.id, kind: "dir" }
                              )
                            }
                            widthClass="w-32"
                            last
                            title="Direction"
                            submenuTrigger
                          />
                          <InlineMenu open={dirOpen} width={160}>
                            {(["ASC", "DESC"] as DirUI[]).map((d) => (
                              <button
                                key={d}
                                type="button"
                                className={ITEM_CLASS}
                                onClick={() => {
                                  setRows((prev) =>
                                    prev.map((x) =>
                                      x.id === r.id ? { ...x, dir: d } : x
                                    )
                                  );
                                  setOpenSubmenu(null);
                                }}
                              >
                                {labelForDir(col.type, d)}
                              </button>
                            ))}
                          </InlineMenu>
                        </div>

                        <div className="flex-1" />

                        {/* Remove + Drag (visual only) */}
                        <button
                          type="button"
                          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-sm"
                          title="Remove Sort"
                          onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                        >
                          <CloseIcon fontSize="small" className="text-gray-500" />
                        </button>

                        <span
                          className="w-8 h-8 flex items-center justify-center text-gray-500 cursor-grab"
                          title="Drag to reorder"
                        >
                          <DragIndicatorOutlinedIcon fontSize="small" className="text-gray-400" />
                        </span>
                      </div>

                      {/* simple move up/down controls */}
                      <div className="pl-1 text-xs text-gray-400">
                        <button
                          className="mr-2 hover:text-gray-700"
                          onClick={() =>
                            setRows((prev) => {
                              if (idx === 0) return prev;
                              const next = [...prev];
                              [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                              return next;
                            })
                          }
                        >
                          Move up
                        </button>
                        <button
                          className="hover:text-gray-700"
                          onClick={() =>
                            setRows((prev) => {
                              if (idx === prev.length - 1) return prev;
                              const next = [...prev];
                              [next[idx + 1], next[idx]] = [next[idx]!, next[idx + 1]!];
                              return next;
                            })
                          }
                        >
                          Move down
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="mt-2 text-sm text-gray-600 hover:text-black cursor-pointer flex items-center"
                onClick={() => {
                  const used = new Set(rows.map((r) => r.fieldId));
                  const next = columns.find((c) => !used.has(c.id));
                  if (!next) return;
                  setRows((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), fieldId: next.id, dir: "ASC" },
                  ]);
                }}
              >
                <AddIcon fontSize="small" className="mr-1" />
                Add another sort
              </button>

              <div className="mt-3 -mx-1 px-3 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={autoSort}
                      onChange={(e) => setAutoSort(e.target.checked)}
                    />
                    Automatically sort records
                  </label>

                  {!autoSort && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-8 px-3 rounded-sm text-sm text-gray-700 hover:bg-gray-100"
                        onClick={onClose}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="h-8 px-3 rounded-sm text-sm text-white bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          if (!viewId) return;
                          const payload = rowsToPayload();
                          lastPayloadRef.current = JSON.stringify(compactSorts(payload)); // keep dedup in sync
                          commitSorts(payload);
                          onClose();
                        }}
                      >
                        Sort
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
