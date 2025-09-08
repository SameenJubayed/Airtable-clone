"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Portal from "./Portal";
import FormatLineSpacingIcon from "@mui/icons-material/FormatLineSpacing";

type Props = {
  anchorEl: HTMLButtonElement | null;     // the line-spacing button element
  open: boolean;
  onClose: () => void;
  value: number;                          // current row height
  options: Array<{ label: string; value: number }>;
  onChange: (next: number) => void;       // calls setRowHeight(next)
};

export default function RowHeightMenu({
  anchorEl,
  open,
  onClose,
  value,
  options,
  onChange,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const computePosition = useCallback(() => {
    if (!anchorEl || !panelRef.current) return;
    const r = anchorEl.getBoundingClientRect();
    const pw = panelRef.current.offsetWidth;
    const ph = panelRef.current.offsetHeight;

    // Right edge aligned with button’s right edge, below the button
    let left = r.right - pw;
    let top = r.bottom + 1;

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));

    setCoords({ top, left });
  }, [anchorEl]);

  // Recompute on open, resize, scroll
  useEffect(() => {
    if (!open) return;
    computePosition();
    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, computePosition]);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, anchorEl, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div
        ref={panelRef}
        role="menu"
        aria-label="Select a row height"
        style={{ position: "fixed", top: coords?.top, left: coords?.left }}
        className="
          z-50 w-[125px] rounded-md border border-gray-200 bg-white shadow-lg
          py-2
        "
      >
        <div className="px-2 text-[11px] text-gray-500 text-center">Select a row height</div>
        <ul className="py-1">
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onChange(opt.value);
                    onClose();
                  }}
                  className={[
                    "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                    selected ? "text-indigo-400 font-medium" : "text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {/* simple leading icon, same for all—keeps the look consistent */}
                  <FormatLineSpacingIcon fontSize="small" className={selected ? "opacity-90" : "opacity-60"} />
                  <span>{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Portal>
  );
}