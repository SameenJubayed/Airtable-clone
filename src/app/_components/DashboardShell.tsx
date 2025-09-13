"use client";

import { useState, useMemo, type PropsWithChildren } from "react";
import { Header } from "./Header";
import { Sidebar, SIDEBAR_CONSTANTS } from "./Sidebar";


export function DashboardShell({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);

  const headerH = 56;
  const leftOffset = useMemo(
    () => (open ? SIDEBAR_CONSTANTS.PANEL_WIDTH : SIDEBAR_CONSTANTS.RAIL_WIDTH),
    [open],
  );

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900">
      <Header
        persistentOpen={open}
        onTogglePersistent={() => setOpen((v) => !v)}
      />

      {/* Sidebar is fixed; content area is padded left */}
      <Sidebar
        headerHeight={headerH}
        persistentOpen={open}
        hoverOpen={hoverOpen}
        onHoverChange={setHoverOpen}
      />
      <div
        className="transition-[margin] duration-200"
        style={{ marginLeft: leftOffset }}
      >
        <div className="max-w-6xl px-4 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
