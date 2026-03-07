import { useMemo, useState } from 'react';
import Papa from 'papaparse';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PREVIEW_COLUMNS = [
  'Salesforce ID',
  'Full Name',
  'Team',
  'Manager',
  'Segment',
  'Function Origin',
  'Start Date',
  'End Date',
  'Is_Active',
];

const LIVE_SCHEMA = [
  { key: 'SFDC_ID', label: 'SFDC_ID', required: true, description: 'Unique rep identifier' },
  { key: 'Full_Name', label: 'Full_Name', required: false, description: 'Readable rep name' },
  { key: 'Hire_Date', label: 'Hire_Date', required: true, description: 'Employee start date' },
  {
    key: 'Termination_Date',
    label: 'Termination_Date',
    required: false,
    description: 'Leave blank if the rep is active',
  },
  { key: 'Team', label: 'Team', required: true, description: 'Current team or segment' },
  { key: 'Manager', label: 'Manager', required: true, description: 'Current manager name' },
  { key: 'Segment', label: 'Segment', required: false, description: 'Optional business segment' },
  {
    key: 'Function_Origin',
    label: 'Function_Origin',
    required: false,
    description: 'Optional function family',
  },
];

const CHANGE_SCHEMA = [
  { key: 'SFDC_ID', label: 'SFDC_ID', required: true, description: 'Unique rep identifier' },
  { key: 'Full_Name', label: 'Full_Name', required: false, description: 'Readable rep name' },
  {
    key: 'Change_Date',
    label: 'Change_Date',
    required: true,
    description: 'Effective date for the change',
  },
  { key: 'Team', label: 'Team', required: true, description: 'New team after the change' },
  { key: 'Manager', label: 'Manager', required: true, description: 'New manager after the change' },
  { key: 'Segment', label: 'Segment', required: false, description: 'Optional business segment' },
  {
    key: 'Function_Origin',
    label: 'Function_Origin',
    required: false,
    description: 'Optional function family',
  },
];

const HEADER_HINTS = {
  SFDC_ID: ['Salesforce ID', 'Salesforce User ID', 'SalesforceId', 'SFDC ID', 'Rep ID', 'User ID'],
  Full_Name: ['Full Name', 'Name', 'Employee Name'],
  Hire_Date: ['Hire Date', 'Start Date', 'HireDate'],
  Termination_Date: ['Termination Date', 'Term Date', 'End Date', 'TerminationDate'],
  Team: ['Current Team', 'New Team', 'Team', 'CurrentTeam', 'NewTeam', 'Pod', 'Updated POD', 'role_name'],
  Manager: ['Current Manager', 'New Manager', 'Manager', 'CurrentManager', 'NewManager'],
  Segment: ['Segment'],
  Function_Origin: ['Function Origin', 'FunctionOrigin'],
  Change_Date: ['Change Date', 'Effective Date', 'ChangeDate', 'start_date'],
};

const EMPTY_UPLOAD = {
  file: null,
  headers: [],
  rows: [],
};

const EXAMPLE_RECORD = {
  liveRoster: {
    SFDC_ID: '0058A00000EXAMPLE',
    Hire_Date: '2022-01-10',
    Termination_Date: '',
    Team: 'Mid-Market',
    Manager: 'Taylor Chen',
  },
  changeLog: [
    {
      Change_Date: '2022-01-10',
      Team: 'SMB',
      Manager: 'Jamie Lee',
      note: 'Opening state at hire',
    },
    {
      Change_Date: '2023-06-01',
      Team: 'Enterprise',
      Manager: 'Jamie Lee',
      note: 'Team move',
    },
    {
      Change_Date: '2024-02-15',
      Team: '',
      Manager: 'Taylor Chen',
      note: 'Manager change',
    },
    {
      Change_Date: '2024-02-15',
      Team: 'Mid-Market',
      Manager: '',
      note: 'Same-day team change',
    },
  ],
  output: [
    {
      'Salesforce ID': '0058A00000EXAMPLE',
      Team: 'SMB',
      Manager: 'Jamie Lee',
      'Start Date': '2022-01-10',
      'End Date': '2023-05-31',
      Is_Active: 'false',
      why: 'Opened from the first change-log row and closed the day before the next change.',
    },
    {
      'Salesforce ID': '0058A00000EXAMPLE',
      Team: 'Enterprise',
      Manager: 'Jamie Lee',
      'Start Date': '2023-06-01',
      'End Date': '2024-02-14',
      Is_Active: 'false',
      why: 'Opened by the 2023-06-01 change and closed by the next effective date.',
    },
    {
      'Salesforce ID': '0058A00000EXAMPLE',
      Team: 'Mid-Market',
      Manager: 'Taylor Chen',
      'Start Date': '2024-02-15',
      'End Date': '',
      Is_Active: 'true',
      why: 'Same-day change rows are consolidated, then the final open row stays active because the live roster has no termination date.',
    },
  ],
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
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));

  return rows.map((row) => {
    const record = schema.reduce((current, field) => {
      const sourceHeader = mapping[field.key];
      current[field.key] = sourceHeader ? cleanValue(row[sourceHeader]) : '';
      return current;
    }, {});

    record.__passthrough = Object.entries(row).reduce((current, [header, value]) => {
      const cleanHeader = cleanValue(header);
      if (!cleanHeader || mappedHeaders.has(header)) {
        return current;
      }

      current[cleanHeader] = cleanValue(value);
      return current;
    }, {});

    return record;
  });
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
      last.fullName = change.fullName || last.fullName;
      last.segment = change.segment || last.segment;
      last.functionOrigin = change.functionOrigin || last.functionOrigin;
      last.passthrough = { ...last.passthrough, ...change.passthrough };
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
  const exportColumns = [...PREVIEW_COLUMNS];

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
      fullName: cleanValue(row.Full_Name),
      hireDate,
      terminationDate: parseDateInput(row.Termination_Date),
      currentTeam: cleanValue(row.Team),
      currentManager: cleanValue(row.Manager),
      segment: cleanValue(row.Segment),
      functionOrigin: cleanValue(row.Function_Origin),
      passthrough: Object.fromEntries(
        Object.entries(row.__passthrough ?? {}).map(([key, value]) => [`Live - ${key}`, value]),
      ),
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
      fullName: cleanValue(row.Full_Name),
      segment: cleanValue(row.Segment),
      functionOrigin: cleanValue(row.Function_Origin),
      passthrough: Object.fromEntries(
        Object.entries(row.__passthrough ?? {}).map(([key, value]) => [`History - ${key}`, value]),
      ),
      sequence: index,
    };

    if (!changesById.has(salesforceId)) {
      changesById.set(salesforceId, []);
    }

    changesById.get(salesforceId).push(entry);
  });

  const results = [];

  function addExportColumns(row) {
    Object.keys(row).forEach((key) => {
      if (!exportColumns.includes(key)) {
        exportColumns.push(key);
      }
    });
  }

  function buildOutputRow(rep, activeState, startDate, endDate) {
    const row = {
      'Salesforce ID': rep.salesforceId,
      'Full Name': activeState.fullName || rep.fullName || '',
      Team: activeState.team,
      Manager: activeState.manager,
      Segment: activeState.segment || rep.segment || '',
      'Function Origin': activeState.functionOrigin || rep.functionOrigin || '',
      'Start Date': formatDate(startDate),
      'End Date': formatDate(endDate),
      Is_Active: !endDate,
      ...rep.passthrough,
      ...(activeState.passthrough ?? {}),
    };

    addExportColumns(row);
    return row;
  }

  liveById.forEach((rep) => {
    const consolidatedChanges = consolidateChangesForRep(changesById.get(rep.salesforceId) ?? []);
    const firstKnownState = consolidatedChanges[0] ?? {};

    let activeState = {
      team: firstKnownState.team || rep.currentTeam || '',
      manager: firstKnownState.manager || rep.currentManager || '',
      fullName: firstKnownState.fullName || rep.fullName || '',
      segment: firstKnownState.segment || rep.segment || '',
      functionOrigin: firstKnownState.functionOrigin || rep.functionOrigin || '',
      passthrough: firstKnownState.passthrough || {},
    };
    let activeStart = rep.hireDate;

    consolidatedChanges.forEach((change) => {
      if (change.changeDate < rep.hireDate) {
        activeState = {
          team: change.team || activeState.team,
          manager: change.manager || activeState.manager,
          fullName: change.fullName || activeState.fullName,
          segment: change.segment || activeState.segment,
          functionOrigin: change.functionOrigin || activeState.functionOrigin,
          passthrough: { ...activeState.passthrough, ...(change.passthrough ?? {}) },
        };
        return;
      }

      if (change.changeDate <= activeStart) {
        activeState = {
          team: change.team || activeState.team,
          manager: change.manager || activeState.manager,
          fullName: change.fullName || activeState.fullName,
          segment: change.segment || activeState.segment,
          functionOrigin: change.functionOrigin || activeState.functionOrigin,
          passthrough: { ...activeState.passthrough, ...(change.passthrough ?? {}) },
        };
        return;
      }

      results.push(buildOutputRow(rep, activeState, activeStart, subtractOneDay(change.changeDate)));

      activeStart = change.changeDate;
      activeState = {
        team: change.team || activeState.team,
        manager: change.manager || activeState.manager,
        fullName: change.fullName || activeState.fullName,
        segment: change.segment || activeState.segment,
        functionOrigin: change.functionOrigin || activeState.functionOrigin,
        passthrough: change.passthrough || {},
      };
    });

    if (
      rep.currentTeam ||
      rep.currentManager ||
      rep.fullName ||
      rep.segment ||
      rep.functionOrigin
    ) {
      activeState = {
        team: rep.currentTeam || activeState.team,
        manager: rep.currentManager || activeState.manager,
        fullName: rep.fullName || activeState.fullName,
        segment: rep.segment || activeState.segment,
        functionOrigin: rep.functionOrigin || activeState.functionOrigin,
        passthrough: activeState.passthrough,
      };
    }

    const finalEndDate =
      rep.terminationDate && rep.terminationDate >= activeStart ? rep.terminationDate : null;

    results.push(buildOutputRow(rep, activeState, activeStart, finalEndDate));
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
    exportColumns,
  };
}

function downloadCsv(rows, columns) {
  const csv = Papa.unparse({
    fields: columns,
    data: rows.map((row) => columns.map((column) => row[column] ?? '')),
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', `historical-roster-${formatDate(Date.now())}.csv`);
  anchor.click();
  URL.revokeObjectURL(url);
}

function Section({ title, description, right, children }) {
  return (
    <section className="rounded-2xl border border-[color:var(--line)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[color:var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--ink)]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[color:var(--muted)]">{description}</p> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatTile({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'success'
      ? 'border-[color:var(--success-line)] bg-[color:var(--success-bg)]'
      : tone === 'warning'
        ? 'border-[color:var(--warn-line)] bg-[color:var(--warn-bg)]'
        : 'border-[color:var(--line)] bg-white';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">{value}</div>
    </div>
  );
}

function UploadCard({ label, helperText, file, rowCount, headerCount, onChange }) {
  const ready = Boolean(file);

  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--ink)]">{label}</div>
          <div className="mt-1 text-sm leading-6 text-[color:var(--muted)]">{helperText}</div>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            ready
              ? 'bg-[color:var(--success-bg)] text-[color:var(--ink)]'
              : 'bg-white text-[color:var(--muted)]'
          }`}
        >
          {ready ? 'Loaded' : 'Waiting'}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[color:var(--line)] bg-white px-4 py-3">
        <div className="text-sm font-medium text-[color:var(--ink)]">
          {file ? file.name : 'Choose a CSV file'}
        </div>
        <div className="mt-1 text-sm text-[color:var(--muted)]">
          {ready ? `${rowCount} rows parsed · ${headerCount} headers found` : 'Headers will be extracted immediately after upload.'}
        </div>
      </div>

      <input
        className="mt-4 block w-full text-sm text-[color:var(--muted)] file:mr-4 file:rounded-md file:border-0 file:bg-[color:var(--brand)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[color:var(--brand-hover)]"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function MappingPanel({ title, schema, headers, mapping, onChange }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[color:var(--ink)]">{title}</div>
      {schema.map((field) => (
        <div
          key={field.key}
          className="grid gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] p-4 lg:grid-cols-[220px_1fr]"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[color:var(--ink)]">{field.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  field.required
                    ? 'bg-[color:var(--warn-bg)] text-[color:var(--ink)]'
                    : 'bg-white text-[color:var(--muted)]'
                }`}
              >
                {field.required ? 'Required' : 'Optional'}
              </span>
            </div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">{field.description}</div>
          </div>
          <div>
            <select
              className="w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]"
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
            <div className="mt-1 text-xs text-[color:var(--muted)]">
              {mapping[field.key] ? `Mapped from "${mapping[field.key]}"` : 'No column selected'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Notice({ tone = 'default', children }) {
  const toneClass =
    tone === 'error'
      ? 'border-[color:var(--danger-line)] bg-[color:var(--danger-bg)]'
      : tone === 'warning'
        ? 'border-[color:var(--warn-line)] bg-[color:var(--warn-bg)]'
        : 'border-[color:var(--line)] bg-[color:var(--surface-soft)]';

  return <div className={`rounded-xl border px-4 py-3 text-sm text-[color:var(--ink)] ${toneClass}`}>{children}</div>;
}

function SourceTag({ children, tone = 'default' }) {
  const toneClass =
    tone === 'history'
      ? 'bg-[color:var(--warn-bg)] text-[color:var(--ink)]'
      : tone === 'output'
        ? 'bg-[color:var(--success-bg)] text-[color:var(--ink)]'
        : 'bg-[color:var(--surface-soft)] text-[color:var(--muted)]';

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}>
      {children}
    </span>
  );
}

function ExampleTable({ columns, rows, tone = 'default' }) {
  const headerClass =
    tone === 'output' ? 'bg-[color:var(--success-bg)]' : 'bg-[color:var(--surface-soft)]';

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--line)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[color:var(--line)] text-sm">
          <thead className={headerClass}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)] bg-white">
            {rows.map((row, index) => (
              <tr key={`${columns[0]}-${index}`}>
                {columns.map((column) => (
                  <td key={column} className="px-4 py-3 align-top text-[color:var(--ink)]">
                    {row[column] || '—'}
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
  const [exportColumns, setExportColumns] = useState(PREVIEW_COLUMNS);

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

  async function handleUpload(kind, file) {
    setError('');
    setIssues([]);
    setProcessedRows([]);
    setStats({ reps: 0, changeRows: 0 });
    setExportColumns(PREVIEW_COLUMNS);

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
    setExportColumns(PREVIEW_COLUMNS);

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
      setExportColumns(output.exportColumns);
    } catch (processingError) {
      setProcessedRows([]);
      setStats({ reps: 0, changeRows: 0 });
      setExportColumns(PREVIEW_COLUMNS);
      setError(processingError.message || 'The uploaded data could not be transformed.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--surface)] px-4 py-6 text-[color:var(--ink)] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-[color:var(--line)] bg-white px-5 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--brand)]">
                Sales Ops Tool
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--ink)]">
                Historical Roster Builder
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                Upload a live roster and a change log, map the required columns, then export one
                historical roster file. The processing happens in the browser.
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
              {readyToProcess
                ? 'Ready to process'
                : readyForMapping
                  ? 'Finish required mapping'
                  : 'Upload both files'}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatTile
            label="Files"
            value={`${Number(Boolean(liveUpload.file)) + Number(Boolean(changeUpload.file))}/2`}
            tone={readyForMapping ? 'success' : 'default'}
          />
          <StatTile
            label="Required Mapping"
            value={`${mappedRequiredCount}/${totalRequiredMappings}`}
            tone={readyToProcess ? 'success' : readyForMapping ? 'warning' : 'default'}
          />
          <StatTile label="Rows Parsed" value={liveUpload.rows.length + changeUpload.rows.length} />
          <StatTile
            label="Output Rows"
            value={processedRows.length}
            tone={processedRows.length ? 'success' : 'default'}
          />
        </section>

        <Section
          title="1. Upload Files"
          description="Load the live roster and the SFDC change log."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <UploadCard
              label="Live Roster"
              helperText="One row per rep. This acts as the anchor table."
              file={liveUpload.file}
              rowCount={liveUpload.rows.length}
              headerCount={liveUpload.headers.length}
              onChange={(file) => handleUpload('live', file)}
            />
            <UploadCard
              label="SFDC Change Log"
              helperText="Multiple rows per rep. This provides the historical changes."
              file={changeUpload.file}
              rowCount={changeUpload.rows.length}
              headerCount={changeUpload.headers.length}
              onChange={(file) => handleUpload('change', file)}
            />
          </div>
        </Section>

        <Section
          title="2. Map Columns"
          description="Required fields must be mapped before processing can run."
          right={
            <div className="text-sm text-[color:var(--muted)]">
              {isParsing ? 'Parsing files...' : readyForMapping ? 'Mappings are editable' : 'Waiting for files'}
            </div>
          }
        >
          {readyForMapping ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <Notice tone={liveMissingMappings.length ? 'warning' : 'default'}>
                  Live roster missing required fields:{' '}
                  {liveMissingMappings.length
                    ? liveMissingMappings.map((field) => field.label).join(', ')
                    : 'none'}
                </Notice>
                <Notice tone={changeMissingMappings.length ? 'warning' : 'default'}>
                  Change log missing required fields:{' '}
                  {changeMissingMappings.length
                    ? changeMissingMappings.map((field) => field.label).join(', ')
                    : 'none'}
                </Notice>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <MappingPanel
                  title="Live Roster Schema"
                  schema={LIVE_SCHEMA}
                  headers={liveUpload.headers}
                  mapping={mappings.live}
                  onChange={(fieldKey, value) => handleMappingChange('live', fieldKey, value)}
                />
                <MappingPanel
                  title="Change Log Schema"
                  schema={CHANGE_SCHEMA}
                  headers={changeUpload.headers}
                  mapping={mappings.change}
                  onChange={(fieldKey, value) => handleMappingChange('change', fieldKey, value)}
                />
              </div>
            </div>
          ) : (
            <Notice>Upload both files to unlock the mapping step.</Notice>
          )}
        </Section>

        <Section
          title="3. Process and Export"
          description="Generate the merged historical roster, review the first 50 rows, then export the full dataset."
          right={
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="rounded-md bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[color:var(--line)] disabled:text-[color:var(--muted)]"
                type="button"
                disabled={isProcessing || !readyToProcess}
                onClick={handleProcess}
              >
                {isProcessing ? 'Processing...' : 'Process Data'}
              </button>
              <button
                className="rounded-md border border-[color:var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--ink)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                type="button"
                disabled={!processedRows.length}
                onClick={() => downloadCsv(processedRows, exportColumns)}
              >
                Export CSV
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {error ? <Notice tone="error">{error}</Notice> : null}

            {issues.length > 0 ? (
              <Notice tone="warning">
                {issues.length} data quality note{issues.length === 1 ? '' : 's'} found. Review the
                details below before export.
              </Notice>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-[color:var(--line)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[color:var(--line)] text-sm">
                  <thead className="bg-[color:var(--surface-soft)]">
                    <tr>
                      {PREVIEW_COLUMNS.map((column) => (
                        <th
                          key={column}
                          className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--line)] bg-white">
                    {previewRows.length > 0 ? (
                      previewRows.map((row, index) => (
                        <tr key={`${row['Salesforce ID']}-${row['Start Date']}-${index}`}>
                          {PREVIEW_COLUMNS.map((column) => (
                            <td key={column} className="whitespace-nowrap px-4 py-3 text-[color:var(--ink)]">
                              {String(row[column] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={PREVIEW_COLUMNS.length}
                          className="px-4 py-16 text-center text-sm text-[color:var(--muted)]"
                        >
                          Process the files to populate the preview table.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {issues.length > 0 ? (
              <div className="space-y-2">
                {issues.slice(0, 8).map((issue) => (
                  <div
                    key={issue}
                    className="rounded-lg border border-[color:var(--warn-line)] bg-[color:var(--warn-bg)] px-4 py-3 text-sm text-[color:var(--ink)]"
                  >
                    {issue}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          title="Example Output"
          description="This uses the universal core fields for stitching, then appends the rest of the source columns to the export with clear prefixes."
        >
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-[color:var(--ink)]">Live roster row</div>
                  <SourceTag>Comes from roster</SourceTag>
                </div>
                <ExampleTable
                  columns={['SFDC_ID', 'Hire_Date', 'Termination_Date', 'Team', 'Manager']}
                  rows={[EXAMPLE_RECORD.liveRoster]}
                />
                <div className="text-sm leading-6 text-[color:var(--muted)]">
                  The live roster gives the universal anchor fields: rep ID, hire date, optional
                  termination date, current team, current manager, plus any extra roster columns
                  that should ride along in the export.
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-[color:var(--ink)]">Historical change rows</div>
                  <SourceTag tone="history">Comes from change log</SourceTag>
                </div>
                <ExampleTable
                  columns={['Change_Date', 'Team', 'Manager', 'note']}
                  rows={EXAMPLE_RECORD.changeLog}
                />
                <div className="text-sm leading-6 text-[color:var(--muted)]">
                  The change log gives the universal history fields: rep ID, effective start date,
                  team, and manager. Any extra history columns are preserved on the row they open.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-[color:var(--ink)]">What gets exported</div>
                <SourceTag tone="output">Final stitched rows</SourceTag>
              </div>
              <ExampleTable columns={[...PREVIEW_COLUMNS, 'why']} rows={EXAMPLE_RECORD.output} tone="output" />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Notice>
                <strong>Universal core:</strong> `SFDC_ID`, start date, team, and manager are the
                minimal fields that make this type of stitcher work across teams.
              </Notice>
              <Notice>
                <strong>Still exported:</strong> everything else from the live roster or history
                files can be appended as `Live - ...` or `History - ...` columns.
              </Notice>
              <Notice>
                <strong>Preview vs export:</strong> the preview stays focused on the universal
                stitched columns, while the CSV download includes the additional source fields.
              </Notice>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
