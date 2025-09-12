// src/app/baseComponents/grid/ProgressOverlay.tsx
"use client";

export default function ProgressOverlay(
  { percent, label }: 
  { percent: number; label: string }
) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="fixed inset-0 z-[3000] bg-black/30 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[min(520px,90vw)] rounded-lg bg-white shadow-lg p-5">
        <div className="text-sm text-gray-700 mb-2">{label}</div>
        <div className="w-full h-3 bg-gray-200 rounded">
          <div
            className="h-3 rounded bg-indigo-500 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">{pct}%</div>
      </div>
    </div>
  );
}
