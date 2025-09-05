// app/baseComponents/grid/types.ts
export type CellRecord = {
  rowId: string;
  // dynamic column fields: [columnId]: string | number | null
  [columnId: string]: unknown;
};

export type EditingKey = { rowId: string; columnId: string } | null;
