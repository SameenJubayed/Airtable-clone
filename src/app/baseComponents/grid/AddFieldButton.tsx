// app/baseComponents/grid/AddFieldButton.tsx
"use client";

import { useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import FieldEditorPopover from "./FieldEditorPopover";

type Props = { tableId: string };

export default function AddFieldButton({ tableId }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="relative h-full w-full flex items-center justify-center">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-[94px] inline-flex items-center justify-center gap-1 rounded-sm text-[13px] text-gray-600 hover:bg-gray-100"
        title="Add field"
        aria-expanded={open}
      >
        <AddIcon fontSize="small" />
      </button>

      <FieldEditorPopover
        tableId={tableId}
        open={open}
        onClose={() => setOpen(false)}
        anchorEl={btnRef.current}
        align="auto" // same smart behavior you had before
        mode="create"
        labels={{ titleCreate: "Create field", btnCreate: "Create field" }}
      />
    </div>
  );
}