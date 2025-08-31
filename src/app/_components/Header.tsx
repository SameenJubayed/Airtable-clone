"use client";

import { IconButton, Tooltip } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import Image from "next/image";
import Link from "next/link";

type HeaderProps = {
  persistentOpen: boolean;
  onTogglePersistent: () => void;
};

export function Header({ persistentOpen, onTogglePersistent }: HeaderProps) {
  const label = persistentOpen ? "Collapse sidebar" : "Expand sidebar";
  
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/95 px-3 backdrop-blur shadow-xs">
      {/* Left: sidebar toggle + logo */}
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip title={label}>
          <IconButton
            aria-label={label}
            onClick={onTogglePersistent}
            size="small"
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Airtable lgo */}
        <div className="flex items-center gap-2">
          <Link href="/home">
            <Image src="/airtable-vector.svg" alt="Airtable" width={155} height={50} priority />
          </Link>
        </div>
      </div>

      {/* Center: search bar */}
      <div className="mx-auto w-full items-center justify-center md:flex hover:pointer">
        <div className="flex w-full max-w-[354px] items-center rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm">
          <svg viewBox="0 0 24 24" className="mr-2 h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.5-4.5" />
          </svg>
          <input
            type="text"
            placeholder="Search…"
            className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-600 focus:outline-none"
          />
          <span className="ml-auto px-1.5 py-0.5 text-[13px] leading-none opacity-60 whitespace-nowrap">ctrl K</span>
        </div>
      </div>

      {/* Right: sign out */}
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/api/auth/signout"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
        >
          Sign out
        </Link>
        {/* or:
        <button onClick={() => signOut()} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
          Sign out
        </button> */}
      </div>
    </header>
  );
}
