// DataTable — generic, type-safe table for dashboard data listings.
// Each column defines a `cell` render function so any content is supported.

import { type ReactNode } from "react";

export type DataTableColumn<T> = {
  /** Column header label */
  header: string;
  /** Render the cell content for a given row */
  cell: (row: T) => ReactNode;
  /** Optional Tailwind classes applied to <td> */
  className?: string;
};

export function DataTable<T extends object>({
  columns,
  rows,
  footer,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  footer?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.header}
                  className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 whitespace-nowrap ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-gray-50/60 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={`px-5 py-3.5 ${col.className ?? ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs text-gray-400">{footer}</p>
        </div>
      )}
    </div>
  );
}
