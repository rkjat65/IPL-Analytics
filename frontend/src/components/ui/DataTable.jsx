import { useState, useEffect } from 'react'

function SkeletonRows({ columns, rows = 5 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i} className="border-b border-border-subtle">
      {columns.map((col) => (
        <td key={col.key} className="px-4 py-3">
          <div className="h-4 bg-bg-card-hover rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  ))
}

export default function DataTable({
  columns,
  data,
  onSort,
  sortKey,
  sortDir,
  onRowClick,
  loading = false,
  pageSize = 50,
}) {
  const [currentPage, setCurrentPage] = useState(1)

  // Reset to page 1 when data changes
  useEffect(() => {
    setCurrentPage(1)
  }, [data])

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
  const startIdx = (currentPage - 1) * pageSize
  const endIdx = startIdx + pageSize
  const pageData = data.slice(startIdx, endIdx)
  const showPagination = data.length > pageSize

  const handleSort = (col) => {
    if (!col.sortable || !onSort) return
    onSort(col.key)
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-elevated border-b border-border-subtle sticky top-0 z-10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer select-none hover:text-text-primary transition-colors' : ''}`}
                  onClick={() => handleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`w-3 h-3 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`}
                      >
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows columns={columns} />
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-text-muted text-sm"
                >
                  No data available
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={row.id ?? startIdx + i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-border-subtle transition-colors ${
                    i % 2 === 1 ? 'bg-bg-card/50' : ''
                  } ${onRowClick ? 'cursor-pointer' : ''} hover:bg-bg-card-hover`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-text-primary ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-text-muted">
            Showing {startIdx + 1}–{Math.min(endIdx, data.length)} of {data.length} records
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <span className="text-xs text-text-muted">
              Page <span className="text-accent-cyan font-medium">{currentPage}</span> of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs rounded-md border border-border-subtle bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
