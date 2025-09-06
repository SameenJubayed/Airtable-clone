//   return (
//     <div className="h-8 w-full bg-gray-100">
//       <div className="h-8 w-full flex items-stretch">
//         {/* Tabs group (no gaps) */}
//         <div className="flex h-full items-stretch">
//           {tabs.map((t, i, arr) => {
//             const isActive = t.id === activeTableId;
//             const prevIsActive = i > 0 && arr[i - 1]?.id === activeTableId;

//             return (
//               <Fragment key={t.id}>
//                 {/* Divider BEFORE tabs, only show when not firs tab and tab not active */}
//                 {i > 0 && !isActive && !prevIsActive && (
//                   <div className="self-center h-3 w-px bg-gray-300" />
//                 )}
//                 <button
//                   onClick={() => router.push(`/base/${baseId}/table/${t.id}`)}
//                   title={t.name}
//                   aria-selected={isActive}
//                   className={[
//                     "h-full text-[13px] leading-none flex items-center justify-center select-none",
//                     // width: 84 when active, 64 when inactive
//                     isActive ? "w-[84px]" : "w-[64px]",
//                     // background and text
//                     isActive
//                       ? "bg-white text-gray-900 font-medium"
//                       : "bg-gray-100 text-gray-500 hover:bg-gray-300 hover:font-medium",
//                     // subtle rounding, but not on the very first tab's left edge
//                     "rounded-t-sm first:rounded-l-none",
//                     // no borders, no gaps
//                     "border-0 px-1",
//                   ].join(" ")}
//                 >
//                   <span className="truncate max-w-[160px]">{t.name}</span> 
//                 </button>

//               </Fragment>
//             );
//           })}

//           {/* Divider before the + button, unless the last tab is active */}
//           {!lastIsActive && <div className="self-center h-3 w-px bg-gray-300" />}

//           {/* + Add table button, same strip rules */}
//           <button
//             onClick={() =>
//               create.mutate({
//                 baseId,
//                 name: `Table ${(tablesQ.data?.length ?? 0) + 1}`,
                
//               })
//             }
//             aria-label="Add table"
//             title="Add table"
//             className="
//               h-full px-2 
//               text-sm leading-none
//               bg-gray-100 text-gray-400  
//               flex items-center 
//               cursor-pointer
//               hover:text-gray-500
//               border-0 rounded-none"
//           >
//             <AddIcon fontSize="small" className=""/>
//           </button>
//         </div>
//       </div>
//     </div>
//   );