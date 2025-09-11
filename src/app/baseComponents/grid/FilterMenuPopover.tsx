// app/baseComponents/grid/FilterMenuPopover.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Portal from "./Portal";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import {
  useCloseOnOutside,
  useFloatingForAnchor,
  Menu,
  MenuItem,
  segCls,
  DD,
} from "./uiPopover";
import type { Placement } from "@floating-ui/react";
import { api } from "~/trpc/react";

/* ----------------------------- Types & Labels ----------------------------- */

type ColumnLite = { id: string; name: string; type: "TEXT" | "NUMBER" };
type ServerOp = "contains" | "notContains" | "eq" | "isEmpty" | "isNotEmpty" | "gt" | "lt";

export type Operator =
  | "contains"
  | "not_contains"
  | "is"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "lt";

const OP_LABEL: Record<Operator, string> = {
  contains: "contains",
  not_contains: "does not contain",
  is: "is",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  gt: "greater than",
  lt: "less than",
};

// UI <-> server mapping
const toServerOp: Record<Operator, ServerOp> = {
  contains: "contains",
  not_contains: "notContains",
  is: "eq",
  is_empty: "isEmpty",
  is_not_empty: "isNotEmpty",
  gt: "gt",
  lt: "lt",
};

const fromServerOp: Record<ServerOp, Operator> = {
  contains: "contains",
  notContains: "not_contains",
  eq: "is",
  isEmpty: "is_empty",
  isNotEmpty: "is_not_empty",
  gt: "gt",
  lt: "lt",
};

export type Cond = {
  id: string;
  fieldId: string | null;
  op: Operator;
  value: string;
};

type ServerFilterPayload = { columnId: string; op: ServerOp; value?: string | number };

/* ------------------------------ Memo Row ---------------------------------- */

type RowProps = {
  c: Cond;
  idx: number;
  columns: ColumnLite[];
  logic: "and" | "or";
  setLogic: (v: "and" | "or") => void;
  setConds: React.Dispatch<React.SetStateAction<Cond[]>>;
  FIELD_MENU_W: number;
  OP_MENU_W: number;
  LOGIC_MENU_W: number;
};

export const Row: React.FC<RowProps> = React.memo(function Row({
  c,
  idx,
  columns,
  logic,
  setLogic,
  setConds,
  FIELD_MENU_W,
  OP_MENU_W,
  LOGIC_MENU_W,
}) {
  const col = columns.find((x) => x.id === c.fieldId) ?? columns[0];
  const fieldName = col?.name ?? "Name";
  const colType = col?.type ?? "TEXT";

  const OP_ITEMS: Operator[] =
    colType === "NUMBER"
      ? (["gt", "lt"] as const)
      : (["contains", "not_contains", "is", "is_empty", "is_not_empty"] as const);

  // per-row anchors & open states
  const logicBtnRef = useRef<HTMLButtonElement | null>(null);
  const fieldBtnRef = useRef<HTMLButtonElement | null>(null);
  const opBtnRef = useRef<HTMLButtonElement | null>(null);
  const [logicOpen, setLogicOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);

  const isEmptyOp = c.op === "is_empty" || c.op === "is_not_empty";
  const isNumber = colType === "NUMBER";

  return (
    <div className="w-full h-[40px] flex items-center gap-2">
      {/* Logic cell */}
      <div className="w-16">
        {idx === 0 ? (
          <span className="text-sm text-gray-700 px-2 select-none">Where</span>
        ) : idx === 1 ? (
          <>
            <DD
              value={logic}
              onClick={() => setLogicOpen((v) => !v)}
              widthClass="w-16"
              first
              last
              title="Change logic"
              btnRef={logicBtnRef}
            />
            <Menu
              open={logicOpen}
              anchorEl={logicBtnRef.current}
              width={LOGIC_MENU_W}
              onRequestClose={() => setLogicOpen(false)}
            >
              <MenuItem
                onClick={() => {
                  setLogic("and");
                  setLogicOpen(false);
                }}
              >
                and
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setLogic("or");
                  setLogicOpen(false);
                }}
              >
                or
              </MenuItem>
            </Menu>
          </>
        ) : (
          <span className="text-sm text-gray-700 px-2 select-none">{logic}</span>
        )}
      </div>

      {/* Connected segment group */}
      <div className="flex items-stretch min-w-0 flex-1">
        {/* Field dropdown */}
        <>
          <DD
            value={fieldName}
            onClick={() => setFieldOpen((v) => !v)}
            first
            title="Field"
            btnRef={fieldBtnRef}
          />
          <Menu
            open={fieldOpen}
            anchorEl={fieldBtnRef.current}
            width={FIELD_MENU_W}
            onRequestClose={() => setFieldOpen(false)}
          >
            {columns.map((col) => (
              <MenuItem
                key={col.id}
                onClick={() => {
                  setConds((prev) =>
                    prev.map((x) =>
                      x.id === c.id
                        ? {
                            ...x,
                            fieldId: col.id,
                            // TEXT and NUMBER ops are disjoint, always reset
                            op: col.type === "NUMBER" ? "gt" : "contains",
                          }
                        : x,
                    ),
                  );
                  setFieldOpen(false);
                }}
              >
                {col.name}
              </MenuItem>
            ))}
          </Menu>
        </>

        {/* Operator dropdown */}
        <>
          <DD
            value={OP_LABEL[c.op]}
            onClick={() => setOpOpen((v) => !v)}
            title="Operator"
            btnRef={opBtnRef}
          />
          <Menu
            open={opOpen}
            anchorEl={opBtnRef.current}
            width={OP_MENU_W}
            onRequestClose={() => setOpOpen(false)}
          >
            {OP_ITEMS.map((op) => (
              <MenuItem
                key={op}
                onClick={() => {
                  setConds((prev) =>
                    prev.map((x) =>
                      x.id === c.id
                        ? {
                            ...x,
                            op,
                            value: op === "is_empty" || op === "is_not_empty" ? "" : x.value,
                          }
                        : x,
                    ),
                  );
                  setOpOpen(false);
                }}
              >
                {OP_LABEL[op]}
              </MenuItem>
            ))}
          </Menu>
        </>

        {/* Value input */}
        <input
          type={isNumber ? "number" : "text"}
          inputMode={isNumber ? "decimal" : undefined}
          step={isNumber ? "any" : undefined}
          disabled={isEmptyOp}
          value={isEmptyOp ? "" : c.value}
          onChange={(e) =>
            setConds((prev) =>
              prev.map((x) => (x.id === c.id ? { ...x, value: e.target.value } : x)),
            )
          }
          placeholder={isEmptyOp ? undefined : "Enter a value"}
          className={[
            segCls(false, false),
            "flex-1 min-w-[120px] text-left",
            isEmptyOp ? "opacity-60 cursor-not-allowed bg-gray-50" : "",
          ].join(" ")}
        />

        {/* Delete + Drag */}
        <button
          type="button"
          className={[segCls(false, false), "w-8 justify-center cursor-pointer"].join(" ")}
          onClick={() => setConds((prev) => prev.filter((x) => x.id !== c.id))}
        >
          <DeleteOutlineOutlinedIcon fontSize="small" className="text-gray-500" />
        </button>
        <span
          className={[segCls(false, true), "w-8 justify-center text-gray-500 cursor-grab"].join(
            " ",
          )}
        >
          <DragIndicatorOutlinedIcon fontSize="small" className="text-gray-400" />
        </span>
      </div>
    </div>
  );
});

/* --------------------------- Main Popover --------------------------------- */

export default function FilterMenuPopover({
  open,
  onClose,
  anchorEl,
  columns,
  tableId,
  viewId,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  columns: ColumnLite[];
  tableId: string;
  viewId?: string | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // NOTE: backend currently ANDs all filters; we keep UI logic state for later.
  const [logic, setLogic] = useState<"and" | "or">("and");
  const [conds, setConds] = useState<Cond[]>([]);

  const width = conds.length === 0 ? 328 : 590;

  const { x, y, strategy, refs } = useFloatingForAnchor(anchorEl, open, "bottom-end" as Placement);
  useCloseOnOutside(open, onClose, panelRef, anchorEl);

  const utils = api.useUtils();

  // --- Save to server (write-through cache on success)
  const updateView = api.view.updateConfig.useMutation({
    onSuccess: async (updated) => {
      // keep list cache in sync
      utils.view.listByTable.setData({ tableId }, (old) =>
        old?.map((v) => (v.id === updated.id ? { ...v, filters: updated.filters } : v)),
      );
      // keep single-view cache in sync (Sort menu reads from here)
      utils.view.get.setData({ viewId: updated.id }, (old) =>
        old ? { ...old, filters: updated.filters } : old,
      );
      // refresh rows for this view
      await utils.row.list.invalidate({ tableId, viewId: updated.id, skip: 0, take: 200 });
    },
  });



  // --- Read active view to hydrate popover
  const viewsQ = api.view.listByTable.useQuery({ tableId }, { enabled: !!tableId });
  const { data: viewList, isSuccess: viewsLoaded } = viewsQ;
  const activeView = useMemo(
    () => viewList?.find((v) => v.id === (viewId ?? "")),
    [viewList, viewId],
  );

  // Keep a payload mirror to avoid re-posting the same thing
  const lastSentRef = useRef<string>("");

  // Hydrate from server when popover opens — but only after views are loaded.
  useEffect(() => {
    if (!open) return;
    if (!viewsLoaded) return; // don't clobber local state while loading
    if (!activeView) return;

    const raw = activeView.filters as
      | { columnId: string; op: ServerOp; value?: string | number }[]
      | undefined;

    // If DB has no filters, show empty builder; otherwise map to UI state
    const nextConds: Cond[] =
      (raw ?? []).map((f) => ({
        id: crypto.randomUUID(),
        fieldId: f.columnId,
        op: fromServerOp[f.op],
        value: f.value == null ? "" : String(f.value),
      })) ?? [];

    setConds(nextConds);

    // Align the dedup key so auto-save doesn't immediately re-send on open
    const canonicalPayload = JSON.stringify(raw ?? []);
    lastSentRef.current = canonicalPayload;
  }, [open, viewsLoaded, activeView]);

  // Build server payload from UI state
  const buildServerFilters = useCallback<() => ServerFilterPayload[]>(() => {
    return conds
      .filter((c) => !!c.fieldId)
      .map((c) => {
        const col = columns.find((cc) => cc.id === c.fieldId);
        const op = toServerOp[c.op];

        const val =
          op === "isEmpty" || op === "isNotEmpty"
            ? undefined
            : col?.type === "NUMBER"
            ? c.value === "" ? undefined : Number(c.value)
            : c.value;

        return { columnId: c.fieldId!, op, ...(val === undefined ? {} : { value: val }) };
      });
  }, [conds, columns]);

  // Auto-save on EVERY change 
  useEffect(() => {
    if (!open || !viewId) return;
    const filtersPayload = buildServerFilters();
    const payloadKey = JSON.stringify(filtersPayload);
    if (payloadKey === lastSentRef.current) return;

    const t = window.setTimeout(() => {
      lastSentRef.current = payloadKey;
      updateView.mutate({ viewId, filters: filtersPayload });
    }, 250);

    return () => window.clearTimeout(t);
  }, [open, viewId, buildServerFilters, updateView]);

  if (!open) return null;

  const FIELD_MENU_W = 180;
  const OP_MENU_W = 180;
  const LOGIC_MENU_W = 64;

  const addBar = (
    <div className="h-[34px] px-2 pb-2 flex items-center gap-4">
      <button
        type="button"
        className="text-sm text-gray-600 hover:text-black cursor-pointer flex items-center"
        onClick={() =>
          setConds((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              fieldId: columns[0]?.id ?? null,
              op: "contains",
              value: "",
            },
          ])
        }
      >
        <AddIcon fontSize="small" className="mr-1" />
        Add condition
      </button>
      <button
        type="button"
        className="text-sm text-gray-600 hover:text-black cursor-pointer flex items-center"
        onClick={() => void 0 /* groups not implemented yet */}
      >
        <AddIcon fontSize="small" className="mr-1" />
        Add condition group
      </button>
    </div>
  );

  return (
    <Portal>
      <div
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        role="dialog"
        aria-modal="true"
        data-menulayer="true"
        style={{ position: strategy, top: y ?? 0, left: x ?? 0, width }}
        className="rounded-md border border-gray-200 bg-white shadow-lg z-[1000]"
      >
        {/* Top bar */}
        <div className="h-[30px] px-4 pt-3 text-[13px] text-[#616670]">
          In this view, show records
        </div>

        {/* Rows */}
        <div className="px-4 pt-3 pb-2">
          {conds.length === 0 ? (
            <div className="h-[0]" />
          ) : (
            <div className="flex flex-col gap-2">
              {conds.map((c, i) => (
                <Row
                  key={c.id}
                  c={c}
                  idx={i}
                  columns={columns}
                  logic={logic}
                  setLogic={setLogic}
                  setConds={setConds}
                  FIELD_MENU_W={FIELD_MENU_W}
                  OP_MENU_W={OP_MENU_W}
                  LOGIC_MENU_W={LOGIC_MENU_W}
                />
              ))}
            </div>
          )}
        </div>

        {/* Add bar */}
        <div className="h-[34px] px-2 pb-2">{addBar}</div>
      </div>
    </Portal>
  );
}
