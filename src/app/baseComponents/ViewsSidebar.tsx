// app/baseComponents/ViewsSidebar.tsx
"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import { api } from "~/trpc/react";
import { useViews } from "./ViewsLayout";
import AddIcon from "@mui/icons-material/Add";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

export default function ViewsSidebar({ tableId }: { tableId: string }) {
  const utils = api.useUtils();
  const viewsQ = api.view.listByTable.useQuery({ tableId });

  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeViewId = params.get("viewId");

  const { setSwitchingViewId } = useViews();

  const views = viewsQ.data ?? [];
  const loading = viewsQ.isLoading;

  const nextGridName = useMemo(() => {
    let maxN = 1;
    for (const v of views) {
      const m = /^Grid\s+(\d+)$/i.exec(v.name.trim());
      if (m) maxN = Math.max(maxN, parseInt(m[1]!, 10));
    }
    return `Grid ${maxN + 1}`;
  }, [views]);

  // ----- routing to a specific view -----
  const goTo = async (viewId: string) => {
    if (viewId === activeViewId) return;

    setSwitchingViewId(viewId);

    const key = { tableId, viewId, skip: 0 } as const;
    void utils.row.list.invalidate(key);
    try {
      const p = utils.row.list.ensureData?.(key) ?? utils.row.list.prefetch(key);
      await p;
    } catch {}

    const sp = new URLSearchParams(params.toString());
    sp.set("viewId", viewId);
    router.push(`${pathname}?${sp.toString()}`);
  };

  // ----- create / rename / delete mutations -----
  const create = api.view.create.useMutation({
    onSuccess: async (created) => {
      await viewsQ.refetch();
      const sp = new URLSearchParams(params.toString());
      sp.set("viewId", created.id);
      router.push(`${pathname}?${sp.toString()}`);
    },
  });

  const rename = api.view.rename.useMutation({
    onSuccess: async () => {
      await viewsQ.refetch();
    },
  });

  const del = api.view.delete.useMutation({
    onSuccess: async () => {
      await viewsQ.refetch();
    },
  });

  const firstViewForTable = api.view.firstViewForTable.useMutation();

  // inline editing state 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const commitEdit = async () => {
    const id = editingId;
    const next = editingName.trim();
    setEditingId(null);
    if (!id) return;
    if (!next) return; // ignore empty
    await rename.mutateAsync({ viewId: id, name: next });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  // ----- delete with redirect if deleting active view -----
  const deleteView = async (viewId: string) => {
    const deletingActive = viewId === activeViewId;

    await del.mutateAsync({ viewId });

    // If we removed the active view, redirect to the first remaining view (or create one)
    if (deletingActive) {
      const next = await firstViewForTable.mutateAsync({ tableId });
      if (next?.viewId) {
        await goTo(next.viewId);
      } else {
        // no views left, create a default one then go to it
        const created = await create.mutateAsync({ tableId, name: "Grid view" });
        await goTo(created.id);
      }
    }
  };

  return (
    <aside className="h-full border-r border-gray-200 bg-white" style={{ width: 280 }}>
      {/* header */}
      <div className="px-2 py-2.5">
        <button
          type="button"
          className="w-full flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
          onClick={() => create.mutate({ tableId, name: nextGridName })}
        >
          <AddIcon fontSize="small" className="text-gray-500" />
          Create new…
        </button>
      </div>

      {/* views list */}
      <div className="px-2 py-2.5">
        {loading ? (
          <div className="px-2 py-1 text-sm text-gray-500">Loading views…</div>
        ) : (
          <ul className="space-y-1">
            {views.map((v) => {
              const active =
                v.id === activeViewId || (!activeViewId && v.name === "Grid view");
              const isEditing = editingId === v.id;

              return (
                <li key={v.id} className="group">
                  <div
                    className={[
                      "w-full flex items-center gap-2 rounded px-2 py-1 text-sm",
                      active ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100",
                    ].join(" ")}
                  >
                    <TableChartOutlinedIcon
                      fontSize="small"
                      className="opacity-80 shrink-0"
                      style={{ color: active ? "rgb(22,110,225)" : undefined }}
                    />

                    {/* name / editor */}
                    {!isEditing ? (
                      <button
                        onClick={() => goTo(v.id)}
                        className="flex-1 text-left truncate"
                        title={v.name}
                      >
                        {v.name}
                      </button>
                    ) : (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500 bg-white"
                      />
                    )}

                    {/* actions (appear on hover; hidden while editing) */}
                    {!isEditing && (
                      <div className="ml-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Rename view"
                          aria-label="Rename view"
                          className="rounded p-1 text-gray-600 hover:bg-gray-200/70"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(v.id, v.name);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </button>

                        <button
                          type="button"
                          title="Delete view"
                          aria-label="Delete view"
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete view “${v.name}”? This cannot be undone.`)) {
                              void deleteView(v.id);
                            }
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
