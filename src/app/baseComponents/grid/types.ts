// app/baseComponents/grid/types.ts
export type CellRecord = {
  rowId: string;
  // dynamic column fields: [columnId]: string | number | null
  [columnId: string]: unknown;
};

export type EditingKey = { rowId: string; columnId: string; prefill?: string } | null;

export type ColMeta = {
  tdClassName?: string;  // extra classes for <td>
  thClassName?: string;  // extra classes for <th>
};