import { IGNORE_FIELD, ROSTER_FIELDS } from './onboardingUtils.js';

function ConfidenceBadge({ confidence }) {
  const styles = {
    high: 'bg-[color:var(--success-bg)] text-[color:var(--ink)]',
    review: 'bg-[color:var(--warn-bg)] text-[color:var(--ink)]',
    missing: 'bg-white text-[color:var(--muted)]',
  };

  const label = confidence === 'high' ? 'High confidence' : confidence === 'review' ? 'Review' : 'Missing';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles[confidence]}`}>{label}</span>;
}

export default function ColumnMappingTable({
  headers,
  suggestions,
  confirmedMappings,
  columnFindings,
  onMappingChange,
}) {
  const selectedFields = Object.entries(confirmedMappings).reduce((current, [header, fieldKey]) => {
    if (fieldKey && fieldKey !== IGNORE_FIELD) {
      current[fieldKey] = header;
    }
    return current;
  }, {});

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--line)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[color:var(--line)] text-sm">
          <thead className="bg-[color:var(--surface-soft)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Original header
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Sample values
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Suggested field
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Confidence
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Mapping
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Validation
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)] bg-white">
            {headers.map((header) => {
              const suggestion = suggestions[header];
              const mappedField = confirmedMappings[header] ?? '';
              const findings = columnFindings[header] ?? [];

              return (
                <tr key={header}>
                  <td className="px-4 py-3 align-top text-[color:var(--ink)]">{header}</td>
                  <td className="px-4 py-3 align-top text-[color:var(--muted)]">
                    <div className="space-y-1">
                      {suggestion.samples.length ? suggestion.samples.map((sample) => <div key={sample}>{sample}</div>) : <div>—</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-[color:var(--ink)]">
                    {suggestion.fieldKey
                      ? ROSTER_FIELDS.find((field) => field.key === suggestion.fieldKey)?.label
                      : 'No suggestion'}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ConfidenceBadge confidence={suggestion.confidence} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <select
                      className="w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]"
                      value={mappedField}
                      onChange={(event) => onMappingChange(header, event.target.value)}
                    >
                      <option value="">Review mapping</option>
                      {ROSTER_FIELDS.map((field) => {
                        const alreadyTakenBy = selectedFields[field.key];
                        const disabled = alreadyTakenBy && alreadyTakenBy !== header;
                        return (
                          <option key={field.key} value={field.key} disabled={disabled}>
                            {field.label}
                          </option>
                        );
                      })}
                      <option value={IGNORE_FIELD}>Ignore column</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top text-[color:var(--muted)]">
                    <div className="space-y-1">
                      {findings.length ? (
                        findings.map((finding) => (
                          <div key={finding.message}>{finding.message}</div>
                        ))
                      ) : (
                        <div>No issues detected</div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
