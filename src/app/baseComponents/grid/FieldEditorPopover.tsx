// app/baseComponents/grid/FieldEditorPopover.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Portal from "./Portal";
import { api } from "~/trpc/react";

// Floating UI
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  type VirtualElement,
  type Placement,
} from "@floating-ui/react";

// Reuse your existing outside-click helper
import { useCloseOnOutside } from "./uiPopover";

type FieldType = "TEXT" | "NUMBER";
type Mode = "create" | "edit";

export type FieldEditorPopoverProps = {
  tableId: string;

  open: boolean;
  onClose: () => void;

  /** Positioning: use EITHER anchorEl or anchorRect */
  anchorEl?: HTMLElement | null;
  anchorRect?: DOMRect | null;

  /**
   * Horizontal alignment preference for the panel relative to the anchor:
   * - "leftEdge": panelLeft = anchor.left
   * - "rightEdge": panelRight = anchor.right
   * - "leftAtRightEdge": panelLeft = anchor.right (attach to the right edge)
   * - "auto": bottom-start with flip/shift
   */
  align?: "leftEdge" | "rightEdge" | "leftAtRightEdge" | "auto";

  /** Vertical gap below the anchor (default 8) */
  gap?: number;

  mode: Mode;
  initial?: {
    columnId?: string;
    name?: string;
    type?: FieldType;
    position?: number;
  };

  labels?: Partial<{
    btnCreate: string;
    btnSave: string;
  }>;

  onCreate?: (vars: { name: string; type: FieldType; position?: number }) => void;
};

export default function FieldEditorPopover({
  tableId,
  open,
  onClose,
  anchorEl,
  anchorRect,
  align = "auto",
  gap = 8,
  mode,
  initial,
  labels,
  onCreate,
}: FieldEditorPopoverProps) {
  const utils = api.useUtils();

  // --- form state
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<FieldType>(initial?.type ?? "TEXT");
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? "TEXT");
  }, [open, initial?.name, initial?.type]);

  // server mutations (non optimistic)
  const rename = api.column.rename.useMutation();
  const changeType = api.column.changeType.useMutation();

  // Map align → Floating UI placement
  const placement: Placement =
    align === "rightEdge" ? "bottom-end" : "bottom-start";

  // Build a VirtualElement when we get a DOMRect or when we need to
  // “fake” an anchor whose left is the original right edge.
  const reference: HTMLElement | VirtualElement | null = useMemo(() => {
    const rect = anchorRect ?? anchorEl?.getBoundingClientRect() ?? null;
    if (!rect) return anchorEl ?? null;

    if (align === "leftAtRightEdge") {
      const r = rect;
      const vRect: DOMRect = {
        x: r.right,
        y: r.top,
        width: 0,
        height: r.height,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.right,
        toJSON: () => ({}),
      } as unknown as DOMRect;
      return { getBoundingClientRect: () => vRect };
    }

    // If we were given a rect explicitly, stick to a virtual element for stability
    if (anchorRect) {
      const v: DOMRect = { ...anchorRect, toJSON: () => ({}) } as unknown as DOMRect;
      return { getBoundingClientRect: () => v };
    }

    // Default: use the real element
    return anchorEl ?? null;
  }, [anchorEl, anchorRect, align]);

  const { x, y, strategy, refs } = useFloating({
    placement,
    strategy: "fixed",
    middleware: [offset(gap), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: (ref, floating, update) => autoUpdate(ref, floating, update),
  });

  useEffect(() => {
    if (!open || !reference) return;
    refs.setReference(reference);
  }, [open, reference, refs]);

  // Close on ESC / outside — treat the anchorEl as "inside" so clicking the button toggles correctly
  const panelRef = useRef<HTMLDivElement | null>(null);
  useCloseOnOutside(open, onClose, panelRef, anchorEl ?? undefined);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (mode === "create") {
      onCreate?.({ name: trimmed, type, position: initial?.position });
      onClose();
      return;
    }

    if (mode === "edit" && initial?.columnId) {
      if (trimmed !== initial.name) {
        await rename.mutateAsync({ columnId: initial.columnId, name: trimmed });
      }
      if (type !== initial.type) {
        await changeType.mutateAsync({ columnId: initial.columnId, type });
      }
      await utils.column.listByTable.invalidate({ tableId });
      await utils.row.list.invalidate({ tableId, skip: 0 });
      onClose();
    }
  };

  if (!open) return null;

  const T = {
    btnCreate: labels?.btnCreate ?? "Create field",
    btnSave: labels?.btnSave ?? "Save",
  };

  return (
    <Portal>
      <div
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        data-menulayer="true"
        role="dialog"
        aria-modal="true"
        style={{ position: strategy, top: y ?? 0, left: x ?? 0 }}
        className="w-[280px] rounded-md border border-gray-200 bg-white shadow-lg p-3 z-[1002]"
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
