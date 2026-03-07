import { useMemo, useState } from 'react';
import Papa from 'papaparse';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const OUTPUT_COLUMNS = [
  'Salesforce ID',
  'Team',
  'Manager',
  'Start Date',
  'End Date',
  'Is_Active',
];

const LIVE_SCHEMA = [
  { key: 'SFDC_ID', label: 'SFDC_ID', required: true, description: 'Unique rep identifier' },
  { key: 'Hire_Date', label: 'Hire_Date', required: true, description: 'Employee start date' },
  {
    key: 'Termination_Date',
    label: 'Termination_Date',
    required: false,
    description: 'Leave blank if the rep is active',
  },
  { key: 'Team', label: 'Team', required: true, description: 'Current team or segment' },
  { key: 'Manager', label: 'Manager', required: true, description: 'Current manager name' },
];

const CHANGE_SCHEMA = [
  { key: 'SFDC_ID', label: 'SFDC_ID', required: true, description: 'Unique rep identifier' },
  {
    key: 'Change_Date',
    label: 'Change_Date',
    required: true,
    description: 'Effective date for the change',
  },
  { key: 'Team', label: 'Team', required: true, description: 'New team after the change' },
  { key: 'Manager', label: 'Manager', required: true, description: 'New manager after the change' },
];

const HEADER_HINTS = {
  SFDC_ID: ['Salesforce ID', 'SalesforceId', 'SFDC ID', 'Rep ID', 'User ID'],
  Hire_Date: ['Hire Date', 'Start Date', 'HireDate'],
  Termination_Date: ['Termination Date', 'Term Date', 'End Date', 'TerminationDate'],
  Team: ['Current Team', 'New Team', 'Team', 'CurrentTeam', 'NewTeam'],
  Manager: ['Current Manager', 'New Manager', 'Manager', 'CurrentManager', 'NewManager'],
  Change_Date: ['Change Date', 'Effective Date', 'ChangeDate'],
};

const EMPTY_UPLOAD = {
  file: null,
  headers: [],
  rows: [],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cleanValue(value) {
  return String(value ?? '').trim();
}

function parseDateInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (!Number.isNaN(serial) && serial > 20000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      return excelEpoch + Math.round(serial) * DAY_IN_MS;
    }
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, yearValue] = slashMatch;
    const year = yearValue.length === 2 ? Number(`20${yearValue}`) : Number(yearValue);
    return Date.UTC(year, Number(month) - 1, Number(day));
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate());
  }

  return null;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return '';
  }

  return new Date(dateValue).toISOString().slice(0, 10);
}

function subtractOneDay(dateValue) {
  return dateValue - DAY_IN_MS;
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.errors?.length) {
          reject(
            new Error(
              results.errors
                .slice(0, 3)
                .map((entry) => entry.message)
                .join('; '),
            ),
          );
          return;
        }

        const rows = results.data ?? [];
        const headers = (results.meta?.fields ?? Object.keys(rows[0] ?? {})).filter((header) =>
          cleanValue(header),
        );

        resolve({ rows, headers });
      },
      error: (error) => reject(error),
    });
  });
}

function suggestMappings(headers, schema) {
  const usedHeaders = new Set();

  return schema.reduce((mapping, field) => {
    const match = headers.find((header) => {
      if (usedHeaders.has(header)) {
        return false;
      }

      return HEADER_HINTS[field.key]?.some(
        (hint) => normalizeHeader(hint) === normalizeHeader(header),
      );
    });

    mapping[field.key] = match ?? '';
    if (match) {
      usedHeaders.add(match);
    }

    return mapping;
  }, {});
}

function getMissingRequiredMappings(mapping, schema) {
  return schema.filter((field) => field.required && !mapping[field.key]);
}

function transformRowsToSchema(rows, mapping, schema) {
  return rows.map((row) =>
    schema.reduce((record, field) => {
      const sourceHeader = mapping[field.key];
      record[field.key] = sourceHeader ? cleanValue(row[sourceHeader]) : '';
      return record;
    }, {}),
  );
}

function consolidateChangesForRep(changes) {
  const sortedChanges = [...changes].sort((left, right) => {
    if (left.changeDate !== right.changeDate) {
      return left.changeDate - right.changeDate;
    }

    return left.sequence - right.sequence;
  });

  const consolidated = [];

  sortedChanges.forEach((change) => {
    const last = consolidated[consolidated.length - 1];

    if (last && last.changeDate === change.changeDate) {
      last.team = change.team || last.team;
      last.manager = change.manager || last.manager;
      last.sequence = change.sequence;
      return;
    }

    consolidated.push({ ...change });
  });

  return consolidated;
}

function buildHistoricalRoster(liveRows, changeRows) {
  const issues = [];
  const liveById = new Map();
  const changesById = new Map();

  liveRows.forEach((row, index) => {
    const salesforceId = cleanValue(row.SFDC_ID);
    if (!salesforceId) {
      issues.push(`Live Roster row ${index + 2}: missing SFDC_ID.`);
      return;
    }

    const hireDate = parseDateInput(row.Hire_Date);
    if (!hireDate) {
      issues.push(`Live Roster row ${index + 2}: invalid Hire_Date for ${salesforceId}.`);
      return;
    }

    if (liveById.has(salesforceId)) {
      issues.push(`Live Roster row ${index + 2}: duplicate SFDC_ID ${salesforceId}.`);
    }

    liveById.set(salesforceId, {
      salesforceId,
      hireDate,
      terminationDate: parseDateInput(row.Termination_Date),
      currentTeam: cleanValue(row.Team),
      currentManager: cleanValue(row.Manager),
    });
  });

  changeRows.forEach((row, index) => {
    const salesforceId = cleanValue(row.SFDC_ID);
    const changeDate = parseDateInput(row.Change_Date);

    if (!salesforceId || !changeDate) {
      issues.push(`Change Log row ${index + 2}: missing SFDC_ID or Change_Date.`);
      return;
    }

    const entry = {
      salesforceId,
      changeDate,
      team: cleanValue(row.Team),
      manager: cleanValue(row.Manager),
      sequence: index,
    };

    if (!changesById.has(salesforceId)) {
      changesById.set(salesforceId, []);
    }

    changesById.get(salesforceId).push(entry);
  });

  const results = [];

  liveById.forEach((rep) => {
    const consolidatedChanges = consolidateChangesForRep(changesById.get(rep.salesforceId) ?? []);
    const firstKnownState = consolidatedChanges[0] ?? {};

    let activeState = {
      team: firstKnownState.team || rep.currentTeam || '',
      manager: firstKnownState.manager || rep.currentManager || '',
    };
    let activeStart = rep.hireDate;

    consolidatedChanges.forEach((change) => {
      if (change.changeDate < rep.hireDate) {
        activeState = {
          team: change.team || activeState.team,
          manager: change.manager || activeState.manager,
        };
        return;
      }

      if (change.changeDate <= activeStart) {
        activeState = {
          team: change.team || activeState.team,
          manager: change.manager || activeState.manager,
        };
        return;
      }

      results.push({
        'Salesforce ID': rep.salesforceId,
        Team: activeState.team,
        Manager: activeState.manager,
        'Start Date': formatDate(activeStart),
        'End Date': formatDate(subtractOneDay(change.changeDate)),
        Is_Active: false,
      });

      activeStart = change.changeDate;
      activeState = {
        team: change.team || activeState.team,
        manager: change.manager || activeState.manager,
      };
    });

    if (rep.currentTeam || rep.currentManager) {
      activeState = {
        team: rep.currentTeam || activeState.team,
        manager: rep.currentManager || activeState.manager,
      };
    }

    const finalEndDate =
      rep.terminationDate && rep.terminationDate >= activeStart ? rep.terminationDate : null;

    results.push({
      'Salesforce ID': rep.salesforceId,
      Team: activeState.team,
      Manager: activeState.manager,
      'Start Date': formatDate(activeStart),
      'End Date': formatDate(finalEndDate),
      Is_Active: !finalEndDate,
    });
  });

  return {
    rows: results.sort((left, right) => {
      if (left['Salesforce ID'] !== right['Salesforce ID']) {
        return left['Salesforce ID'].localeCompare(right['Salesforce ID']);
      }

      return left['Start Date'].localeCompare(right['Start Date']);
    }),
    issues,
    stats: {
      reps: liveById.size,
      changeRows: changeRows.length,
    },
  };
}

function downloadCsv(rows) {
  const csv = Papa.unparse({
    fields: OUTPUT_COLUMNS,
    data: rows.map((row) => OUTPUT_COLUMNS.map((column) => row[column] ?? '')),
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', `historical-roster-${formatDate(Date.now())}.csv`);
  anchor.click();
  URL.revokeObjectURL(url);
}

function toneClasses(tone) {
  if (tone === 'success') {
    return 'border-[color:var(--success-soft)] bg-[color:var(--success-bg)] text-[color:var(--ink-strong)]';
  }

  if (tone === 'warning') {
    return 'border-[color:var(--warn-soft)] bg-[color:var(--warn-bg)] text-[color:var(--ink-strong)]';
  }

  if (tone === 'danger') {
    return 'border-[color:var(--danger-soft)] bg-[color:var(--danger-bg)] text-[color:var(--ink-strong)]';
  }

  if (tone === 'dark') {
    return 'border-[color:var(--ink-strong)] bg-[color:var(--ink-strong)] text-white';
  }

  return 'border-[color:var(--line)] bg-white text-[color:var(--ink-strong)]';
}

function StatusDot({ tone }) {
  const colorMap = {
    success: 'bg-[color:var(--success)]',
    warning: 'bg-[color:var(--warn)]',
    danger: 'bg-[color:var(--danger)]',
    neutral: 'bg-[color:var(--muted)]',
    primary: 'bg-[color:var(--brand)]',
  };

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorMap[tone]}`} />;
}

function SectionShell({ eyebrow, title, detail, tone = 'neutral', children, aside }) {
  return (
    <section
      className={`rounded-[2rem] border p-6 shadow-[0_24px_60px_-32px_rgba(38,47,48,0.28)] ${toneClasses(
        tone,
      )}`}
    >
      <div className="flex flex-col gap-5 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted-deep)]">
            {eyebrow}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {detail ? <p className="max-w-3xl text-sm leading-6 text-[color:var(--muted-deep)]">{detail}</p> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function WorkflowStage({ number, title, detail, active, complete }) {
  const tone = complete ? 'success' : active ? 'warning' : 'neutral';
  return (
    <div
      className={`rounded-[1.75rem] border px-4 py-4 ${toneClasses(tone)} transition`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold ${
            complete
              ? 'bg-[color:var(--success)] text-[color:var(--ink-strong)]'
              : active
                ? 'bg-[color:var(--warn)] text-[color:var(--ink-strong)]'
                : 'bg-[color:var(--surface-alt)] text-[color:var(--muted-deep)]'
          }`}
        >
          {number}
        </div>
        <div>
          <div className="text-sm font-semibold text-[color:var(--ink-strong)]">{title}</div>
          <div className="text-xs text-[color:var(--muted-deep)]">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sublabel, tone = 'neutral' }) {
  return (
    <div className={`rounded-[1.75rem] border p-4 ${toneClasses(tone)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-deep)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--ink-strong)]">
        {value}
      </div>
      {sublabel ? <div className="mt-1 text-sm text-[color:var(--muted-deep)]">{sublabel}</div> : null}
    </div>
  );
}

function UploadCard({ label, helperText, file, rowCount, headerCount, onChange }) {
  const ready = Boolean(file);

  return (
    <label className="group block cursor-pointer rounded-[1.9rem] border border-[color:var(--line)] bg-white p-5 shadow-[0_18px_42px_-30px_rgba(38,47,48,0.35)] transition hover:-translate-y-0.5 hover:border-[color:var(--brand-soft)] hover:shadow-[0_24px_48px_-28px_rgba(255,69,0,0.28)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--surface-alt)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-deep)]">
            <StatusDot tone={ready ? 'success' : 'neutral'} />
            {ready ? 'Loaded' : 'Waiting'}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--ink-strong)]">{label}</h3>
            <p className="mt-1 text-sm leading-6 text-[color:var(--muted-deep)]">{helperText}</p>
          </div>
        </div>
        <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--surface-alt)] text-xl text-[color:var(--brand)] sm:flex">
          {label === 'Live Roster' ? 'A' : 'B'}
        </div>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-[color:var(--surface-alt)] p-4">
        <div className="text-sm font-medium text-[color:var(--ink-strong)]">
          {file ? file.name : 'Choose a CSV file'}
        </div>
        <div className="mt-2 text-sm text-[color:var(--muted-deep)]">
          {ready ? `${rowCount} rows parsed · ${headerCount} headers available for mapping` : 'We parse headers immediately after upload and suggest a first-pass mapping.'}
        </div>
      </div>

      <input
        className="mt-5 block w-full text-sm text-[color:var(--muted-deep)] file:mr-4 file:rounded-full file:border-0 file:bg-[color:var(--brand)] file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-white file:transition hover:file:bg-[color:var(--brand-strong)]"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function MappingPanel({
  title,
  description,
  schema,
  headers,
  mapping,
  rowCount,
  onChange,
}) {
  return (
    <SectionShell
      eyebrow="Column Mapping"
      title={title}
      detail={description}
      aside={
        <div className="rounded-full bg-[color:var(--surface-alt)] px-4 py-2 text-sm text-[color:var(--muted-deep)]">
          {rowCount} rows · {headers.length} headers
        </div>
      }
    >
      <div className="space-y-4">
        {schema.map((field) => (
          <div
            key={field.key}
            className="grid gap-4 rounded-[1.6rem] border border-[color:var(--line)] bg-[color:var(--surface-alt)] p-4 lg:grid-cols-[1fr_1.2fr]"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[color:var(--ink-strong)]">{field.label}</h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                    field.required
                      ? 'bg-[color:var(--warn-bg)] text-[color:var(--ink-strong)]'
                      : 'bg-white text-[color:var(--muted-deep)]'
                  }`}
                >
                  {field.required ? 'Required' : 'Optional'}
                </span>
              </div>
              <p className="text-sm leading-6 text-[color:var(--muted-deep)]">{field.description}</p>
            </div>

            <div className="space-y-2">
              <select
                className="w-full rounded-[1rem] border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink-strong)] outline-none transition focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-ring)]"
                value={mapping[field.key] ?? ''}
                onChange={(event) => onChange(field.key, event.target.value)}
              >
                <option value="">
                  {field.required ? 'Select a source column' : 'Leave unmapped'}
                </option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[color:var(--muted-deep)]">
                {mapping[field.key]
                  ? `Mapped from "${mapping[field.key]}".`
                  : 'No source column selected yet.'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function ChecklistItem({ label, done, tone = 'success' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-[color:var(--line)] bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <StatusDot tone={done ? tone : 'neutral'} />
        <span className="text-sm text-[color:var(--ink-strong)]">{label}</span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-deep)]">
        {done ? 'Ready' : 'Open'}
      </span>
    </div>
  );
}

function SidebarCard({ title, detail, children, tone = 'neutral' }) {
  return (
    <div className={`rounded-[1.75rem] border p-5 ${toneClasses(tone)}`}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-[color:var(--ink-strong)]">{title}</h3>
        {detail ? <p className="text-sm leading-6 text-[color:var(--muted-deep)]">{detail}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StandardSchemaCard({ title, schema, missingMappings }) {
  return (
    <SidebarCard
      title={title}
      detail={
        missingMappings.length
          ? `Missing required fields: ${missingMappings.map((field) => field.label).join(', ')}`
          : 'All required fields are mapped.'
      }
      tone={missingMappings.length ? 'warning' : 'success'}
    >
      <div className="space-y-2">
        {schema.map((field) => {
          const missingRequired = field.required && missingMappings.some((entry) => entry.key === field.key);
          return (
            <div
              key={field.key}
              className="flex items-center justify-between rounded-[1rem] border border-black/10 bg-white/80 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-[color:var(--ink-strong)]">{field.label}</div>
                <div className="text-xs text-[color:var(--muted-deep)]">{field.description}</div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  missingRequired
                    ? 'bg-[color:var(--danger-bg)] text-[color:var(--danger)]'
                    : field.required
                      ? 'bg-[color:var(--success-bg)] text-[color:var(--ink-strong)]'
                      : 'bg-[color:var(--surface-alt)] text-[color:var(--muted-deep)]'
                }`}
              >
                {missingRequired ? 'Need map' : field.required ? 'Core' : 'Optional'}
              </span>
            </div>
          );
        })}
      </div>
    </SidebarCard>
  );
}

export default function App() {
  const [liveUpload, setLiveUpload] = useState(EMPTY_UPLOAD);
  const [changeUpload, setChangeUpload] = useState(EMPTY_UPLOAD);
  const [mappings, setMappings] = useState({ live: {}, change: {} });
  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);
  const [processedRows, setProcessedRows] = useState([]);
  const [stats, setStats] = useState({ reps: 0, changeRows: 0 });

  const liveMissingMappings = useMemo(
    () => getMissingRequiredMappings(mappings.live, LIVE_SCHEMA),
    [mappings.live],
  );
  const changeMissingMappings = useMemo(
    () => getMissingRequiredMappings(mappings.change, CHANGE_SCHEMA),
    [mappings.change],
  );
  const previewRows = useMemo(() => processedRows.slice(0, 50), [processedRows]);

  const readyForMapping = Boolean(liveUpload.file && changeUpload.file);
  const readyToProcess =
    readyForMapping &&
    liveMissingMappings.length === 0 &&
    changeMissingMappings.length === 0 &&
    !isParsing;

  const totalRequiredMappings =
    LIVE_SCHEMA.filter((field) => field.required).length +
    CHANGE_SCHEMA.filter((field) => field.required).length;
  const mappedRequiredCount =
    totalRequiredMappings - liveMissingMappings.length - changeMissingMappings.length;
  const totalRowsLoaded = liveUpload.rows.length + changeUpload.rows.length;
  const currentStage = isProcessing
    ? 3
    : processedRows.length > 0
      ? 4
      : readyToProcess
        ? 3
        : readyForMapping
          ? 2
          : 1;

  async function handleUpload(kind, file) {
    setError('');
    setIssues([]);
    setProcessedRows([]);
    setStats({ reps: 0, changeRows: 0 });

    if (!file) {
      if (kind === 'live') {
        setLiveUpload(EMPTY_UPLOAD);
      } else {
        setChangeUpload(EMPTY_UPLOAD);
      }

      setMappings((current) => ({
        ...current,
        [kind]: {},
      }));
      return;
    }

    setIsParsing(true);

    try {
      const parsedFile = await parseCsvFile(file);
      const nextUpload = {
        file,
        headers: parsedFile.headers,
        rows: parsedFile.rows,
      };
      const nextMapping = suggestMappings(
        parsedFile.headers,
        kind === 'live' ? LIVE_SCHEMA : CHANGE_SCHEMA,
      );

      if (kind === 'live') {
        setLiveUpload(nextUpload);
      } else {
        setChangeUpload(nextUpload);
      }

      setMappings((current) => ({
        ...current,
        [kind]: nextMapping,
      }));
    } catch (uploadError) {
      if (kind === 'live') {
        setLiveUpload(EMPTY_UPLOAD);
      } else {
        setChangeUpload(EMPTY_UPLOAD);
      }

      setMappings((current) => ({
        ...current,
        [kind]: {},
      }));
      setError(uploadError.message || 'The CSV file could not be parsed.');
    } finally {
      setIsParsing(false);
    }
  }

  function handleMappingChange(kind, fieldKey, value) {
    setProcessedRows([]);
    setIssues([]);
    setStats({ reps: 0, changeRows: 0 });

    setMappings((current) => ({
      ...current,
      [kind]: {
        ...current[kind],
        [fieldKey]: value,
      },
    }));
  }

  async function handleProcess() {
    if (!readyToProcess) {
      setError('Map every required standard field before processing.');
      return;
    }

    setError('');
    setIssues([]);
    setIsProcessing(true);

    try {
      const standardizedLiveRows = transformRowsToSchema(
        liveUpload.rows,
        mappings.live,
        LIVE_SCHEMA,
      );
      const standardizedChangeRows = transformRowsToSchema(
        changeUpload.rows,
        mappings.change,
        CHANGE_SCHEMA,
      );

      const output = buildHistoricalRoster(standardizedLiveRows, standardizedChangeRows);
      setProcessedRows(output.rows);
      setIssues(output.issues);
      setStats(output.stats);
    } catch (processingError) {
      setProcessedRows([]);
      setStats({ reps: 0, changeRows: 0 });
      setError(processingError.message || 'The uploaded data could not be transformed.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--surface)] px-4 py-6 text-[color:var(--ink)] sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[2.4rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[0_32px_80px_-40px_rgba(38,47,48,0.42)] sm:p-8">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(255,69,0,0.22),_transparent_52%),radial-gradient(circle_at_bottom_right,_rgba(0,216,165,0.18),_transparent_38%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.6fr_0.9fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full bg-[color:var(--brand)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white">
                  Sales Ops Workbench
                </span>
                <span className="inline-flex rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-deep)]">
                  Browser-only CSV processing
                </span>
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-[color:var(--ink-strong)] sm:text-5xl">
                  Turn two inconsistent CSVs into one clean historical roster.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-deep)]">
                  The workflow stays simple: ingest source files, standardize their schema, stitch
                  the timeline, and export a roster your team can trust.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[2rem] border border-[color:var(--line)] bg-white/90 p-5 shadow-[0_24px_60px_-34px_rgba(38,47,48,0.3)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--muted-deep)]">
                  Current focus
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--ink-strong)]">
                  {currentStage === 1
                    ? 'Load source files'
                    : currentStage === 2
                      ? 'Finish schema mapping'
                      : currentStage === 3
                        ? 'Run the stitcher'
                        : 'Review and export'}
                </div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--muted-deep)]">
                  {currentStage === 1
                    ? 'Upload the live roster and the change log. Headers are parsed immediately.'
                    : currentStage === 2
                      ? 'Map missing required fields so the downstream history builder has a stable schema.'
                      : currentStage === 3
                        ? 'The required fields are ready. Generate the historical roster.'
                        : 'Preview the first 50 rows, inspect data quality, and export the full file.'}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.3rem] bg-[color:var(--surface-alt)] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-deep)]">
                      Privacy
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--ink-strong)]">
                      Files never leave the browser.
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] bg-[color:var(--surface-alt)] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-deep)]">
                      Output
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--ink-strong)]">
                      Historical roster CSV with preview and export.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          <WorkflowStage
            number="01"
            title="Upload"
            detail="Parse files and detect headers"
            active={currentStage === 1}
            complete={Boolean(liveUpload.file && changeUpload.file)}
          />
          <WorkflowStage
            number="02"
            title="Map"
            detail="Standardize required columns"
            active={currentStage === 2}
            complete={readyToProcess || currentStage > 2}
          />
          <WorkflowStage
            number="03"
            title="Stitch"
            detail="Generate historical eras"
            active={currentStage === 3}
            complete={processedRows.length > 0}
          />
          <WorkflowStage
            number="04"
            title="Export"
            detail="Review the preview and download"
            active={currentStage === 4}
            complete={false}
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          <MetricCard
            label="Files Loaded"
            value={`${Number(Boolean(liveUpload.file)) + Number(Boolean(changeUpload.file))}/2`}
            sublabel="Both source files are required to start mapping."
            tone={readyForMapping ? 'success' : 'neutral'}
          />
          <MetricCard
            label="Required Fields"
            value={`${mappedRequiredCount}/${totalRequiredMappings}`}
            sublabel="Required mappings completed across both source tables."
            tone={readyToProcess ? 'success' : readyForMapping ? 'warning' : 'neutral'}
          />
          <MetricCard
            label="Rows Parsed"
            value={totalRowsLoaded}
            sublabel="Total source rows currently loaded into the browser."
            tone={totalRowsLoaded ? 'neutral' : 'neutral'}
          />
          <MetricCard
            label="Issues Found"
            value={issues.length}
            sublabel="Validation notes generated during processing."
            tone={issues.length ? 'warning' : processedRows.length ? 'success' : 'neutral'}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
          <div className="space-y-6">
            <SectionShell
              eyebrow="Source Intake"
              title="Load the roster anchor and the change history"
              detail="Each upload is parsed as soon as it lands so the mapping step can be auto-seeded from recognizable column names."
              aside={
                <div className="rounded-full bg-[color:var(--surface-alt)] px-4 py-2 text-sm text-[color:var(--muted-deep)]">
                  {isParsing ? 'Parsing files...' : readyForMapping ? 'Both files loaded' : 'Waiting for uploads'}
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <UploadCard
                  label="Live Roster"
                  helperText="This is the anchor table. One row per rep, with the current team and manager state."
                  file={liveUpload.file}
                  rowCount={liveUpload.rows.length}
                  headerCount={liveUpload.headers.length}
                  onChange={(file) => handleUpload('live', file)}
                />
                <UploadCard
                  label="SFDC Change Log"
                  helperText="This is the historical change table. Multiple rows per rep are expected."
                  file={changeUpload.file}
                  rowCount={changeUpload.rows.length}
                  headerCount={changeUpload.headers.length}
                  onChange={(file) => handleUpload('change', file)}
                />
              </div>
            </SectionShell>

            {readyForMapping ? (
              <div className="space-y-6">
                <MappingPanel
                  title="Map Live Roster Columns"
                  description="Choose the uploaded columns that should feed the standard anchor schema. This keeps the stitcher stable even when team-specific naming varies."
                  schema={LIVE_SCHEMA}
                  headers={liveUpload.headers}
                  mapping={mappings.live}
                  rowCount={liveUpload.rows.length}
                  onChange={(fieldKey, value) => handleMappingChange('live', fieldKey, value)}
                />
                <MappingPanel
                  title="Map Change Log Columns"
                  description="Choose the uploaded columns that should feed the standard history schema used by the SCD timeline logic."
                  schema={CHANGE_SCHEMA}
                  headers={changeUpload.headers}
                  mapping={mappings.change}
                  rowCount={changeUpload.rows.length}
                  onChange={(fieldKey, value) => handleMappingChange('change', fieldKey, value)}
                />
              </div>
            ) : (
              <SectionShell
                eyebrow="Schema Mapping"
                title="Mapping unlocks after both files are uploaded"
                detail="Once both CSVs are present, the app will suggest a mapping based on common aliases and let you confirm the standard schema before processing."
                tone="warning"
              >
                <div className="rounded-[1.75rem] border border-dashed border-[color:var(--warn-soft)] bg-white/70 px-5 py-8 text-center text-sm leading-7 text-[color:var(--muted-deep)]">
                  Upload both files to open the mapping workbench.
                </div>
              </SectionShell>
            )}

            <SectionShell
              eyebrow="Output"
              title="Preview the stitched roster"
              detail="The preview table reflects the standardized schema and SCD merge logic. Only the first 50 rows are shown here; export downloads the full result."
              aside={
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="rounded-full bg-[color:var(--brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--brand-strong)] disabled:cursor-not-allowed disabled:bg-[color:var(--line)] disabled:text-[color:var(--muted-deep)]"
                    type="button"
                    disabled={isProcessing || !readyToProcess}
                    onClick={handleProcess}
                  >
                    {isProcessing ? 'Processing...' : 'Process Data'}
                  </button>
                  <button
                    className="rounded-full border border-[color:var(--line)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--ink-strong)] transition hover:border-[color:var(--brand-soft)] hover:text-[color:var(--brand)] disabled:cursor-not-allowed disabled:text-[color:var(--muted-deep)]"
                    type="button"
                    disabled={!processedRows.length}
                    onClick={() => downloadCsv(processedRows)}
                  >
                    Export CSV
                  </button>
                </div>
              }
              tone="dark"
            >
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white text-[color:var(--ink)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[color:var(--line)] text-sm">
                    <thead className="bg-[color:var(--surface-alt)]">
                      <tr>
                        {OUTPUT_COLUMNS.map((column) => (
                          <th
                            key={column}
                            className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-deep)]"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--line)] bg-white">
                      {previewRows.length > 0 ? (
                        previewRows.map((row, index) => (
                          <tr
                            key={`${row['Salesforce ID']}-${row['Start Date']}-${index}`}
                            className="transition hover:bg-[color:var(--surface-alt)]"
                          >
                            {OUTPUT_COLUMNS.map((column) => (
                              <td key={column} className="whitespace-nowrap px-4 py-3 text-[color:var(--ink)]">
                                {String(row[column] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={OUTPUT_COLUMNS.length}
                            className="px-4 py-16 text-center text-sm text-[color:var(--muted-deep)]"
                          >
                            Upload files, finish the required mappings, and run processing to generate the roster preview.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionShell>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <SidebarCard
              title="Run Readiness"
              detail="The workflow should make the next action obvious. This panel surfaces the blockers."
              tone={readyToProcess ? 'success' : currentStage > 1 ? 'warning' : 'neutral'}
            >
              <div className="space-y-3">
                <ChecklistItem label="Live roster uploaded" done={Boolean(liveUpload.file)} />
                <ChecklistItem label="Change log uploaded" done={Boolean(changeUpload.file)} />
                <ChecklistItem
                  label="Required live fields mapped"
                  done={liveMissingMappings.length === 0 && Boolean(liveUpload.file)}
                  tone="warning"
                />
                <ChecklistItem
                  label="Required change fields mapped"
                  done={changeMissingMappings.length === 0 && Boolean(changeUpload.file)}
                  tone="warning"
                />
                <ChecklistItem label="Ready to process" done={readyToProcess} tone="primary" />
              </div>
            </SidebarCard>

            <StandardSchemaCard
              title="Live Roster Standard Schema"
              schema={LIVE_SCHEMA}
              missingMappings={liveMissingMappings}
            />

            <StandardSchemaCard
              title="Change Log Standard Schema"
              schema={CHANGE_SCHEMA}
              missingMappings={changeMissingMappings}
            />

            {error ? (
              <SidebarCard title="Parse or Process Error" detail={error} tone="danger" />
            ) : null}

            <SidebarCard
              title="Data Quality"
              detail={
                issues.length
                  ? 'The current output includes validation notes. Review them before export.'
                  : 'No validation notes have been generated yet.'
              }
              tone={issues.length ? 'warning' : processedRows.length ? 'success' : 'neutral'}
            >
              {issues.length ? (
                <div className="space-y-2">
                  {issues.slice(0, 8).map((issue) => (
                    <div
                      key={issue}
                      className="rounded-[1rem] border border-black/10 bg-white/80 px-4 py-3 text-sm text-[color:var(--ink-strong)]"
                    >
                      {issue}
                    </div>
                  ))}
                  {issues.length > 8 ? (
                    <div className="text-xs font-medium uppercase tracking-[0.22em] text-[color:var(--muted-deep)]">
                      {issues.length - 8} more notes are hidden here but remain available in the state.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[1rem] border border-black/10 bg-white/80 px-4 py-4 text-sm text-[color:var(--muted-deep)]">
                  Process a dataset to see duplicate IDs, invalid dates, or missing required row values.
                </div>
              )}
            </SidebarCard>

            <SidebarCard
              title="What changed from the last version"
              detail="The visual language now follows the dashboard brief without turning the workflow into a chart-heavy dashboard."
            >
              <div className="space-y-3 text-sm leading-6 text-[color:var(--muted-deep)]">
                <p>The page now leads with workflow state and decision cues rather than generic utility styling.</p>
                <p>Orange drives primary action, cyan marks completion, yellow flags work-in-progress, and issue handling stays visible in the right rail.</p>
                <p>The layout is intentionally asymmetric: workbench on the left, operational status on the right.</p>
              </div>
            </SidebarCard>
          </aside>
        </div>
      </div>
    </main>
  );
}
