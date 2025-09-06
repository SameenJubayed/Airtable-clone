// app/baseComponents/grid/Portal.tsx
"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

export default function Portal({ children }: { children: React.ReactNode }) {
  const mount = useMemo(() => document.body, []);
  const el = useMemo(() => document.createElement("div"), []);

  useEffect(() => {
    el.style.position = "relative";
    el.style.zIndex = "9999"; // over the grid
    mount.appendChild(el);
    return () => { mount.removeChild(el); };
  }, [el, mount]);

  return createPortal(children, el);
}
