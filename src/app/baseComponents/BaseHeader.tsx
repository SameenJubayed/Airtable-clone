// app/base/[baseId]/parts/BaseHeader.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "~/trpc/react";

export default function BaseHeader({
  baseId,
  initialName,
}: {
  baseId: string;
  initialName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();
  const rename = api.base.rename.useMutation({
    onSuccess: async () => {
      await utils.base.listMine.invalidate();
    },
  });

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== initialName) {
      await rename.mutateAsync({ baseId, name: trimmed });
    }
    setEditing(false);
  };

  const cancel = () => {
    setName((prev) => (prev.trim() ? prev : initialName));
    setEditing(false);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-20 h-14 border-b border-gray-200 bg-white pl-14">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4">
        {!editing ? (
          <h1
            className="cursor-text text-xl font-semibold text-gray-900"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {name}
          </h1>
        ) : (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") cancel();
            }}
            className="w-[340px] rounded-md border border-gray-300 px-2 py-1 text-lg font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
        {/* Right side of header can hold more controls later */}
        <div className="ml-auto text-sm text-gray-500" />
      </div>
    </header>
  );
}
