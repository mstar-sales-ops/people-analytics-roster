import {
  OPTIONAL_ROSTER_FIELDS,
  REQUIRED_ROSTER_FIELDS,
  downloadTemplateCsv,
} from './onboardingUtils.js';

function FieldList({ title, fields }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-[color:var(--ink)]">{title}</div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.key}
            className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[color:var(--ink)]">{field.label}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Example: {field.example}
              </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{field.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SchemaRequirementsCard({ onUploadClick }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--ink)]">Import your team roster</h2>
        <p className="mt-1 text-sm leading-5 text-[color:var(--muted)]">
          We&apos;ll help you upload a messy roster, review required fields, validate mappings, and
          enter the ingestion flow with fewer surprises.
        </p>
      </div>

      <FieldList title="Required fields" fields={REQUIRED_ROSTER_FIELDS} />
      <FieldList title="Optional fields" fields={OPTIONAL_ROSTER_FIELDS} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          className="rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
          type="button"
          onClick={downloadTemplateCsv}
        >
          Download Template CSV
        </button>
        <button
          className="rounded-md bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)]"
          type="button"
          onClick={onUploadClick}
        >
          Upload roster
        </button>
      </div>
    </div>
  );
}
