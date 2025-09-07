// app/baseComponents/grid/AddFieldButton.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";
import Portal from "./Portal";
import { useOptimisticAddColumn } from "./hooks";

type Props = { tableId: string };

export default function AddFieldButton({ tableId }: Props) {
  const [open, setOpen] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<"TEXT" | "NUMBER">("TEXT");

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const MARGIN = 8;
  const GAP = 8;
  const setCoordsIfChanged = (next: { top: number; left: number }) => {
    setCoords((prev) =>
      prev && prev.top === next.top && prev.left === next.left ? prev : next
    );
  };

  const computePosition = useCallback(() => {
    const btn = btnRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;

    const r = btn.getBoundingClientRect();
    // measure actual rendered size (not a constant)
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;

    // 1) prefer left-edge aligned (panel left = button left)
    let left = r.left;

    // 2) if that would overflow, try centered on the button
    if (left + pw + MARGIN > window.innerWidth) {
      const centered = r.left + r.width / 2 - pw / 2;
      if (centered >= MARGIN && centered + pw <= window.innerWidth - MARGIN) {
        left = centered;
      } else {
        // 3) fallback: right-edge aligned (panel right = button right)
        left = r.right - pw;
      }
    }

    // clamp to viewport just in case
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - pw - MARGIN);

    // always open UNDER the button; clamp so the buttons remain visible
    let top = r.bottom + GAP;
    top = Math.min(top, window.innerHeight - ph - MARGIN);
    top = Math.max(MARGIN, top);

    setCoordsIfChanged({ top, left });
  }, []);

  // Recalculate after opening (so panel has dimensions),
  // and on scroll/resize.
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

    // run once after the panel mounts so size is known
    schedule();

    // prefer the closest scrollable ancestor; if that’s awkward,
    // fall back to window for simplicity.
    let scrollTarget: Element | Window = window;

    // Try to find the nearest scroll container of the table
    const el = btnRef.current;
    if (el) {
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const style = getComputedStyle(p);
        const scrollable =
          /(auto|scroll|overlay)/.test(style.overflow) ||
          /(auto|scroll|overlay)/.test(style.overflowX) ||
          /(auto|scroll|overlay)/.test(style.overflowY);
        if (scrollable) {
          scrollTarget = p;
          break;
        }
        p = p.parentElement;
      }
    }

    const onScroll = schedule;
    const onResize = schedule;

    // passive listeners; no capture (we don’t need every nested scroll)
    scrollTarget.addEventListener("scroll", onScroll, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollTarget.removeEventListener("scroll", onScroll as EventListener);
      window.removeEventListener("resize", onResize);
    };
  }, [open, computePosition]);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const addColumn = useOptimisticAddColumn(tableId, {
    onOptimisticApplied: () => {
      // immediate UI reset for snappiness
      setOpen(false);
      setFieldName("");
      setFieldType("TEXT");
    },
  });

  const handleCreate = () => {
    const name = fieldName.trim();
    if (!name || addColumn.isPending) return;
    addColumn.mutate({ tableId, name, type: fieldType });
  };

  return (
    <div className="relative h-full w-full flex items-center justify-center">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          h-8 w-[94px] 
          inline-flex items-center justify-center gap-1 
          rounded-sm text-[13px] text-gray-600 
          hover:bg-gray-100
        "
        title="Add field"
        aria-expanded={open}
      >
        <AddIcon fontSize="small" />
      </button>

      {open && (
        <Portal>
          <div
            ref={panelRef}
            id="add-field-panel"
            role="dialog"
            aria-modal="true"
            style={{ position: "fixed", top: coords?.top, left: coords?.left }}
            className="rounded-md border border-gray-200 bg-white shadow-lg p-3 w-[280px] z-50"
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Field name</label>
                <input
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  className="
                    w-full rounded px-2 py-1
                    border border-gray-300  
                    text-sm outline-none 
                    focus:border-indigo-500
                  "
                  placeholder="Field name"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as "TEXT" | "NUMBER")}
                  className="
                    w-full px-2 py-1 
                    rounded border border-gray-300  
                    text-sm outline-none 
                    focus:border-indigo-500
                  "
                >
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="
                    h-8 px-3 rounded 
                    border border-gray-300 
                    text-sm text-gray-700 
                    hover:bg-gray-50
                  "
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!fieldName.trim() || addColumn.isPending}
                  className="
                    h-8 px-3 rounded 
                    bg-indigo-600 
                    text-white text-sm 
                    hover:bg-indigo-700 disabled:opacity-60
                  "
                >
                  {addColumn.isPending ? "Creating…" : "Create field"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
