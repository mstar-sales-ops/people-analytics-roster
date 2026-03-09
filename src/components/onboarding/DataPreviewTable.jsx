export default function DataPreviewTable({ headers, rows }) {
  if (!headers.length || !rows.length) {
    return (
      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-8 text-sm text-[color:var(--muted)]">
        Upload a roster to preview the first rows here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--line)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[color:var(--line)] text-sm">
          <thead className="bg-[color:var(--surface-soft)]">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)] bg-white">
            {rows.map((row, index) => (
              <tr key={index}>
                {headers.map((header) => (
                  <td key={header} className="px-4 py-3 text-[color:var(--ink)]">
                    {String(row[header] ?? '').trim() || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
