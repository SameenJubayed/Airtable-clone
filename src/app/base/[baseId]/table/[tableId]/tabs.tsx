// app/base/[baseId]/table/[tableId]/tabs.tsx
"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Menu, MenuItem } from "~/app/baseComponents/grid/uiPopover";
// MUI Icons
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

export default function TableTabs({
  baseId,
  activeTableId,
}: { baseId: string; activeTableId: string }) {
  const router = useRouter();
  const utils = api.useUtils();

  // Fetch tables for this base
  const tablesQ = api.table.listByBase.useQuery({ baseId });

  // ---------- RENAME ----------
  const rename = api.table.rename.useMutation({
    onMutate: async ({ tableId, name }) => {
      await utils.table.listByBase.cancel({ baseId });
      const previous = utils.table.listByBase.getData({ baseId }) ?? [];

      utils.table.listByBase.setData({ baseId }, (old) =>
        (old ?? []).map((t) => (t.id === tableId ? { ...t, name } : t))
      );

      return { previous, tableId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.table.listByBase.setData({ baseId }, ctx.previous);
    },
    onSettled: () => void utils.table.listByBase.invalidate({ baseId }),

    onSuccess: async (_data, vars) => {
      if (vars.tableId === activeTableId) {
        router.replace(`/base/${baseId}/table/${activeTableId}`);
      }
    },
  });

  // ---------- DELETE ----------
  const remove = api.table.delete.useMutation({
    onMutate: async ({ tableId }) => {
      await utils.table.listByBase.cancel({ baseId });

      const previous = utils.table.listByBase.getData({ baseId }) ?? [];
      const wasActive = tableId === activeTableId;

      // computing the "after" list we'll show optimistically
      const after = previous.filter((t) => t.id !== tableId);

      // apply optimistic cache
      utils.table.listByBase.setData({ baseId }, after);

      // If we are deleting the currently active table, optimistically route to first
      // table in base
      let navigatedTo: string | null = null;
      if (wasActive) {
        const nextId = after[0]?.id ?? null;
        if (nextId) {
          navigatedTo = nextId;
          router.replace(`/base/${baseId}/table/${nextId}`);
        } else {
          // No tables left — go to base root
          router.replace(`/base/${baseId}`);
        }
      }

      return {
        previous,
        wasActive,
        removedId: tableId,
        activeBefore: activeTableId,
        navigatedTo,
      };
    },

    onError: (_err, _vars, ctx) => {
      // restore cache
      if (ctx?.previous) {
        utils.table.listByBase.setData({ baseId }, ctx.previous);
      }
      // If we navigated away optimistically but the delete failed, go back
      if (ctx?.wasActive && ctx.activeBefore) {
        router.replace(`/base/${baseId}/table/${ctx.activeBefore}`);
      }
    },

    onSuccess: async () => {
      await utils.table.listByBase.invalidate({ baseId });
    },
  });

  // ---------- CREATE ----------
  function nextUniqueTableName(): string {
    const list = utils.table.listByBase.getData({ baseId }) ?? [];
    let maxN = 0;
    for (const t of list) {
      const m = /^Table\s+(\d+)$/.exec(t.name);
      if (m) maxN = Math.max(maxN, parseInt(m[1]!, 10));
    }
    return `Table ${maxN + 1}`;
  }

  const create = api.table.createWithDefaults.useMutation({
    onMutate: async (vars) => {
      await utils.table.listByBase.cancel({ baseId });
      const previous = utils.table.listByBase.getData({ baseId }) ?? [];

      const tempId = `optimistic-${Date.now()}`;
      const name = vars.name?.trim() ?? nextUniqueTableName();

      utils.table.listByBase.setData({ baseId }, (old) => {
        const arr = old ?? previous;
        const optimisticItem = {
          id: tempId,
          name,
          createdAt: new Date(),
          position: arr.length,
        };
        router.push(`/base/${baseId}/table/${tempId}?creating=1`);
        return [...arr, optimisticItem];
      });

      return { previous, tempId };
    },
    onSuccess: async ({ id }, _vars, ctx) => {
      utils.table.listByBase.setData({ baseId }, (old) =>
        old?.map((t) => (t.id === ctx?.tempId ? { ...t, id } : t))
      );
      router.replace(`/base/${baseId}/table/${id}`);
      await utils.table.listByBase.invalidate({ baseId });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.table.listByBase.setData({ baseId }, ctx.previous);
    },
  });

  // ---------- UI ----------
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});


  if (tablesQ.isLoading) return <div className="h-9 bg-gray-100" />;
  const tabs = tablesQ.data ?? [];
  const lastIsActive = tabs[tabs.length - 1]?.id === activeTableId;

  return (
    <div className="h-8 w-full bg-gray-100">
      <div className="h-8 w-full flex items-stretch">
        <div className="flex h-full items-stretch">
          {tabs.map((t, i, arr) => {
            const isActive = t.id === activeTableId;
            const prevIsActive = i > 0 && arr[i - 1]?.id === activeTableId;

            const handleLeftClick = () => {
              if (isActive) {
                setOpenMenuId((cur) => (cur === t.id ? null : t.id));
              } else {
                // if any table menu is open, do not navigate.
                if (openMenuId !== null) return;
                router.push(`/base/${baseId}/table/${t.id}`);
              }
            };

            const handleContextMenu: React.MouseEventHandler<HTMLDivElement> = (e) => {
              e.preventDefault();
              setOpenMenuId(t.id);
            };

            return (
              <Fragment key={t.id}>
                {i > 0 && !isActive && !prevIsActive && (
                  <div className="self-center h-3 w-px bg-gray-300" />
                )}

                <div
                  ref={(el) => { tabRefs.current[t.id] = el; }}
                  onClick={handleLeftClick}
                  onContextMenu={handleContextMenu}
                  className={[
                    "relative h-full flex items-center",
                    "text-[13px] leading-none select-none transition-colors",
                    isActive
                      ? "bg-white text-gray-900 font-medium"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-300 hover:font-medium cursor-pointer",
                    "rounded-t-sm first:rounded-l-none border-0",
                  ].join(" ")}
                  title={t.name}
                >
                  <div
                    className={[
                      "h-full flex items-center whitespace-nowrap truncate max-w-[180px]",
                      isActive ? "pl-3 pr-2 justify-start" : "px-3 justify-center w-full",
                    ].join(" ")}
                  >
                    <span className="truncate">{t.name}</span>
                    {isActive && (
                      <span className="ml-1 mr-1 w-5 h-5 flex items-center justify-center rounded-sm">
                        <ExpandMoreIcon fontSize="small" />
                      </span>
                    )}
                  </div>

                  <Menu
                    open={openMenuId === t.id}
                    anchorEl={tabRefs.current[t.id] ?? null}
                    width={200}
                    onRequestClose={() => setOpenMenuId(null)}
                  >
                    <MenuItem
                      onClick={() => {
                        const newName = prompt("Enter new table name:", t.name);
                        if (newName) {
                          rename.mutate({ tableId: t.id, name: newName.trim() });
                        }
                        setOpenMenuId(null);
                      }}
                      className="flex items-center"
                    >
                      <EditOutlinedIcon fontSize="small" className="text-gray-500 mr-2" />
                      Rename table
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        if (confirm(`Delete table "${t.name}"? This cannot be undone.`)) {
                          remove.mutate({ tableId: t.id });
                        }
                        setOpenMenuId(null);
                      }}
                      className="flex items-center"
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" className="text-gray-500 mr-2" />
                      Delete table
                    </MenuItem>
                  </Menu>
                </div>
              </Fragment>
            );
          })}

          {!lastIsActive && <div className="self-center h-3 w-px bg-gray-300" />}

          <button
            onClick={() =>
              create.mutate({
                baseId,
                name: nextUniqueTableName(),
              })
            }
            aria-label="Add table"
            title="Add table"
            className="h-full px-2 text-sm leading-none bg-gray-100 text-gray-400 flex items-center cursor-pointer hover:text-gray-500 border-0 rounded-none"
          >
            <AddIcon fontSize="small" />
          </button>
        </div>
      </div>
    </div>
  );
}
