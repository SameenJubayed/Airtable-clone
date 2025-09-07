// app/baseComponents/grid/FieldPanel.tsx
"use client";

import FieldEditorPopover from "./FieldEditorPopover";

type Mode = "create" | "edit";
type FieldType = "TEXT" | "NUMBER";

type Props = {
  tableId: string;
  open: boolean;
  onClose: () => void;
  // anchor = the header cell’s DOMRect
  anchorRect: DOMRect | null;
  // "leftEdge" => align to column left; "rightEdge" => align to column right
  align: "leftEdge" | "rightEdge";
  mode: Mode;
  initial?: { columnId?: string; name?: string; type?: FieldType; position?: number };
};

export default function FieldPanel({
  tableId,
  open,
  onClose,
  anchorRect,
  align,
  mode,
  initial,
}: Props) {
  // map where we want to allign to
  const mappedAlign =
    align === "rightEdge" ? "leftAtRightEdge" : "leftEdge";

  return (
    <FieldEditorPopover
      tableId={tableId}
      open={open}
      onClose={onClose}
      anchorRect={anchorRect}
      align={mappedAlign} // "leftEdge" | "rightEdge"
      mode={mode} // "create" | "edit"
      initial={initial}
      labels={
        mode === "edit"
          ? { titleEdit: "Edit field", btnSave: "Save" }
          : { titleCreate: "Create field", btnCreate: "Create field" }
      }
    />
  );
}
