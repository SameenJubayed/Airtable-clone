"use client";

import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import { useCloseOnOutside, useFloatingForAnchor } from "./uiPopover";
import type { Placement } from "@floating-ui/react";
import { api } from "~/trpc/react";

const DEBOUNCE_MS = 300;

export default function SearchPopover({
  open,
  onClose,
  anchorEl,
  tableId,
  viewId,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  tableId: string;
  viewId?: string | null;
}) {
  const width = 300;
  const placement = "bottom-end" as Placement;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const { x, y, strategy, refs } = useFloatingForAnchor(anchorEl, open, placement);

  const utils = api.useUtils();
  const update = api.view.updateConfig.useMutation({
    onSuccess: (updated) => {
      // keep caches in sync, but do not refetch rows
      utils.view.listByTable.setData({ tableId }, (old) =>
        old?.map((v) => (v.id === updated.id ? { ...v, search: updated.search } : v))
      );
      utils.view.get.setData({ viewId: updated.id }, (old) =>
        old ? { ...old, search: updated.search } : old
      );
    },
  });

  // hydrate from the view for convenience (usually empty because we clear on close)
  const viewQ = api.view.get.useQuery(
    { viewId: viewId ?? "" },
    { enabled: !!viewId && open }
  );
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const raw = (viewQ.data as { search?: unknown } | undefined)?.search;
    setQ(typeof raw === "string" ? raw : "");
  }, [open, viewQ.data]);

  // commit helpers
  const commit = (val: string) => {
    if (!viewId) return;
    update.mutate({ viewId, search: val.trim() === "" ? null : val });
  };

  // debounce: “user stopped typing”
  const tRef = useRef<number | null>(null);
  const queueCommit = (val: string) => {
    if (!viewId) return;
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => commit(val), DEBOUNCE_MS);
  };

  // close → clear (remove highlight)
  const closeAndClear = () => {
    if (tRef.current) window.clearTimeout(tRef.current);
    if (viewId) update.mutate({ viewId, search: null });
    onClose();
  };

  useCloseOnOutside(open, closeAndClear, panelRef, anchorEl);

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
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[1002] p-2"
        role="dialog"
        aria-modal="true"
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            queueCommit(v);           // commit only after pause
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {  // commit immediately
              if (tRef.current) window.clearTimeout(tRef.current);
              commit(q);
            } else if (e.key === "Escape") {
              closeAndClear();
            }
          }}
          onBlur={closeAndClear}      // click-away closes and clears
          placeholder="Find in view"
          className="w-full h-[38px] rounded px-3 text-sm outline-none ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </Portal>
  );
}
