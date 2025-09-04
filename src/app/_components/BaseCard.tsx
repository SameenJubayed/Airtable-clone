// app/_components/BaseCard.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react"
import { api } from "~/trpc/react";
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

type Props = {
  id: string;
  name: string;
  updatedAt?: string | Date; 
  starred?: boolean;
};

function timeAgo(input?: string | Date) {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - d.getTime(); // ms
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Opened just now";
  if (minutes < 60) return `Opened ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Opened ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Opened ${days} day${days === 1 ? "" : "s"} ago`;
}

export function BaseCard({ id, name, updatedAt, starred = false }: Props) {
  const utils = api.useUtils();
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(name);
  const [localStarred, setLocalStarred] = useState(starred);

  // Mutations
  const rename = api.base.rename.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.base.listMine.invalidate(),
        utils.base.listStarred.invalidate(),
      ]);
    },
  });

  const setStarred = api.base.setStarred.useMutation({
    onMutate: async (vars) => {
      // optimistically flip the state
      setLocalStarred(vars.starred);
    },
    onError: (_err, vars) => {
      // revert if it failed (back to pre-click value)
      setLocalStarred(!vars.starred);
    },
    onSettled: async () => {
      // always sync with backend afterwards
      await Promise.all([
        utils.base.listMine.invalidate(),
        utils.base.listStarred.invalidate(),
      ]);
    },
  });

  useEffect(() => {
    setLocalStarred(starred);
  }, [starred]);

  const del = api.base.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.base.listMine.invalidate(),
        utils.base.listStarred.invalidate(),
      ]);
    },
  });

  const subtitle = useMemo(() => timeAgo(updatedAt), [updatedAt]);

  const initials = useMemo(() => {
    const s = localName.trim();
    return (s[0]?.toUpperCase() ?? "") + (s[1]?.toLowerCase() ?? "");
  }, [localName]);

  const commitRename = () => {
    const next = localName.trim();
    setEditing(false);
    if (!next || next === name) {
      setLocalName(name);
      return;
    }
    void rename.mutateAsync({ baseId: id, name: next });
  };

  const CardInner = (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition group-hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700 font-semibold">
        {initials}
      </div>

      <div className="min-w-0 flex-1 pr-10">
        {!editing ? (
          <>
            <div className="truncate font-medium text-gray-900">{localName}</div>
            <div className="text-xs text-gray-500">
              {/* swap text on hover */}
              <span className="group-hover:hidden">{subtitle || "Open base"}</span>
              <span className="hidden group-hover:inline">Open base</span>
            </div>
          </>
        ) : (
          <input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setLocalName(name);
              }
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
            autoFocus
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="relative group">
      {!editing ? (
        <Link href={`/base/${id}`} className="block">
          {CardInner}
        </Link>
      ) : (
        <div className="block">{CardInner}</div>
      )}

      {/* Action cluster */}
      {!editing && (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {[
            {
              key: "star",
              onClick: (e: React.MouseEvent) => { 
                e.preventDefault();
                e.stopPropagation();
                void setStarred.mutateAsync({ baseId: id, starred: !localStarred });
              },
              icon: localStarred ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />,
              label: localStarred ? "Unstar base" : "Star base",
            },
            {
              key: "rename",
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
              },
              icon: <EditIcon fontSize="small" />,
              label: "Rename base",
            },
            {
              key: "delete",
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm("Delete this base? This cannot be undone.")) return;
                void del.mutateAsync({ baseId: id });
              },
              icon: <DeleteIcon fontSize="small" />,
              label: "Delete base",
            },
          ].map((btn) => (
            <button
              key={btn.key}
              aria-label={btn.label}
              onClick={btn.onClick}
              className="
                cursor-pointer rounded p-1 text-gray-600
                ring-1 ring-black/5 bg-white/95
                transition
                group-hover:shadow-sm
                hover:shadow-md hover:ring-black/15 hover:bg-white
              "
            >
              {btn.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
