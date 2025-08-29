"use client";

import { useState } from "react";
// import { api } from "~/trpc/react";

export function CreateBaseCard() {
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    try {
      setLoading(true);
      // TODO: call your tRPC mutation, e.g.:
      // const base = await api.base.create.mutate({ name: "Untitled base" });
      // router.push(`/base/${base.id}`);
      await new Promise((r) => setTimeout(r, 400)); // placeholder
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z" />
        </svg>
      </div>
      <div>
        <div className="text-base font-medium text-gray-900">
          {loading ? "Creating…" : "Create base"}
        </div>
        <div className="text-sm text-gray-500">
          Start with a blank workspace
        </div>
      </div>
    </button>
  );
}
