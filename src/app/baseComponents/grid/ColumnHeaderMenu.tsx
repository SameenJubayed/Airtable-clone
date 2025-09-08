// app/baseComponents/grid/ColumnheaderMenu.tsx
"use client";

import Portal from "./Portal";
import { useEffect, useMemo, useRef } from "react";

// Icons
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SortByAlphaOutlinedIcon from "@mui/icons-material/SortByAlphaOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

// Floating UI
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  type VirtualElement,
} from "@floating-ui/react";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null; // header cell rect
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

  // Build a virtual reference from the DOMRect provided by the header cell
  const virtualRef: VirtualElement | null = useMemo(() => {
    if (!anchorRect) return null;
    return {
      getBoundingClientRect: () => anchorRect,
    };
  }, [anchorRect]);

  // Floating UI positioning (left edges aligned; drop below cell)
  const { x, y, strategy, refs, update } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [
      offset(1),          // small gap below the header cell
      flip(),             // flip if not enough room
      shift({ padding: 8 }) // keep within viewport
    ],
  });

  // Attach the virtual reference and keep position in sync
  useEffect(() => {
    if (!open || !virtualRef) return;

    refs.setReference(virtualRef);
    const floatingEl = refs.floating.current;
    if (!floatingEl) return;

    return autoUpdate(virtualRef, floatingEl, update);
  }, [open, virtualRef, refs, update]);

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
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        role="menu"
        data-menulayer="true"
        style={{
          position: strategy,
          top: y ?? 0,
          left: x ?? 0,
        }}
        className="w-80 p-3 rounded-md border border-gray-200 bg-white shadow-lg z-[1000]"
      >
        <Item icon={<EditOutlinedIcon fontSize="small" />} label="Edit field" onClick={onEdit} />
        <Divider />
        <Item icon={<ContentCopyOutlinedIcon fontSize="small" />} label="Duplicate field" onClick={onDuplicate} />
        <Item icon={<ArrowBackIcon fontSize="small" />} label="Insert left" onClick={onInsertLeft} />
        <Item icon={<ArrowForwardIcon fontSize="small" />} label="Insert right" onClick={onInsertRight} />
        <Divider />
        <Item icon={<SortByAlphaOutlinedIcon fontSize="small" />} label="Sort  A → Z" onClick={onSortAsc} />
        <Item
          icon={<SortByAlphaOutlinedIcon style={{ transform: "scaleX(-1)" }} fontSize="small" />}
          label="Sort  Z → A"
          onClick={onSortDesc}
        />
        <Item icon={<FilterListOutlinedIcon fontSize="small" />} label="Filter by this field" onClick={onFilter} />
        <Divider />
        <Item icon={<VisibilityOffOutlinedIcon fontSize="small" />} label="Hide field" onClick={onHide} />
        <Item
          icon={<DeleteOutlineOutlinedIcon fontSize="small" className="text-gray-700" />}
          label="Delete field"
          danger
          onClick={onDelete}
        />
      </div>
    </Portal>
  );
}
