// app/baseComponents/ViewsLayout.tsx
"use client";

import { createContext, useContext, useState } from "react";
import ViewsSidebar from "./ViewsSidebar";

type ViewsCtxType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  switchingViewId: string | null;
  setSwitchingViewId: (v: string | null) => void;
  searchQ: string;                            
  setSearchQ: (v: string) => void;
};

const ViewsCtx = createContext<ViewsCtxType | null>(null);
export const useViews = () => useContext(ViewsCtx)!;

export default function ViewsLayout({
  tableId,
  children,
}: { tableId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [switchingViewId, setSwitchingViewId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const railW = 280;

  return (
    <ViewsCtx.Provider value={{ open, setOpen, switchingViewId, setSwitchingViewId, searchQ, setSearchQ }}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Top bar (action bar) */}
        <div className="shrink-0">
          {Array.isArray(children) ? children[0] : null}
        </div>

        {/* Content area with slide-in views rail */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div
            className="absolute top-0 bottom-0 left-0 bg-white border-r border-gray-200 transition-[transform,opacity] duration-200"
            style={{
              width: railW,
              transform: open ? "translateX(0)" : `translateX(-${railW}px)`,
              opacity: open ? 1 : 0,
            }}
          >
            <ViewsSidebar tableId={tableId} />
          </div>

          {/* The container that holds the scrollport from TableLayout */}
          <div
            className="h-full min-h-0 flex flex-col overflow-hidden transition-[margin] duration-200"
            style={{ marginLeft: open ? railW : 0 }}
          >
            {Array.isArray(children) ? children.slice(1) : children}
          </div>
        </div>
      </div>
    </ViewsCtx.Provider>
  );
}
