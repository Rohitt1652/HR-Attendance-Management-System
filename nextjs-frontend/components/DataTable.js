'use client';
import { useState } from 'react';
import styles from './DataTable.module.css';

/*
 * DataTable
 * Migrated: 10/12 inline styles → CSS classes
 * Remaining inline:
 *   - button cursor & opacity: driven by page === 1 / page === totalPages state
 *   - tr background: driven by row index (even/odd)
 */

export default function DataTable({ columns, data, searchPlaceholder = 'Search...', hideSearch = false }) {
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const pageSize = 20;

  const filtered = data.filter((row) => {
    if (!search) return true;
    return columns.some((col) =>
      String(row[col.key] ?? '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className={styles.dataTable}>
      {!hideSearch && (
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className={styles.search}
        />
      )}

      <div className="overflow-x-auto rounded-lg border-default custom-tablediv">
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="tbl-th">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className={`${styles.empty} tbl-td text-muted`}
                >
                  No records found
                </td>
              </tr>
            ) : paged.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className="tbl-td">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className={styles.pageButton}
          >Prev</button>

          <span className="text-secondary">{page} / {totalPages}</span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className={styles.pageButton}
          >Next</button>
        </div>
      )}
    </div>
  );
}
