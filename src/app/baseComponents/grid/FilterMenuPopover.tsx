"use client";

import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";

// icons
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

// floating ui
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  type Placement,
} from "@floating-ui/react";

type ColumnLite = { id: string; name: string; type: "TEXT" | "NUMBER" };

type Props = {
  open: boolean;
  onClose: () => void;
  /** pass the Filter button element so we can align to its RIGHT edge */
  anchorEl: HTMLElement | null;
  /** visible columns for the “Name” dropdown */
  columns: ColumnLite[];
};

type Operator =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty";

const OP_LABEL: Record<Operator, string> = {
  contains: "contains",
  not_contains: "does not contain",
  is: "is",
  is_not: "is not",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

type Cond = {
  id: string;
  fieldId: string | null;
  op: Operator;
  value: string; // just text for now
};

function useCloseOnOutside(
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
        if ((el).dataset?.menulayer === "true") return true;
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

function useFloatingForAnchor(
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

  // attach external anchorEl to Floating UI reference + autoUpdate
  useEffect(() => {
    if (!open || !anchorEl) return;
    floating.refs.setReference(anchorEl);

    const floatingEl = floating.refs.floating.current;
    if (!floatingEl) return;

    return autoUpdate(anchorEl, floatingEl, floating.update);
  }, [open, anchorEl, floating.refs, floating.update]);

  return floating;
}

function Menu({
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

  // Close JUST this menu on outside click or Escape
  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return; // click inside menu -> keep open
      if (anchorEl?.contains(t)) return; // click on its button -> let button toggle it
      onRequestClose(); // click anywhere else -> close this menu
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose(); // ESC just closes this menu
    };

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
function MenuItem({
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

const segCls = (first = false, last = false) =>
  [
    "h-8 px-2",
    "border border-gray-200 bg-white",
    "text-sm text-gray-800",
    "inline-flex items-center justify-between",
    first ? "" : "-ml-px", // collapse adjoining borders
    first ? "rounded-l-sm" : "rounded-none",
    last ? "rounded-r-sm" : "rounded-none",
    "hover:bg-gray-100",
    "focus:outline-none",
  ].join(" ");

// drop down button
const DD = ({
  value,
  onClick,
  first,
  last,
  widthClass,
  title,
  btnRef,
}: {
  value: string;
  onClick?: () => void;
  first?: boolean;
  last?: boolean;
  widthClass?: string;
  title?: string;
  btnRef?: React.Ref<HTMLButtonElement>;
}) => (
  <button
    ref={btnRef}
    type="button"
    title={title}
    onClick={onClick}
    className={[segCls(first, last), widthClass ?? "w-40"].join(" ")}
  >
    <span className="truncate">{value}</span>
    <ExpandMoreIcon className="opacity-60" fontSize="small" />
  </button>
);

export default function FilterMenuPopover({
  open,
  onClose,
  anchorEl,
  columns,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // local (front-end only) state
  const [logic, setLogic] = useState<"and" | "or">("and");
  const [conds, setConds] = useState<Cond[]>([]);

  // desired width based on number of conditions
  const width = conds.length === 0 ? 328 : 590;

  // floating UI for main popover — align right edge with button
  const { x, y, strategy, refs } = useFloatingForAnchor(
    anchorEl,
    open,
    "bottom-end"
  );

  // close on ESC / outside for main popover
  useCloseOnOutside(open, onClose, panelRef, anchorEl);

  if (!open) return null;

  /* ------------------------------ Row component ------------------------------ */

  const OP_ITEMS: Operator[] = [
    "contains",
    "not_contains",
    "is",
    "is_not",
    "is_empty",
    "is_not_empty",
  ];

  const FIELD_MENU_W = 180;
  const OP_MENU_W = 180;
  const LOGIC_MENU_W = 64;

  const Row = ({ c, idx }: { c: Cond; idx: number }) => {
    const fieldName = columns.find((x) => x.id === c.fieldId)?.name ?? "Name";

    // menu anchors per-row
    const logicBtnRef = useRef<HTMLButtonElement | null>(null);
    const fieldBtnRef = useRef<HTMLButtonElement | null>(null);
    const opBtnRef = useRef<HTMLButtonElement | null>(null);

    const [logicOpen, setLogicOpen] = useState(false);
    const [fieldOpen, setFieldOpen] = useState(false);
    const [opOpen, setOpOpen] = useState(false);

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
            <span className="text-sm text-gray-700 px-2 select-none">
              {logic}
            </span>
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
                        x.id === c.id ? { ...x, fieldId: col.id } : x
                      )
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
                      prev.map((x) => (x.id === c.id ? { ...x, op } : x))
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
            value={c.value}
            onChange={(e) =>
              setConds((prev) =>
                prev.map((x) =>
                  x.id === c.id ? { ...x, value: e.target.value } : x
                )
              )
            }
            placeholder="Enter a value"
            className={[segCls(false, false), "flex-1 min-w-[120px] text-left"].join(
              " "
            )}
          />

          {/* Delete + Drag */}
          <button
            type="button"
            className={[segCls(false, false), "w-8 justify-center"].join(" ")}
            title="Delete"
            onClick={() =>
              setConds((prev) => prev.filter((x) => x.id !== c.id))
            }
          >
            <DeleteOutlineOutlinedIcon fontSize="small" className="text-gray-500" />
          </button>
          <span
            className={[segCls(false, true), "w-8 justify-center text-gray-500"].join(
              " "
            )}
            title="Drag to reorder"
          >
            <DragIndicatorOutlinedIcon fontSize="small" className="text-gray-400" />
          </span>
        </div>
      </div>
    );
  };

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
        // onClick={() => {}}
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
        style={{
          position: strategy,
          top: y ?? 0,
          left: x ?? 0,
          width,
        }}
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
                <Row key={c.id} c={c} idx={i} />
              ))}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="h-[34px] px-2 pb-2">{addBar}</div>
      </div>
    </Portal>
  );
}
