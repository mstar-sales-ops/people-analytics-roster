export default function ImportReadinessCard({
  summary,
  totalRequiredFields,
  onBack,
  onContinue,
  canContinue,
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white p-5">
      <div className="space-y-1">
        <div className="text-lg font-semibold text-[color:var(--ink)]">Import readiness</div>
        <div className="text-sm text-[color:var(--muted)]">
          Continue is allowed when only warnings remain.
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Total rows</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{summary.totalRows}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Rows ready</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{summary.rowsReady}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Rows with warnings</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{summary.rowsWithWarnings}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Blocking issues</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{summary.blockingIssues}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Required mapped</div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
            {summary.requiredFieldsMapped}/{totalRequiredFields}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-md border border-[color:var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--ink)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
          type="button"
          onClick={onBack}
        >
          Back to fix issues
        </button>
        <button
          className="rounded-md bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[color:var(--line)] disabled:text-[color:var(--muted)]"
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>

      {!canContinue ? (
        <div className="mt-3 text-sm text-[color:var(--muted)]">
          Continue is disabled because at least one blocking issue still needs attention.
        </div>
      ) : null}
    </div>
  );
}
