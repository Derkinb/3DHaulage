import type { ReactNode } from 'react';
import clsx from 'clsx';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  headerClassName?: string;
}

interface DataGridProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyState?: ReactNode;
  keyExtractor?: (row: T, index: number) => string | number;
}

export function DataGrid<T>({ data, columns, emptyState, keyExtractor }: DataGridProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-slate-500">
        {emptyState ?? 'Brak danych do wyświetlenia'}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-sm">
      <div className="hidden min-w-full overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={clsx('px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', column.headerClassName)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 bg-white">
            {data.map((row, rowIndex) => (
              <tr key={keyExtractor?.(row, rowIndex) ?? rowIndex} className="transition hover:bg-slate-50/80">
                {columns.map((column, columnIndex) => {
                  const value = typeof column.accessor === 'function' ? column.accessor(row) : (row[column.accessor] as ReactNode);
                  return (
                    <td key={columnIndex} className={clsx('whitespace-nowrap px-5 py-4 text-slate-600', column.className)}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-3 lg:hidden">
        {data.map((row, rowIndex) => (
          <div key={keyExtractor?.(row, rowIndex) ?? rowIndex} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
            {columns.map((column, columnIndex) => {
              const value = typeof column.accessor === 'function' ? column.accessor(row) : (row[column.accessor] as ReactNode);
              return (
                <div key={columnIndex} className="flex flex-col text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{column.header}</span>
                  <span className="mt-1 text-sm text-slate-600">{value}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
