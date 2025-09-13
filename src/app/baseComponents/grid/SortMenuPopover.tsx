// app/baseComponents/grid/SortMenuPopover.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type ServerSort = { columnId: string; type: "TEXT" | "NUMBER"; dir: "asc" | "desc" };
function isServerSort(x: unknown): x is ServerSort {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.columnId === "string" &&
    (o.type === "TEXT" || o.type === "NUMBER") &&
    (o.dir === "asc" || o.dir === "desc")
  );
}

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
  const viewQ = api.view.get.useQuery(
    { viewId: viewId ?? "" },
    { enabled: open && !!viewId }
  );

  // Initialize rows whenever we open for a (new) view
  useEffect(() => {
    if (!open || !viewQ.data) return;

    const sortsUnknown = (viewQ.data as { sorts?: unknown } | undefined)?.sorts;
    const current: ServerSort[] = Array.isArray(sortsUnknown)
      ? (sortsUnknown as unknown[]).filter(isServerSort)
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
    lastPayloadRef.current = JSON.stringify(
      current.map((s) => ({ columnId: s.columnId, type: s.type, dir: s.dir }))
    );
  }, [open, viewQ.data]);

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
        type: col?.type ?? "TEXT",
        dir: r.dir === "ASC" ? "asc" : "desc",
      };
    });
  }, [rows, columns]);

  const updateConfig = api.view.updateConfig.useMutation({
    onSuccess: () => {
      if (!viewId) return;

      // refresh rows in the grid
      utils.row.list.setInfiniteData({ tableId, viewId, take: pageTake }, undefined);
      void utils.row.list.invalidate({ tableId, viewId, take: pageTake });

      // Keep caches in sync with what we just saved
      const payload = rowsToPayload();
      utils.view.get.setData({ viewId }, (old) =>
        old ? { ...old, sorts: payload } : old
      );
      utils.view.listByTable.setData({ tableId }, (old) =>
        old?.map((v) => (v.id === viewId ? { ...v, sorts: payload } : v))
      );
    },
  });

  // Stable committer (avoid depending directly on mutation object in the effect)
  const commitSorts = useCallback(
    (payload: ServerSort[]) => {
      if (!viewId) return;
      updateConfig.mutate({ viewId, sorts: payload });
    },
    [updateConfig, viewId]
  );

  // Auto-save ONLY when actual sort payload changes (debounced)
  useEffect(() => {
    if (!open) return; 
    if (!autoSort || !viewId) return;

    const payloadArr = rowsToPayload(); 
    const payloadStr = JSON.stringify(payloadArr);

    // Dedup: only send when changed (incl. going to [])
    if (payloadStr === lastPayloadRef.current) return;

    const t = setTimeout(() => {
      lastPayloadRef.current = payloadStr;
      commitSorts(payloadArr);   
    }, 200);

    return () => clearTimeout(t);
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
                          lastPayloadRef.current = JSON.stringify(payload); // keep dedup in sync
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
