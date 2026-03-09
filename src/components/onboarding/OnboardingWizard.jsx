import { useMemo, useState } from 'react';
import ColumnMappingTable from './ColumnMappingTable.jsx';
import DataPreviewTable from './DataPreviewTable.jsx';
import FileUploadPanel from './FileUploadPanel.jsx';
import ImportReadinessCard from './ImportReadinessCard.jsx';
import SchemaRequirementsCard from './SchemaRequirementsCard.jsx';
import ValidationSummaryPanel from './ValidationSummaryPanel.jsx';
import {
  REQUIRED_ROSTER_FIELDS,
  buildConfirmedMappingsFromSuggestions,
  buildMappingSuggestions,
  parseRosterFile,
  validateRoster,
} from './onboardingUtils.js';

const STEPS = [
  'Welcome + Requirements',
  'Upload + Preview',
  'Column Mapping + Validation',
  'Review + Continue',
];

function StepIndicator({ currentStep }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const active = stepNumber === currentStep;
        const complete = stepNumber < currentStep;
        return (
          <div
            key={step}
            className={`rounded-xl border px-4 py-3 ${
              complete
                ? 'border-[color:var(--success-line)] bg-[color:var(--success-bg)]'
                : active
                  ? 'border-[color:var(--brand)] bg-white'
                  : 'border-[color:var(--line)] bg-white'
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Step {stepNumber}
            </div>
            <div className="mt-1 text-sm font-medium text-[color:var(--ink)]">{step}</div>
          </div>
        );
      })}
    </div>
  );
}

function SummaryTiles({ parseState, suggestions, validationResults }) {
  const requiredDetected = REQUIRED_ROSTER_FIELDS.filter((field) =>
    Object.values(suggestions).some((entry) => entry.fieldKey === field.key),
  ).length;
  const columnsNeedingReview = parseState.headers.filter((header) => {
    const suggestion = suggestions[header];
    return suggestion.confidence !== 'high' || (validationResults.columnFindings[header] ?? []).length > 0;
  }).length;

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Row count</div>
        <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{parseState.rowCount}</div>
      </div>
      <div className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Column count</div>
        <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{parseState.columnCount}</div>
      </div>
      <div className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Required auto-detected</div>
        <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
          {requiredDetected}/{REQUIRED_ROSTER_FIELDS.length}
        </div>
      </div>
      <div className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Needs review</div>
        <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{columnsNeedingReview}</div>
      </div>
    </div>
  );
}

export default function OnboardingWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [parseState, setParseState] = useState({
    headers: [],
    rows: [],
    previewRows: [],
    rowCount: 0,
    columnCount: 0,
  });
  const [mappingSuggestions, setMappingSuggestions] = useState({});
  const [confirmedMappings, setConfirmedMappings] = useState({});
  const [autoFixSelections, setAutoFixSelections] = useState({
    trimWhitespace: true,
    normalizeCapitalization: false,
    standardizeDateFormat: true,
  });
  const [error, setError] = useState('');

  const validationResults = useMemo(
    () =>
      validateRoster(parseState.rows, parseState.headers, confirmedMappings, autoFixSelections),
    [parseState.rows, parseState.headers, confirmedMappings, autoFixSelections],
  );

  async function handleFileSelected(file) {
    setError('');
    if (!file) {
      setUploadedFile(null);
      setParseState({ headers: [], rows: [], previewRows: [], rowCount: 0, columnCount: 0 });
      setMappingSuggestions({});
      setConfirmedMappings({});
      return;
    }

    try {
      const result = await parseRosterFile(file);
      const suggestions = buildMappingSuggestions(result.headers, result.rows);
      setUploadedFile(result.file);
      setParseState(result);
      setMappingSuggestions(suggestions);
      setConfirmedMappings(buildConfirmedMappingsFromSuggestions(result.headers, suggestions));
      setCurrentStep(2);
    } catch (parseError) {
      setError(parseError.message || 'The file could not be parsed.');
    }
  }

  function handleContinue() {
    onComplete({
      uploadedFile,
      parsedHeaders: parseState.headers,
      previewRows: parseState.previewRows,
      mappingSuggestions,
      confirmedMappings,
      validationResults,
      autoFixSelections,
      isReadyToContinue: validationResults.isReadyToContinue,
    });
  }

  function renderStepContent() {
    if (currentStep === 1) {
      return <SchemaRequirementsCard onUploadClick={() => setCurrentStep(2)} />;
    }

    if (currentStep === 2) {
      return (
        <div className="space-y-5">
          <FileUploadPanel uploadedFile={uploadedFile} onFileSelected={handleFileSelected} />
          <SummaryTiles
            parseState={parseState}
            suggestions={mappingSuggestions}
            validationResults={validationResults}
          />
          <div className="flex justify-end">
            <button
              className="rounded-md bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[color:var(--line)] disabled:text-[color:var(--muted)]"
              type="button"
              disabled={!uploadedFile}
              onClick={() => setCurrentStep(3)}
            >
              Next
            </button>
          </div>
          <DataPreviewTable headers={parseState.headers} rows={parseState.previewRows} />
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)]">
              <input
                className="mr-3"
                type="checkbox"
                checked={autoFixSelections.trimWhitespace}
                onChange={(event) =>
                  setAutoFixSelections((current) => ({
                    ...current,
                    trimWhitespace: event.target.checked,
                  }))
                }
              />
              Trim whitespace
            </label>
            <label className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)]">
              <input
                className="mr-3"
                type="checkbox"
                checked={autoFixSelections.normalizeCapitalization}
                onChange={(event) =>
                  setAutoFixSelections((current) => ({
                    ...current,
                    normalizeCapitalization: event.target.checked,
                  }))
                }
              />
              Normalize capitalization
            </label>
            <label className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)]">
              <input
                className="mr-3"
                type="checkbox"
                checked={autoFixSelections.standardizeDateFormat}
                onChange={(event) =>
                  setAutoFixSelections((current) => ({
                    ...current,
                    standardizeDateFormat: event.target.checked,
                  }))
                }
              />
              Standardize date format
            </label>
          </div>

          <ColumnMappingTable
            headers={parseState.headers}
            suggestions={mappingSuggestions}
            confirmedMappings={confirmedMappings}
            columnFindings={validationResults.columnFindings}
            onMappingChange={(header, fieldKey) =>
              setConfirmedMappings((current) => ({
                ...current,
                [header]: fieldKey,
              }))
            }
          />

          <ValidationSummaryPanel validationResults={validationResults} />
        </div>
      );
    }

    return (
      <ImportReadinessCard
        summary={validationResults.summary}
        totalRequiredFields={REQUIRED_ROSTER_FIELDS.length}
        onBack={() => setCurrentStep(3)}
        onContinue={handleContinue}
        canContinue={validationResults.isReadyToContinue}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--surface)] px-4 py-6 text-[color:var(--ink)] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-[color:var(--line)] bg-white px-5 py-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--brand)]">
            Pre-ingestion onboarding
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--ink)]">
            Roster import prep
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
            Review what is required, upload a roster, confirm the mapping, and enter the main
            ingestion app with cleaner expectations.
          </p>
        </header>

        <StepIndicator currentStep={currentStep} />

        {error ? (
          <div className="rounded-xl border border-[color:var(--danger-line)] bg-[color:var(--danger-bg)] px-4 py-3 text-sm text-[color:var(--ink)]">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-[color:var(--line)] bg-white p-5">
          {renderStepContent()}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          {currentStep > 1 ? (
            <button
              className="rounded-md border border-[color:var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--ink)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
              type="button"
              onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
            >
              Back
            </button>
          ) : null}

          {currentStep < 4 && currentStep !== 2 ? (
            <button
              className="rounded-md bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[color:var(--line)] disabled:text-[color:var(--muted)]"
              type="button"
              disabled={currentStep === 2 && !uploadedFile}
              onClick={() => setCurrentStep((step) => Math.min(4, step + 1))}
            >
              {currentStep === 3 ? 'Review import' : 'Next'}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
