// app/base/[baseId]/table/[tableId]/tabs.tsx
"use client";

import { Fragment,  } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import AddIcon from "@mui/icons-material/Add";

export default function TableTabs({
  baseId,
  activeTableId,
}: { baseId: string; activeTableId: string }) {
  const router = useRouter();
  const utils = api.useUtils();

  const tablesQ = api.table.listByBase.useQuery({ baseId });

  const create = api.table.createWithDefaults.useMutation({
    onMutate: async (vars) => {
      await utils.table.listByBase.cancel({ baseId });

      const previous = utils.table.listByBase.getData({ baseId });

      const tempId = `optimistic-${Date.now()}`;
      const name = vars.name ?? `Table ${(previous?.length ?? 0) + 1}`;

      utils.table.listByBase.setData({ baseId }, (old) => {
        const arr = (old ?? []);
        const optimisticItem = {
          id: tempId,
          name,
          createdAt: new Date(),
          position: arr.length, // append to end
        };

        // go to the brand-new temp tab immediately
        router.push(`/base/${baseId}/table/${tempId}?creating=1`);

        return [...arr, optimisticItem];
      });

      return { previous, tempId };
    },  
    
    onSuccess: async ({ id }, _vars, ctx) => {
      // swap temp id -> real id in cache
      utils.table.listByBase.setData({ baseId }, (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === ctx?.tempId ? { ...t, id } : t
        );
      });

      void Promise.all([
        utils.column.listByTable.invalidate({ tableId: id }),
        utils.row.list.invalidate({ tableId: id, skip: 0, take: 200 }),
      ]);

      router.replace(`/base/${baseId}/table/${id}`);
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        utils.table.listByBase.setData({ baseId }, ctx.previous);
      }
    },

    onSettled: () => void utils.table.listByBase.invalidate({ baseId }),
  });

  if (tablesQ.isLoading) {
    return <div className="h-9 bg-gray-100" />;
  }

  const tabs = tablesQ.data ?? [];
  const lastIsActive = tabs[tabs.length - 1]?.id === activeTableId;

  return (
    <div className="h-8 w-full bg-gray-100">
      <div className="h-8 w-full flex items-stretch">
        {/* Tabs group (no gaps) */}
        <div className="flex h-full items-stretch">
          {tabs.map((t, i, arr) => {
            const isActive = t.id === activeTableId;
            const prevIsActive = i > 0 && arr[i - 1]?.id === activeTableId;

            return (
              <Fragment key={t.id}>
                {/* Divider BEFORE tabs, only show when not firs tab and tab not active */}
                {i > 0 && !isActive && !prevIsActive && (
                  <div className="self-center h-3 w-px bg-gray-300" />
                )}
                <button
                  onClick={() => router.push(`/base/${baseId}/table/${t.id}`)}
                  title={t.name}
                  className={[
                    "h-full text-[13px] leading-none flex items-center justify-center select-none",
                    // width: 84 when active, 64 when inactive
                    isActive ? "w-[84px]" : "w-[64px]",
                    // background and text
                    isActive
                      ? "bg-white text-gray-900 font-medium"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-300 hover:font-medium",
                    // subtle rounding, but not on the very first tab's left edge
                    "rounded-t-sm first:rounded-l-none",
                    // no borders, no gaps
                    "border-0 px-1",
                  ].join(" ")}
                >
                  <span className="truncate max-w-[160px]">{t.name}</span> 
                </button>

              </Fragment>
            );
          })}

          {/* Divider before the + button, unless the last tab is active */}
          {!lastIsActive && <div className="self-center h-3 w-px bg-gray-300" />}

          {/* + Add table button, same strip rules */}
          <button
            onClick={() =>
              create.mutate({
                baseId,
                name: `Table ${(tablesQ.data?.length ?? 0) + 1}`,
                
              })
            }
            aria-label="Add table"
            title="Add table"
            className="
              h-full px-2 
              text-sm leading-none
              bg-gray-100 text-gray-400  
              flex items-center 
              cursor-pointer
              hover:text-gray-500
              border-0 rounded-none"
          >
            <AddIcon fontSize="small" className=""/>
          </button>
        </div>
      </div>
    </div>
  );
}

