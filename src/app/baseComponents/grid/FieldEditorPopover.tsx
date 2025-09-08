// app/baseComponents/grid/FieldEditorPopover.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Portal from "./Portal";
import { api } from "~/trpc/react";

type FieldType = "TEXT" | "NUMBER";
type Mode = "create" | "edit";

export type FieldEditorPopoverProps = {
  tableId: string;

  /** Control */
  open: boolean;
  onClose: () => void;

  /** Positioning: use EITHER anchorEl or anchorRect */
  anchorEl?: HTMLElement | null;
  anchorRect?: DOMRect | null;

  /**
   * Horizontal alignment preference for the panel relative to the anchor:
   * - "leftEdge": panelLeft = anchor.left
   * - "rightEdge": panelRight = ancho.right
   * - "leftAtRightEdge": paneLLeft = anchor.right 
   * - "auto": try leftEdge → centered → rightEdge (fits viewport)
   */
  align?: "leftEdge" | "rightEdge" | "leftAtRightEdge" | "auto";

  /** Vertical gap below the anchor (default 8) */
  gap?: number;

  /** Mode & initial data (for edit or insert-at-position) */
  mode: Mode;
  initial?: {
    columnId?: string;
    name?: string;
    type?: FieldType;
    position?: number; // used for create (insert at index)
  };

  /** labels for the button */
  labels?: Partial<{
    btnCreate: string;
    btnSave: string;
  }>;

  /** Optional callback on create */
  onCreate?: (vars: { name: string; type: FieldType; position?: number }) => void;
};

export default function FieldEditorPopover({
  tableId,
  open,
  onClose,
  anchorEl,
  anchorRect: rectProp,
  align = "auto",
  gap = 8,
  mode,
  initial,
  labels,
  onCreate
}: FieldEditorPopoverProps) {
  const utils = api.useUtils();

  // --- form state
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<FieldType>(initial?.type ?? "TEXT");
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    const nextType: FieldType = initial?.type ?? "TEXT";
    setType(nextType);
  }, [open, initial?.name, initial?.type]);

  // --- server mutations
  const rename = api.column.rename.useMutation();
  const changeType = api.column.changeType.useMutation();

  // --- dom refs (panel, anchor)
  const panelRef = useRef<HTMLDivElement | null>(null);
  const anchorRect = useMemo(() => {
    if (rectProp) return rectProp;
    const el = anchorEl;
    return el ? el.getBoundingClientRect() : null;
  }, [rectProp, anchorEl]);

  // --- position state
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const MARGIN = 8;

  const computePosition = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || !anchorRect) return;

    const r = anchorRect;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;

    let left: number;

    const tryLeft = () => r.left;
    const tryCentered = () => r.left + r.width / 2 - pw / 2;
    const tryRight = () => r.right - pw;
    const tryLeftAtRight = () => r.right;

    switch (align) {
      case "leftEdge":
        left = tryLeft();
        break;
      case "rightEdge":
        left = tryRight();
        break;
      case "leftAtRightEdge":
        left = tryLeftAtRight();
        break;
      default: {
        // auto: left → centered → right
        left = tryLeft();
        if (left + pw + MARGIN > window.innerWidth) {
          const c = tryCentered();
          left =
            c < MARGIN || c + pw > window.innerWidth - MARGIN
              ? tryRight()
              : c;
        }
      }
    }

    // clamp horizontal
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - pw - MARGIN);

    // place below, clamp vertical
    let top = r.bottom + gap;
    top = Math.min(top, window.innerHeight - ph - MARGIN);
    top = Math.max(MARGIN, top);

    setCoords((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [anchorRect, align, gap]);

  // recalc when open, on resize/scroll, with rAF for smoothness
  useEffect(() => {
    if (!open) return;

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        computePosition();
      });
    };

    schedule(); // after mount

    // find closest scrollable ancestor for the anchor
    let scrollTarget: Element | Window = window;
    if (anchorEl) {
      let p: HTMLElement | null = anchorEl.parentElement;
      while (p) {
        const s = getComputedStyle(p);
        const scrollable =
          /(auto|scroll|overlay)/.test(s.overflow) ||
          /(auto|scroll|overlay)/.test(s.overflowX) ||
          /(auto|scroll|overlay)/.test(s.overflowY);
        if (scrollable) {
          scrollTarget = p;
          break;
        }
        p = p.parentElement;
      }
    }

    scrollTarget.addEventListener("scroll", schedule, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollTarget.removeEventListener("scroll", schedule as EventListener);
      window.removeEventListener("resize", schedule);
    };
  }, [open, computePosition, anchorEl]);

  // close on outside / Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose, anchorEl]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (mode === "create") {
      if (onCreate) {
        // optimisticCreation
        onCreate({ name: trimmed, type, position: initial?.position });
        return; 
      }
    } else if (initial?.columnId) {
      if (trimmed !== initial.name) {
        await rename.mutateAsync({ columnId: initial.columnId, name: trimmed });
      }
      if (type !== initial.type) {
        await changeType.mutateAsync({ columnId: initial.columnId, type });
      }
    }

    await utils.column.listByTable.invalidate({ tableId });
    await utils.row.list.invalidate({ tableId, skip: 0, take: 200 });
    onClose();
  };

  if (!open) return null;

  const T = {
    btnCreate: labels?.btnCreate ?? "Create field",
    btnSave: labels?.btnSave ?? "Save",
  };

  return (
    <Portal>
      <div
        ref={panelRef}
        style={{ position: "fixed", top: coords?.top, left: coords?.left }}
        className="w-[280px] rounded-md border border-gray-200 bg-white shadow-lg p-3 z-[1001]"
        role="dialog"
        aria-modal="true"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Field name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded px-2 py-1 border border-gray-300 text-sm outline-none focus:border-indigo-500"
              placeholder="Field name"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="w-full px-2 py-1 rounded border border-gray-300 text-sm outline-none focus:border-indigo-500"
            >
              <option value="TEXT">Text</option>
              <option value="NUMBER">Number</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="h-8 px-3 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 cursor-pointer"
            >
              {mode === "create" ? T.btnCreate : T.btnSave}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
