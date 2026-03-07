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

const LIVE_ALIASES = {
  salesforceId: ['Salesforce ID', 'SalesforceId', 'SFDC ID', 'Rep ID', 'User ID'],
  hireDate: ['Hire Date', 'Start Date', 'HireDate'],
  terminationDate: ['Termination Date', 'Term Date', 'End Date', 'TerminationDate'],
  currentTeam: ['Current Team', 'Team', 'CurrentTeam'],
  currentManager: ['Current Manager', 'Manager', 'CurrentManager'],
};

const CHANGE_ALIASES = {
  salesforceId: ['Salesforce ID', 'SalesforceId', 'SFDC ID', 'Rep ID', 'User ID'],
  changeDate: ['Change Date', 'Effective Date', 'ChangeDate'],
  newTeam: ['New Team', 'Team', 'NewTeam'],
  newManager: ['New Manager', 'Manager', 'NewManager'],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildAccessor(row) {
  const lookup = new Map();

  Object.entries(row ?? {}).forEach(([key, value]) => {
    lookup.set(normalizeHeader(key), value);
  });

  return (aliases) => {
    for (const alias of aliases) {
      const match = lookup.get(normalizeHeader(alias));
      if (match !== undefined && String(match).trim() !== '') {
        return String(match).trim();
      }
    }

    return '';
  };
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

        resolve(results.data ?? []);
      },
      error: (error) => reject(error),
    });
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
    const getField = buildAccessor(row);
    const salesforceId = getField(LIVE_ALIASES.salesforceId);

    if (!salesforceId) {
      issues.push(`Live Roster row ${index + 2}: missing Salesforce ID.`);
      return;
    }

    const hireDate = parseDateInput(getField(LIVE_ALIASES.hireDate));
    if (!hireDate) {
      issues.push(`Live Roster row ${index + 2}: invalid Hire Date for ${salesforceId}.`);
      return;
    }

    liveById.set(salesforceId, {
      salesforceId,
      hireDate,
      terminationDate: parseDateInput(getField(LIVE_ALIASES.terminationDate)),
      currentTeam: getField(LIVE_ALIASES.currentTeam),
      currentManager: getField(LIVE_ALIASES.currentManager),
    });
  });

  changeRows.forEach((row, index) => {
    const getField = buildAccessor(row);
    const salesforceId = getField(CHANGE_ALIASES.salesforceId);
    const changeDate = parseDateInput(getField(CHANGE_ALIASES.changeDate));

    if (!salesforceId || !changeDate) {
      issues.push(`Change Log row ${index + 2}: missing Salesforce ID or Change Date.`);
      return;
    }

    const entry = {
      salesforceId,
      changeDate,
      team: getField(CHANGE_ALIASES.newTeam),
      manager: getField(CHANGE_ALIASES.newManager),
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

      const previousEnd = subtractOneDay(change.changeDate);
      results.push({
        'Salesforce ID': rep.salesforceId,
        Team: activeState.team,
        Manager: activeState.manager,
        'Start Date': formatDate(activeStart),
        'End Date': formatDate(previousEnd),
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

function UploadCard({ label, helperText, file, onChange }) {
  return (
    <label className="flex min-h-40 cursor-pointer flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md">
      <div className="space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </span>
        <p className="text-sm text-slate-600">{helperText}</p>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {file ? file.name : 'Choose a CSV file'}
        </div>
        <input
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </div>
    </label>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function App() {
  const [liveFile, setLiveFile] = useState(null);
  const [changeFile, setChangeFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);
  const [processedRows, setProcessedRows] = useState([]);
  const [stats, setStats] = useState({ reps: 0, changeRows: 0 });

  const previewRows = useMemo(() => processedRows.slice(0, 50), [processedRows]);

  async function handleProcess() {
    if (!liveFile || !changeFile) {
      setError('Upload both CSV files before processing.');
      return;
    }

    setError('');
    setIssues([]);
    setIsProcessing(true);

    try {
      const [liveRows, changeRows] = await Promise.all([
        parseCsvFile(liveFile),
        parseCsvFile(changeFile),
      ]);

      const output = buildHistoricalRoster(liveRows, changeRows);
      setProcessedRows(output.rows);
      setIssues(output.issues);
      setStats(output.stats);
    } catch (processingError) {
      setProcessedRows([]);
      setStats({ reps: 0, changeRows: 0 });
      setError(processingError.message || 'The CSV files could not be parsed.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-xl shadow-slate-300/30 backdrop-blur sm:p-8">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-900">
              Sales Ops Internal Tool
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Historical Roster Builder
              </h1>
              <p className="text-sm leading-6 text-slate-600 sm:text-base">
                Upload the Live Roster and SFDC Change Log, generate a browser-only SCD Type 2
                history, review the first 50 rows, then export the full historical roster to CSV.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <UploadCard
            label="Live Roster"
            helperText="One row per rep. Required fields: Salesforce ID, Hire Date, Termination Date, Current Team, Current Manager."
            file={liveFile}
            onChange={setLiveFile}
          />
          <UploadCard
            label="SFDC Change Log"
            helperText="Multiple rows per rep. Required fields: Salesforce ID, Change Date, New Team, New Manager."
            file={changeFile}
            onChange={setChangeFile}
          />
        </section>

        <section className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            Processing stays in the browser. No CSV content leaves the page.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              type="button"
              disabled={isProcessing || !liveFile || !changeFile}
              onClick={handleProcess}
            >
              {isProcessing ? 'Processing...' : 'Process Data'}
            </button>
            <button
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              type="button"
              disabled={!processedRows.length}
              onClick={() => downloadCsv(processedRows)}
            >
              Export to CSV
            </button>
          </div>
        </section>

        {(error || processedRows.length > 0) && (
          <section className="grid gap-4 md:grid-cols-3">
            <StatCard label="Reps Processed" value={stats.reps} />
            <StatCard label="Change Rows Read" value={stats.changeRows} />
            <StatCard label="Output Rows" value={processedRows.length} />
          </section>
        )}

        {error && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </section>
        )}

        {issues.length > 0 && (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-950">Data quality notes</h2>
            <ul className="mt-3 space-y-2 text-sm text-amber-900">
              {issues.slice(0, 12).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            {issues.length > 12 && (
              <p className="mt-3 text-sm text-amber-800">
                Showing 12 of {issues.length} issues. Exported rows exclude invalid input rows.
              </p>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Merged Preview</h2>
            <p className="mt-1 text-sm text-slate-600">
              First 50 rows of the generated historical roster.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {OUTPUT_COLUMNS.map((column) => (
                    <th
                      key={column}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {previewRows.length > 0 ? (
                  previewRows.map((row, index) => (
                    <tr key={`${row['Salesforce ID']}-${row['Start Date']}-${index}`}>
                      {OUTPUT_COLUMNS.map((column) => (
                        <td key={column} className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {String(row[column] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={OUTPUT_COLUMNS.length} className="px-4 py-16 text-center text-slate-500">
                      Upload both CSV files and run processing to populate the historical roster.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-sm text-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Current prototype assumptions</h2>
          <ul className="mt-3 space-y-2 leading-6 text-slate-300">
            <li>
              Same-day change rows are collapsed to one effective state using the final row order in
              the uploaded Change Log.
            </li>
            <li>
              If the first logged change happens after Hire Date, the prototype backfills the gap
              using the earliest known team/manager for that rep.
            </li>
            <li>
              The final open era is aligned to the Live Roster&apos;s current team/manager before the
              Termination Date check is applied.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
