// app/baseComponents/grid/ColumnheaderMenu.tsx
"use client";

import Portal from "./Portal";
import { useEffect, useRef, useState } from "react";

// Icons
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SortByAlphaOutlinedIcon from "@mui/icons-material/SortByAlphaOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null; // header cell rect
  // column: { id: string; name: string; type: "TEXT" | "NUMBER"; position: number };
  onEdit: () => void;
  onInsertLeft: () => void;
  onInsertRight: () => void;
  onDuplicate?: () => void;
  onSortAsc?: () => void;
  onSortDesc?: () => void;
  onFilter?: () => void;
  onHide?: () => void;
  onDelete: () => Promise<void> | void;
};

export default function ColumnHeaderMenu({
  open,
  onClose,
  anchorRect,
  // column,
  onEdit,
  onInsertLeft,
  onInsertRight,
  onDuplicate,
  onSortAsc,
  onSortDesc,
  onFilter,
  onHide,
  onDelete,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // position: left edge of menu aligns with left edge of header
  useEffect(() => {
    if (!open || !anchorRect) return;
    const compute = () => {
      const pw = panelRef.current?.offsetWidth ?? 0;
      const ph = panelRef.current?.offsetHeight ?? 0;

      // start from the cell's LEFT edge
      let left = anchorRect.left;

      // clamp so the panel stays fully visible
      const MARGIN = 8;
      left = Math.min(Math.max(MARGIN, left), window.innerWidth - pw - MARGIN);

      const top = Math.min(anchorRect.bottom + 6, window.innerHeight - ph - MARGIN);
      setCoords({ top, left });
    };
    // compute after mount & on resize
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [open, anchorRect]);

  // close on Esc / outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const Item = ({
    icon,
    label,
    danger,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onClick?: () => void | Promise<void>;
  }) => (
    <button
      type="button"
      onClick={async () => {
        await onClick?.();
        onClose();
      }}
      className={[
        "w-full px-3 py-2 text-sm flex items-center gap-3",
        "hover:bg-gray-100",
        danger ? "text-red-600" : "text-gray-800",
      ].join(" ")}
    >
      <span className="opacity-70">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  const Divider = () => <div className="my-1 mx-3 border-t border-gray-200" />;

  return (
    <Portal>
      <div
        ref={panelRef}
        role="menu"
        style={{ position: "fixed", top: coords?.top, left: coords?.left }}
        className="w-80 p-3 rounded-md border border-gray-200 bg-white shadow-lg z-[1000]"
      >
        <Item 
          icon={<EditOutlinedIcon fontSize="small" />} 
          label="Edit field" 
          onClick={onEdit} 
        />
        <Divider />
        <Item
          icon={<ContentCopyOutlinedIcon fontSize="small" />}
          label="Duplicate field"
          onClick={onDuplicate}
        />
        <Item
          icon={<ArrowBackIcon fontSize="small" />}
          label="Insert left"
          onClick={onInsertLeft}
        />
        <Item
          icon={<ArrowForwardIcon fontSize="small" />}
          label="Insert right"
          onClick={onInsertRight}
        />
        <Divider />
        <Item
          icon={<SortByAlphaOutlinedIcon fontSize="small" />}
          label="Sort  A → Z"
          onClick={onSortAsc}
        />
        <Item
          icon={<SortByAlphaOutlinedIcon style={{ transform: "scaleX(-1)" }} fontSize="small" />}
          label="Sort  Z → A"
          onClick={onSortDesc}
        />
        <Item
          icon={<FilterListOutlinedIcon fontSize="small" />}
          label="Filter by this field"
          onClick={onFilter}
        />
        <Divider />
        <Item
          icon={<VisibilityOffOutlinedIcon fontSize="small" />}
          label="Hide field"
          onClick={onHide}
        />
        <Item
          icon={<DeleteOutlineOutlinedIcon fontSize="small" className="text-gray-700"/>}
          label="Delete field"
          danger
          onClick={onDelete}
        />
      </div>
    </Portal>
  );
}