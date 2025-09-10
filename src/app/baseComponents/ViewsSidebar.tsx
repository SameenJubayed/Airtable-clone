"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api } from "~/trpc/react";
import { useViews } from "./ViewsLayout";
import AddIcon from "@mui/icons-material/Add";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";

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

  const nextGridName = (() => {
    let maxN = 1;
    for (const v of views) {
      const m = /^Grid\s+(\d+)$/i.exec(v.name.trim());
      if (m) maxN = Math.max(maxN, parseInt(m[1]!, 10));
    }
    return `Grid ${maxN + 1}`;
  })();

  const goTo = async (viewId: string) => {
    if (viewId === activeViewId) return;

    setSwitchingViewId(viewId);

    const key = { tableId, viewId, skip: 0, take: 200 } as const;
    void utils.row.list.invalidate(key);
    try {
      await (utils.row.list as any).ensureData?.(key) ?? utils.row.list.prefetch(key);
    } catch {}

    const sp = new URLSearchParams(params.toString());
    sp.set("viewId", viewId);
    router.push(`${pathname}?${sp.toString()}`);
  };

  const create = api.view.create.useMutation({
    onSuccess: async (created) => {
      await viewsQ.refetch();
      // jump straight into the new view
      const sp = new URLSearchParams(params.toString());
      sp.set("viewId", created.id);
      router.push(`${pathname}?${sp.toString()}`);
    },
  });

  return (
    <aside
      className="h-full border-r border-gray-200 bg-white"
      style={{ width: 280 }}
    >
      {/* top padding: px-8px, py-10px */}
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
              return (
                <li key={v.id}>
                  <button
                    onClick={() => goTo(v.id)}
                    className={[
                      "w-full flex items-center gap-2 rounded px-2 py-1 text-left text-sm",
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-700 hover:bg-gray-100",
                    ].join(" ")}
                  >
                    <TableChartOutlinedIcon
                      fontSize="small"
                      className="opacity-80"
                      style={{ color: active ? "rgb(22,110,225)" : undefined }}
                    />
                    <span className="truncate">{v.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
