// app/baseComponents/grid/index.tsx
"use client";

// If you prefer separate imports:
import { useGridData, useColumnSizingState, useEditingKey, useOptimisticCreateRow, useOptimisticUpdateCell } from "./hooks";
import { useDynamicColumns, useRowNumberColumn } from "./columns";
import TableView from "./tableView";
import { isCuid } from "./isCuid";
// MUI ICONS
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import FormatColorFillOutlinedIcon from '@mui/icons-material/FormatColorFillOutlined';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DvrOutlinedIcon from '@mui/icons-material/DvrOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';


export default function BaseGrid({ tableId }: { tableId: string }) {
  const { columnsQ, rowsQ, data } = useGridData(tableId);
  const { columnSizing, setColumnSizing } = useColumnSizingState();
  const { editingKey, setEditingKey } = useEditingKey();

  const updateCell = useOptimisticUpdateCell(tableId, rowsQ);
  const createRow = useOptimisticCreateRow(tableId, columnsQ, rowsQ);

  const rowNumCol = useRowNumberColumn();
  const dynamicCols = useDynamicColumns({
    columnsData: columnsQ.data?.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    editingKey,
    setEditingKey,
    updateCell,
  });

  const columns = [rowNumCol, ...dynamicCols];
  const loading = columnsQ.isLoading || rowsQ.isLoading;

  const creatingOptimistic = !isCuid(tableId);

  if (creatingOptimistic) {
    return (
      <div className="p-4 text-sm text-gray-500">Creating table…</div>
    );
  }

  return (
    <>
      <div className="bg-white">
        {/* Top bar: views and all table options */}
        <div className="flex h-[48px] items-center justify-between border-b border-gray-200 px-3">
          {/* LEFT: menu + view selector */}
          <div className="flex items-center gap-1">
            <button
              className="h-8 w-8 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center justify-center cursor-pointer"
              aria-label="Table menu"
              title="Table menu"
            >
              <MenuOutlinedIcon fontSize="small" />
            </button>

            <button
              className="h-8 px-2 rounded-sm hover:bg-gray-100 text-gray-600 flex items-center gap-2 cursor-pointer"
              aria-haspopup="menu"
              title="Change view"
            >
              <TableChartOutlinedIcon fontSize="small" className="opacity-80" style={{ color: "rgb(22, 110, 225)"}}/>
              <span className="text-[13px] text-grey-600 font-medium">Grid view</span>
              <span className="inline-block text-gray-500"><ExpandMoreIcon/></span>
            </button>
          </div>

          {/* RIGHT: everything else, aligned to the far right */}
          <div className="ml-auto flex items-center gap-1">
            <button className="h-8 px-2 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center gap-2 cursor-pointer" title="Hide fields">
              <VisibilityOffOutlinedIcon fontSize="small" />
              <span className="text-[13px]">Hide fields</span>
            </button>

            <button className="h-8 px-2 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center gap-2 cursor-pointer" title="Filter">
              <FilterListOutlinedIcon fontSize="small" />
              <span className="text-[13px]">Filter</span>
            </button>

            <button className="h-8 px-2 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center gap-2 cursor-pointer" title="Group">
              <DvrOutlinedIcon fontSize="small" />
              <span className="text-[13px]">Group</span>
            </button>

            <button className="h-8 px-2 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center gap-2 cursor-pointer" title="Sort">
              <SwapVertIcon fontSize="small" />
              <span className="text-[13px]">Sort</span>
            </button>

            <button className="h-8 px-2 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center gap-2 cursor-pointer" title="Color">
              <FormatColorFillOutlinedIcon fontSize="small" />
              <span className="text-[13px]">Color</span>
            </button>

            <button className="h-8 px-2 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center gap-2 cursor-pointer" title="Share and sync">
              <IosShareOutlinedIcon fontSize="small" />
              <span className="text-[13px]">Share and sync</span>
            </button>

            <div
              className="h-8 ml-1 flex items-center gap-2 rounded-sm px-2 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-indigo-500 cursor-pointer"
              title="Search"
            >
            <SearchRoundedIcon fontSize="small" className="text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-sm text-gray-500">Loading grid…</div>
      ) : (
        <TableView
          tableId={tableId} 
          data={data}
          columns={columns}
          columnSizing={columnSizing}
          setColumnSizing={setColumnSizing}
          onAddRow={() => createRow.mutate({ tableId })}
        />
      )}

    </>
  );
}
