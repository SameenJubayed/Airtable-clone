"use client";

import * as React from "react";
import { DashboardShell } from "../_components/DashboardShell";

export default function DashboardLayout({
  children,
}: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
