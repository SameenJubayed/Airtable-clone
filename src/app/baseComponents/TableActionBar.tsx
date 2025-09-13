// app/baseComponents/TableActionBar.tsx
"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  useGridData,
  useColumnSizingState, 
  useRowHeight 
} from "./grid/hooks";
import FilterMenuPopover from "./grid/FilterMenuPopover";
import SortMenuPopover from "./grid/SortMenuPopover";
import RowHeightMenu from "./grid/RowHeightMenu";
import HideFieldsPopover from "./grid/HideFieldsPopover";
import SearchPopover from "./grid/SearchPopover";
import ProgressOverlay from "./grid/ProgressOverlay";
import { useViews } from "./ViewsLayout";

import { api } from "~/trpc/react";
import { COL_W, ROW_H, ROW_H_MED, ROW_H_TALL, ROW_H_XT, PAGE_TAKE } from "./grid/constants";

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
import FormatLineSpacingIcon from '@mui/icons-material/FormatLineSpacing';
import AddIcon from "@mui/icons-material/Add";

export default function BaseGrid({ tableId }: { tableId: string }) {
  const { columnsQ } = useGridData(tableId);
  const { columnSizing, setColumnSizing } = useColumnSizingState();

  // for views
  const { open, setOpen } = useViews();
  const params = useSearchParams();
  const activeViewId = params.get("viewId");
  const viewsQ = api.view.listByTable.useQuery({ tableId });
  const activeViewName = useMemo(() => {
    const list = viewsQ.data ?? [];
    if (!list.length) return "Grid view";
    // if ?viewId is missing, fall back to the first/“Grid view”
    return (
      list.find((v) => v.id === activeViewId)?.name ??
      list.find((v) => v.name === "Grid view")?.name ??
      list[0]!.name
    );
  }, [viewsQ.data, activeViewId]);

  const displayViewName = useMemo(() => {
    return activeViewName.length > 15 ? activeViewName.slice(0, 15) + "..." : activeViewName;
  }, [activeViewName]);

  const utils = api.useUtils();

  ////////////////////// RESPONSIVE TOOLBAR SIZE ///////////////////////////////
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const BREAKPOINT = 900; // px. adjust to your liking
    const onResize = () => setCompact(window.innerWidth < BREAKPOINT);
    onResize(); // initialize
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Helper to build button class depending on compact mode
  const topBtnClass = (extra = "") =>
    [
      "h-8 rounded-sm text-gray-500 hover:bg-gray-100 flex items-center cursor-pointer",
      compact ? "w-8 px-0 justify-center" : "px-2 gap-1",
      extra,
    ].join(" ");

  ////////////////////// 100K ROW STUFF ////////////////////////////////////////
  const startBulk = api.row.startBulkInsert.useMutation();
  const [jobId, setJobId] = useState<string | null>(null);

  const statusQ = api.row.getBulkJobStatus.useQuery(
    { jobId: jobId ?? "cuid_placeholder_ignore" }, // won't be used when disabled
    { enabled: !!jobId, refetchInterval: 700 }
  );

  const percent = (() => {
    const d = statusQ.data;
    if (!d) return 0;
    if (!d.total) return 0;
    return (d.inserted / d.total) * 100;
  })();

  useEffect(() => {
    if (!jobId) return;
    const s = statusQ.data?.status;
    if (s === "done") {
      setJobId(null);
      // refresh first page; infinite scroll will be added in Phase 2
      void utils.row.list.invalidate();
    }
    if (s === "error") {
      console.error("Bulk insert error:", statusQ.data?.error);
      setJobId(null);
    }
  }, [jobId, statusQ.data, utils.row.list]);

  ////////////////////// HIDE MENU + STATE /////////////////////////////////////
  const [hideOpen, setHideOpen] = useState(false);
  const hideBtnRef = useRef<HTMLButtonElement | null>(null);

  ////////////////////// FILTER MENU + STATE ///////////////////////////////////
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);

  ////////////////////// SORT MENU + STATE /////////////////////////////////////
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement | null>(null);

  ////////////////////// ROW HEIGHT + PERSISTENCE //////////////////////////////
  const { rowHeight, setRowHeight } = useRowHeight(tableId);
  // row-height menu state + anchor
  const [rhOpen, setRhOpen] = useState(false);
  const rhBtnRef = useRef<HTMLButtonElement | null>(null);

  const heightOptions = [
    { label: "Short",     value: ROW_H },
    { label: "Medium",    value: ROW_H_MED },
    { label: "Tall",      value: ROW_H_TALL },
    { label: "Extra Tall",value: ROW_H_XT },
  ];
  ////////////////////// SEARCH POPOVER + STATE ////////////////////////////////
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBtnRef = useRef<HTMLButtonElement | null>(null);

  ////////////////////// COLUMN RESIZING + PERSISTENCE /////////////////////////
  const saveWidth = api.column.setWidth.useMutation();
  // Debounced saver that only sends changed widths since last save
  const debounceRef = useRef<number | null>(null);
  const lastSavedRef = useRef<Record<string, number>>({});

  // Init columnSizing once per tableId from DB widths
  const lastInitFor = useRef<string | null>(null);
  useEffect(() => {
    const cols = columnsQ.data;
    if (!cols?.length) return; 
    if (lastInitFor.current === tableId) return;
    const initial: Record<string, number> =
      Object.fromEntries(cols.map((c) => [c.id, (c.width ?? COL_W)]) );
    setColumnSizing(initial);
    // remember what we initialized so we don't fight refetches
    lastInitFor.current = tableId;
    // also cache the last saved values baseline
    lastSavedRef.current = initial;
  }, [tableId, columnsQ.data, setColumnSizing]);

  useEffect(() => {
    if (lastInitFor.current !== tableId) return; // not initialized yet, dont run
    if (!columnsQ.data) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      // run async work in an IIFE so setTimeout callback itself returns void
      void (async () => {
        const changed: Array<[string, number]> = [];
        for (const [columnId, width] of Object.entries(columnSizing)) {
          const w = Math.round(width);
          if (w !== lastSavedRef.current[columnId]) {
            changed.push([columnId, w]);
          }
        }
        if (!changed.length) return;

        // batch writes to avoid N calls-per-frame
        await Promise.all(
          changed.map(([columnId, width]) => saveWidth.mutateAsync({ columnId, width }))
        );

        // record baseline so subsequent effects don't resend
        changed.forEach(([id, w]) => { lastSavedRef.current[id] = w; });

        // keep the listByTable cache in sync so it updates immediately 
        utils.column.listByTable.setData({ tableId }, (old) =>
          old?.map((c) => (c.id in columnSizing ? { ...c, width: Math.round(columnSizing[c.id]!) } : c))
        );
      })();
    }, 250); // run 250ms after the last drag update

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [columnSizing, tableId, columnsQ.data, saveWidth, utils.column.listByTable]);

  //////////////////////////////////////////////////////////////////////////////

  return (
    <>
      <div className="bg-white">
        {/* Top bar: views and all table options */}
        <div className="flex h-[48px] items-center justify-between border-b border-gray-200 px-3">
          {/* LEFT: menu + view selector */}
          <div className="flex items-center gap-1">
            <button
              className={topBtnClass("w-8")} 
              aria-label="Table menu"
              title="Table menu"
              onClick={() => setOpen(!open)}
            >
              <MenuOutlinedIcon fontSize="small" />
            </button>

            <button
            
              className="h-8 px-2 rounded-sm hover:bg-gray-100 text-gray-600 flex items-center gap-2 cursor-pointer"
              aria-haspopup="menu"
              title="Change view"
            >
              <TableChartOutlinedIcon fontSize="small" className="opacity-80" style={{ color: "rgb(22, 110, 225)"}}/>
              <span className="text-[13px] text-grey-600 font-medium">{displayViewName}</span>
              <span className="inline-block text-gray-500"><ExpandMoreIcon/></span>
            </button>
          </div>

          {/* RIGHT: everything else, aligned to the far right */}
          <div className="ml-auto flex items-center gap-1">            
            <button
              className={topBtnClass()}
              title="100k rows"
              aria-label="100k rows"
              onClick={async () => {
                try {
                  const { jobId } = await startBulk.mutateAsync({ tableId, total: 100_000, batchSize: 10_000 });
                  setJobId(jobId);
                } catch (e) {
                  console.error(e);
                  alert("Failed to start bulk insert");
                }
              }}
            >
              <AddIcon fontSize="small" />
              {!compact && <span className="text-[13px]">100k Rows</span>}
            </button>

            {jobId && (
              <ProgressOverlay
                percent={percent}
                label={
                  statusQ.data?.status === "running"
                    ? `Adding ${statusQ.data.inserted.toLocaleString()} / ${statusQ.data.total.toLocaleString()} rows…`
                    : "Preparing bulk insert…"
                }
              />
            )}

            <button
              ref={hideBtnRef}
              className={topBtnClass()}
              title="Hide fields"
              aria-label="Hide fields"
              onClick={() => setHideOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={hideOpen}
            >
              <VisibilityOffOutlinedIcon fontSize="small" />
              {!compact && <span className="text-[13px]">Hide fields</span>}
            </button>

            <HideFieldsPopover
              open={hideOpen}
              onClose={() => setHideOpen(false)}
              anchorEl={hideBtnRef.current}
              columns={(columnsQ.data ?? []).map(c => ({ id: c.id, name: c.name, type: c.type }))}
              tableId={tableId}
              viewId={activeViewId}
            />

            <button
              ref={filterBtnRef}
              className={topBtnClass()}
              title="Filter"
              aria-label="Filter"
              onClick={() => setFilterOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={filterOpen}
            >
              <FilterListOutlinedIcon fontSize="small" />
              {!compact && <span className="text-[13px]">Filter</span>}
            </button>

            <FilterMenuPopover
              open={filterOpen}
              onClose={() => setFilterOpen(false)}
              anchorEl={filterBtnRef.current}
              columns={(columnsQ.data ?? []).map(c => ({ id: c.id, name: c.name, type: c.type }))}
              tableId={tableId}
              viewId={activeViewId}  
              pageTake={PAGE_TAKE}            
            />

            <button className={topBtnClass()} title="Group" aria-label="Group">
              <DvrOutlinedIcon fontSize="small" />
              {!compact && <span className="text-[13px]">Group</span>}
            </button>

            <button
              ref={sortBtnRef}
              className={topBtnClass()}
              title="Sort"
              aria-label="Sort"
              onClick={() => sortBtnRef.current && setSortOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
            >
              <SwapVertIcon fontSize="small" />
              {!compact && <span className="text-[13px]">Sort</span>}
            </button>

            <SortMenuPopover
              open={sortOpen}
              onClose={() => setSortOpen(false)}
              anchorEl={sortBtnRef.current}
              tableId={tableId}
              viewId={activeViewId}
              columns={(columnsQ.data ?? []).map(c => ({ id: c.id, name: c.name, type: c.type }))}
              pageTake={PAGE_TAKE}
            />

            <button className={topBtnClass()} title="Color" aria-label="Color">
              <FormatColorFillOutlinedIcon fontSize="small" />
              {!compact && <span className="text-[13px]">Color</span>}
            </button>

            <button 
              ref={rhBtnRef}
              className={topBtnClass()}
              title="Row height" 
              aria-label="row-height-menu"
              onClick={() => setRhOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={rhOpen}
            >
              <FormatLineSpacingIcon fontSize="small" />
            </button>

            <RowHeightMenu
              anchorEl={rhBtnRef.current}
              open={rhOpen}
              onClose={() => setRhOpen(false)}
              value={rowHeight}
              options={heightOptions}
              onChange={(h) => setRowHeight(h)}
            />

            <button className={topBtnClass()} title="Filter" aria-label="Filter">
              <IosShareOutlinedIcon fontSize="small" />
              {!compact && <span className="text-[13px]">Share and sync</span>}
            </button>

            <button
              ref={searchBtnRef}
              className={topBtnClass()}
              title="Search"
              aria-label="Search"
              onClick={() => setSearchOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
            >
              <SearchRoundedIcon fontSize="small" className="text-gray-600" />
              {!compact && <span className="text-[13px]">Search</span>}
            </button>

            <SearchPopover
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              anchorEl={searchBtnRef.current}
            />
          </div>
        </div>
      </div>
    </>
  );
}
