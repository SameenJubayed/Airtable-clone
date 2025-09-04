// app/baseComponents/BaseGrid.tsx
"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { api } from "~/trpc/react";
import AddIcon from "@mui/icons-material/Add";

const ROW_H = 32;          
const COL_W = 180;         
const ROWNUM_W = 10;       

type Props = { tableId: string };

type CellRecord = {
  rowId: string;
  // dynamic column fields: [columnId]: string | number | null
  [columnId: string]: unknown;
};

export default function BaseGrid({ tableId }: Props) {
  // columns 
  const columnsQ = api.column.listByTable.useQuery({ tableId });
  // rows + cells
  const rowsQ = api.row.list.useQuery({ tableId, skip: 0, take: 200 });

  // Adds one row at the end, on success refresh to show new row
  const createRow = api.row.create.useMutation({
    onSuccess: async () => {
      await rowsQ.refetch();
    },
  });

  // update a single cell
  const updateCell = api.row.updateCell.useMutation({
    onSettled: () => rowsQ.refetch(),
  });

  // Track cell currently being editted
  const [editingKey, setEditingKey] = useState<{rowId: string; columnId: string;} | null>(null);

  // Shape server cells -> row objects for tanstack
  const data: CellRecord[] = useMemo(() => {
    if (!rowsQ.data) return [];
    const { rows, cells } = rowsQ.data;
    const map = new Map<string, CellRecord>();

    // start with row object for each row
    rows.forEach((r) => {
      map.set(r.id, { rowId: r.id });
    });
    
    // put each cell's value on its row using the columnId as the property key
    cells.forEach((c) => {
      const target = map.get(c.rowId);
      if (!target) return;
      // convert map to array for table
      target[c.columnId] = c.textValue ?? c.numberValue ?? null;
    });

    return Array.from(map.values());
  }, [rowsQ.data]);

  // Build tanstack columns dynamically from DB columns
  const dynamicCols: ColumnDef<CellRecord, unknown>[] = useMemo(() => {
    if (!columnsQ.data) return [];
    return columnsQ.data.map((col) => ({
      id: col.id,
      header: () => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{col.name}</span>
        </div>
      ),
      // tell TanStack to read row[col.id] for this column's value
      accessorKey: col.id,

      cell: (ctx) => {
        const rowId = ctx.row.original.rowId;
        const columnId = col.id;
        const value = ctx.getValue() as string | number | null | undefined;

        const isEditing = 
          editingKey?.rowId === rowId && editingKey?.columnId === columnId;

          // READ MODE
        if (!isEditing) {
          return (
            <div
              className="w-full h-8 px-3 flex items-center whitespace-nowrap overflow-hidden text-ellipsis"
              onDoubleClick={() => setEditingKey({ rowId, columnId })}
              title={value == null ? "" : String(value)} // show full value on hover
            >
              {value ?? ""}
            </div>
          );
        }

        // EDIT MODE
        const type = col.type; // "TEXT" | "NUMBER"
        return (
          <input
            autoFocus
            type={type === "NUMBER" ? "number" : "text"}
            defaultValue={
              value === null || value === undefined ? "" : String(value)
            }
            className="
              absolute inset-0 block w-full h-full box-border
              px-3
              outline-none border-0 ring-1 ring-inset ring-gray-300
              focus:ring-2 focus:ring-indigo-500
              rounded-none bg-white
            "
            onBlur={(e) => {
              const raw = e.currentTarget.value;
              setEditingKey(null);
              if (type === "NUMBER") {
                const num = raw === "" ? null : Number(raw);
                updateCell.mutate({
                  rowId,
                  columnId,
                  numberValue: Number.isNaN(num) ? null : num,
                });
              } else {
                const txt = raw.trim();
                updateCell.mutate({
                  rowId,
                  columnId,
                  textValue: txt === "" ? null : txt,
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        );
      },
      
    }));
  }, [columnsQ.data, editingKey, updateCell]);

  // virtual row-number column
  const rowNumCol: ColumnDef<CellRecord, unknown> = {
    id: "__rownum",
    header: () => <span className="text-gray-500">#</span>,
    cell: (ctx) => (
      <div className="w-full px-2 flex items-center align-center text-gray-500 select-none">
        {ctx.row.index + 1}
      </div>
    ),
  };

  const columnDefs = useMemo<ColumnDef<CellRecord, unknown>[]>(() => {
    return [rowNumCol, ...dynamicCols];
  }, [dynamicCols]);

  const table = useReactTable({
    data,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Top bar: table name area & add row */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div className="text-sm text-gray-600">Grid view</div>
        <button
          onClick={() => createRow.mutate({ tableId })}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
        >
          <AddIcon fontSize="small" />
          Add row
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-auto">
        <table className="min-w-full border-collapse table-fixed">

          {/* lock widths: first (#) narrow, others 180px */}
          <colgroup>
            {table.getAllColumns().map((col, i) => (
              <col
                key={col.id}
                style={{ width: i === 0 ? ROWNUM_W : COL_W }}
              />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-10 bg-white">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="border border-gray-300 px-3 py-2 text-left text-sm font-medium text-gray-700"
                    style={{ height: ROW_H }}
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="even:bg-gray-50/40">
                {r.getVisibleCells().map((c) => (
                  <td
                    key={c.id}
                    className="relative border border-gray-200 p-0 align-middle"
                    style={{ height: ROW_H }}
                  >
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {/* empty-state filler */}
            {data.length === 0 && (
              <tr>
                <td
                  className="px-3 py-6 text-sm text-gray-500 border-gray-400"
                  colSpan={columnDefs.length || 1}
                >
                  No rows yet. Click “Add row”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

}