function ValidationList({ title, items, tone }) {
  const toneClass =
    tone === 'blocked'
      ? 'border-[color:var(--danger-line)] bg-[color:var(--danger-bg)]'
      : 'border-[color:var(--warn-line)] bg-[color:var(--warn-bg)]';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-sm font-semibold text-[color:var(--ink)]">{title}</div>
      <div className="mt-2 space-y-2 text-sm text-[color:var(--ink)]">
        {items.length ? (
          items.map((item) => (
            <div key={item.id}>
              <div>{item.message}</div>
              <div className="text-[color:var(--muted)]">{item.nextAction}</div>
            </div>
          ))
        ) : (
          <div className="text-[color:var(--muted)]">No items.</div>
        )}
      </div>
    </div>
  );
}

export default function ValidationSummaryPanel({ validationResults }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ValidationList title="Blocking issues" items={validationResults.blockers} tone="blocked" />
      <ValidationList title="Warnings" items={validationResults.warnings} tone="warning" />
    </div>
  );
}
