"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Portal from "./Portal";
import { useCloseOnOutside, useFloatingForAnchor } from "./uiPopover";
import type { Placement } from "@floating-ui/react";
import { api } from "~/trpc/react";

/** Minimal column shape we need here */
type ColumnLite = { id: string; name: string; type: "TEXT" | "NUMBER" };

export default function HideFieldsPopover({
  open,
  onClose,
  anchorEl,
  columns,
  tableId,
  viewId,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  columns: ColumnLite[];
  tableId: string;
  viewId?: string | null;
}) {
  const width = 320;
  const placement = "bottom-end" as Placement; // right edge aligns with button’s right edge

  const panelRef = useRef<HTMLDivElement | null>(null);
  const { x, y, strategy, refs } = useFloatingForAnchor(anchorEl, open, placement);
  useCloseOnOutside(open, onClose, panelRef, anchorEl);

  const utils = api.useUtils();

  // Load active view (to hydrate the local toggle state)
  const viewQ = api.view.get.useQuery(
    { viewId: viewId ?? "" },
    { enabled: !!viewId && open }
  );

  // Local working set (fast toggle, then save)
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Hydrate on open / when view data loads
  useEffect(() => {
    if (!open) return;
    const raw = (viewQ.data as { hidden?: unknown } | undefined)?.hidden;
    const ids =
      Array.isArray(raw) ? (raw as unknown[]).filter((x) => typeof x === "string") : [];
    setHidden(new Set(ids));
  }, [open, viewQ.data]);

  // Save (debounced) on change
  const save = api.view.updateConfig.useMutation({
    onSuccess: (updated) => {
      // keep caches in sync immediately
      utils.view.listByTable.setData({ tableId }, (old) =>
        old?.map((v) => (v.id === updated.id ? { ...v, hidden: updated.hidden } : v))
      );
      utils.view.get.setData({ viewId: updated.id }, (old) =>
        old ? { ...old, hidden: updated.hidden } : old
      );
    },
  });

  // Debounce: collect quick flips into one write
  const debounceRef = useRef<number | null>(null);
  const queueSave = (nextHidden: Set<string>) => {
    if (!viewId) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      save.mutate({ viewId, hidden: Array.from(nextHidden) });
    }, 150);
  };

  const toggle = (id: string) => {
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      queueSave(n);
      return n;
    });
  };

  const hideAll = () => {
    const n = new Set(columns.map((c) => c.id));
    setHidden(n);
    queueSave(n);
  };

  const showAll = () => {
    const n = new Set<string>();
    setHidden(n);
    queueSave(n);
  };

  // Simple search
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return columns;
    return columns.filter((c) => c.name.toLowerCase().includes(needle));
  }, [columns, q]);

  if (!open) return null;

  return (
    <Portal>
      <div
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        data-menulayer="true"
        style={{ position: strategy, top: y ?? 0, left: x ?? 0, width }}
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[1002]"
        role="dialog"
        aria-modal="true"
      >
        {/* Top: search (36px total height incl. margins) */}
        <div className="mt-2 mx-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a field"
            className="h-8 w-full rounded px-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="h-px bg-gray-200 mx-3 mb-2" />

        {/* Middle: list */}
        <div className="max-h-[300px] overflow-auto px-4 pb-2">
          {items.map((c) => {
            const off = hidden.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center justify-between py-1 text-sm hover:bg-gray-50 rounded cursor-pointer"
                title={off ? "Show field" : "Hide field"}
              >
                <div className="flex items-center gap-3">
                  {/* little status dot */}
                  <span
                    className={[
                      "inline-block h-2.5 w-2.5 rounded-full",
                      off ? "bg-gray-300" : "bg-green-500",
                    ].join(" ")}
                  />
                  <span className="text-gray-800">{c.name}</span>
                </div>

                <span className="text-gray-400 pr-1">⋮⋮</span>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="py-2 text-sm text-gray-500">No Results.</div>
          )}
        </div>

        {/* Bottom: actions */}
        <div className="flex gap-3 px-4 pt-1 pb-2">
          <button
            onClick={hideAll}
            className="flex-1 h-8 rounded bg-gray-100 text-sm hover:bg-gray-200 cursor-pointer"
          >
            Hide all
          </button>
          <button
            onClick={showAll}
            className="flex-1 h-8 rounded bg-gray-100 text-sm hover:bg-gray-200 cursor-pointer"
          >
            Show all
          </button>
        </div>
      </div>
    </Portal>
  );
}
