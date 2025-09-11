// src/app/baseComponents/grid/SearchPopover.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import { useCloseOnOutside, useFloatingForAnchor } from "./uiPopover";
import type { Placement } from "@floating-ui/react";
import { useViews } from "../ViewsLayout";

const DEBOUNCE_MS = 500;

export default function SearchPopover({
  open, onClose, anchorEl,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}) {
  const width = 300;
  const placement = "bottom-end" as Placement;

  const { searchQ, setSearchQ } = useViews(); 
  const [local, setLocal] = useState(searchQ);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const { x, y, strategy, refs } = useFloatingForAnchor(anchorEl, open, placement);

  // sync local when opened
  useEffect(() => { if (open) setLocal(searchQ); }, [open, searchQ]);

  // commit helpers
  const tRef = useRef<number | null>(null);
  const commit = (v: string) => setSearchQ(v);
  const queueCommit = (v: string) => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => commit(v), DEBOUNCE_MS);
  };

  const closeAndClear = () => {
    if (tRef.current) window.clearTimeout(tRef.current);
    setSearchQ(""); // clear highlight on close
    onClose();
  };

  useCloseOnOutside(open, closeAndClear, panelRef, anchorEl);
  if (!open) return null;

  return (
    <Portal>
      <div
        ref={(node) => { panelRef.current = node; refs.setFloating(node); }}
        data-menulayer="true"
        style={{ position: strategy, top: y ?? 0, left: x ?? 0, width }}
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[1002] p-2"
        role="dialog"
        aria-modal="true"
      >
        <input
          autoFocus
          value={local}
          onChange={(e) => { const v = e.target.value; setLocal(v); queueCommit(v); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (tRef.current) window.clearTimeout(tRef.current);
              commit(local);
            } else if (e.key === "Escape") {
              closeAndClear();
            }
          }}
          onBlur={closeAndClear}
          placeholder="Find in view"
          className="w-full h-[38px] rounded px-3 text-sm outline-none ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </Portal>
  );
}
