// app/baseComponents/grid/uiPopover.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Portal from "./Portal";
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  type Placement,
} from "@floating-ui/react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/** Close the whole panel on ESC or outside (respects nested menus via data-menulayer="true") */
export function useCloseOnOutside(
  open: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLDivElement | null>,
  anchorEl?: HTMLElement | null
) {
  useEffect(() => {
    if (!open) return;

    const isInsideAnyMenuLayer = (node: Node | null): boolean => {
      let el: HTMLElement | null = node as HTMLElement | null;
      while (el) {
        if (el.dataset?.menulayer === "true") return true;
        el = el.parentElement;
      }
      return false;
    };

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // clicks inside any menu layer (main panel or submenus) should NOT close
      if (isInsideAnyMenuLayer(t)) return;
      if (panelRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, panelRef, anchorEl]);
}

/** Floating-ui wrapper wired to an external anchor element */
export function useFloatingForAnchor(
  anchorEl: HTMLElement | null,
  open: boolean,
  placement: Placement,
  middleware = [offset(1), flip(), shift({ padding: 8 })]
) {
  const floating = useFloating({
    placement,
    strategy: "fixed",
    middleware,
  });

  useEffect(() => {
    if (!open || !anchorEl) return;
    floating.refs.setReference(anchorEl);

    const floatingEl = floating.refs.floating.current;
    if (!floatingEl) return;

    return autoUpdate(anchorEl, floatingEl, floating.update);
  }, [open, anchorEl, floating.refs, floating.update]);

  return floating;
}

/** Simple anchored portal menu with its own outside/ESC close */
export function Menu({
  open,
  anchorEl,
  width = 220,
  children,
  onRequestClose,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  width?: number;
  children: React.ReactNode;
  onRequestClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { x, y, strategy, refs } = useFloatingForAnchor(
    anchorEl,
    open,
    "bottom-start"
  );

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return; // click inside -> keep open
      if (anchorEl?.contains(t)) return; // click trigger -> let it toggle
      onRequestClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onRequestClose();

    document.addEventListener("mousedown", onDocMouseDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onRequestClose, anchorEl]);

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
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[1002] py-1"
        role="menu"
      >
        {children}
      </div>
    </Portal>
  );
}

export function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left text-sm px-3 py-2 hover:bg-gray-100"
    >
      {children}
    </button>
  );
}

/** Shared segment (button/input) styles */
export const segCls = (first = false, last = false) =>
  [
    "h-8 px-2",
    "border border-gray-200 bg-white",
    "text-sm text-gray-800",
    "inline-flex items-center justify-between",
    first ? "" : "-ml-px",
    first ? "rounded-l-sm" : "rounded-none",
    last ? "rounded-r-sm" : "rounded-none",
    "hover:bg-gray-100",
    "focus:outline-none",
  ].join(" ");

/** Shared list-item class for simple menus */
export const ITEM_CLASS =
  "w-full text-left text-sm px-2 py-1 hover:bg-gray-100 flex items-center gap-2 cursor-pointer";

/** Reusable dropdown button (segment style) */
export function DD({
  value,
  label,
  onClick,
  first,
  last,
  widthClass,
  title,
  btnRef,
  rightIcon = <ExpandMoreIcon className="opacity-60" fontSize="small" />,
  submenuTrigger,
}: {
  value?: string;
  label?: string;
  onClick?: () => void;
  first?: boolean;
  last?: boolean;
  widthClass?: string;
  title?: string;
  btnRef?: React.Ref<HTMLButtonElement>;
  rightIcon?: React.ReactNode;
  submenuTrigger?: boolean;
}) {
  const text = value ?? label ?? "";
  return (
    <button
      ref={btnRef}
      type="button"
      title={title ?? text}
      onClick={onClick}
      className={[segCls(first, last), widthClass ?? "w-40", "cursor-pointer"].join(" ")}
      data-submenu-trigger={submenuTrigger ? "true" : undefined}
    >
      <span className="truncate">{text}</span>
      {rightIcon}
    </button>
  );
}

/** Lightweight inline dropdown (no portal) for small submenus */
export function InlineMenu({
  open,
  children,
  width = 220,
}: {
  open: boolean;
  children: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      className="absolute mt-1 z-[1003] rounded-md border border-gray-200 bg-white shadow-lg py-1"
      style={{ width }}
      data-submenu="true"
    >
      {children}
    </div>
  );
}
