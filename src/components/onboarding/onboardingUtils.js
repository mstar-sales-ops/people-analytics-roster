import Papa from 'papaparse';

export const IGNORE_FIELD = '__ignore__';

export const REQUIRED_ROSTER_FIELDS = [
  {
    key: 'employee_name',
    label: 'Employee Name',
    description: 'Primary display name for the roster record.',
    example: 'Avery Morgan',
  },
  {
    key: 'employee_id',
    label: 'Employee ID',
    description: 'Unique employee or system identifier.',
    example: 'MS-10244',
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Current reporting manager name.',
    example: 'Taylor Chen',
  },
  {
    key: 'department',
    label: 'Department',
    description: 'Business unit, team, or department.',
    example: 'Mid-Market Sales',
  },
  {
    key: 'start_date',
    label: 'Start Date',
    description: 'Employee start or effective roster date.',
    example: '2025-01-15',
  },
];

export const OPTIONAL_ROSTER_FIELDS = [
  { key: 'email', label: 'Email', description: 'Work email address.', example: 'avery@company.com' },
  { key: 'title', label: 'Title', description: 'Job title.', example: 'Account Manager' },
  { key: 'location', label: 'Location', description: 'Office, region, or geography.', example: 'Denver' },
];

export const ROSTER_FIELDS = [...REQUIRED_ROSTER_FIELDS, ...OPTIONAL_ROSTER_FIELDS];

const FIELD_HINTS = {
  employee_name: ['employee name', 'full name', 'name', 'preferred name'],
  employee_id: ['employee id', 'id', 'worker id', 'staff id', 'associate id'],
  manager: ['manager', 'supervisor', 'lead', 'reports to'],
  department: ['department', 'team', 'business unit', 'function', 'org', 'division'],
  start_date: ['start date', 'hire date', 'effective date', 'join date'],
  email: ['email', 'work email', 'company email'],
  title: ['title', 'job title', 'role'],
  location: ['location', 'site', 'region', 'geo'],
};

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanValue(value) {
  return String(value ?? '').trim();
}

function titleCase(value) {
  return cleanValue(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseDate(value) {
  const raw = cleanValue(value);
  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, yearValue] = slashMatch;
    const year = yearValue.length === 2 ? Number(`20${yearValue}`) : Number(yearValue);
    return new Date(Date.UTC(year, Number(month) - 1, Number(day)));
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function downloadTemplateCsv() {
  const fields = REQUIRED_ROSTER_FIELDS.map((field) => field.label);
  const exampleRow = REQUIRED_ROSTER_FIELDS.map((field) => field.example);
  const csv = Papa.unparse({
    fields,
    data: [exampleRow],
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', 'team-roster-template.csv');
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseRosterFile(file) {
  return new Promise((resolve, reject) => {
    const fileName = cleanValue(file?.name).toLowerCase();
    if (!fileName.endsWith('.csv')) {
      reject(new Error('This build supports CSV only. Save the file as CSV and upload again.'));
      return;
    }

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

        resolve({
          file,
          rows,
          headers,
          previewRows: rows.slice(0, 12),
          rowCount: rows.length,
          columnCount: headers.length,
        });
      },
      error: (error) => reject(error),
    });
  });
}

function getHeaderSamples(rows, header, limit = 3) {
  const samples = [];
  rows.forEach((row) => {
    const value = cleanValue(row[header]);
    if (value && !samples.includes(value)) {
      samples.push(value);
    }
  });
  return samples.slice(0, limit);
}

function classifyValue(value) {
  const clean = cleanValue(value);
  if (!clean) {
    return 'blank';
  }
  if (/^-?\d+(\.\d+)?$/.test(clean)) {
    return 'number';
  }
  if (parseDate(clean)) {
    return 'date';
  }
  return 'text';
}

function inferSuggestion(header) {
  const normalizedHeader = normalizeText(header);

  for (const field of ROSTER_FIELDS) {
    const hints = FIELD_HINTS[field.key] ?? [];
    if (hints.some((hint) => normalizeText(hint) === normalizedHeader)) {
      return { fieldKey: field.key, confidence: 'high' };
    }
  }

  for (const field of ROSTER_FIELDS) {
    const hints = FIELD_HINTS[field.key] ?? [];
    if (hints.some((hint) => normalizedHeader.includes(normalizeText(hint)))) {
      return { fieldKey: field.key, confidence: 'review' };
    }
  }

  return { fieldKey: '', confidence: 'missing' };
}

export function buildMappingSuggestions(headers, rows) {
  const usedFields = new Set();

  return headers.reduce((current, header) => {
    const suggestion = inferSuggestion(header);
    let fieldKey = suggestion.fieldKey;

    if (fieldKey && usedFields.has(fieldKey)) {
      fieldKey = '';
    }

    if (fieldKey) {
      usedFields.add(fieldKey);
    }

    current[header] = {
      fieldKey,
      confidence: fieldKey ? suggestion.confidence : 'missing',
      samples: getHeaderSamples(rows, header),
      findings: [],
    };
    return current;
  }, {});
}

export function buildConfirmedMappingsFromSuggestions(headers, suggestions) {
  return headers.reduce((current, header) => {
    current[header] = suggestions[header]?.fieldKey ?? '';
    return current;
  }, {});
}

export function applyAutoFixes(value, fieldKey, autoFixSelections) {
  let nextValue = cleanValue(value);

  if (autoFixSelections.trimWhitespace) {
    nextValue = cleanValue(nextValue);
  }

  if (
    autoFixSelections.normalizeCapitalization &&
    ['employee_name', 'manager', 'department', 'title', 'location'].includes(fieldKey)
  ) {
    nextValue = titleCase(nextValue);
  }

  if (autoFixSelections.standardizeDateFormat && fieldKey === 'start_date') {
    const parsed = parseDate(nextValue);
    if (parsed) {
      nextValue = formatDate(parsed);
    }
  }

  return nextValue;
}

function getMappedHeaderForField(confirmedMappings, fieldKey) {
  return Object.entries(confirmedMappings).find(([, mappedField]) => mappedField === fieldKey)?.[0] ?? '';
}

function summarizeColumnFindings(rows, header, fieldKey) {
  const values = rows.map((row) => cleanValue(row[header]));
  const nonBlankValues = values.filter(Boolean);
  const findings = [];

  if (!values.length) {
    return findings;
  }

  if (nonBlankValues.length / values.length < 0.4) {
    findings.push({ tone: 'warning', message: 'Mostly blank column' });
  }

  const typeSet = new Set(nonBlankValues.slice(0, 50).map(classifyValue).filter((type) => type !== 'blank'));
  if (typeSet.size > 1) {
    findings.push({ tone: 'warning', message: 'Mixed type or suspicious content' });
  }

  if (fieldKey === 'start_date') {
    const invalidDateCount = nonBlankValues.filter((value) => !parseDate(value)).length;
    if (invalidDateCount > 0) {
      findings.push({ tone: 'blocked', message: `${invalidDateCount} invalid date value(s)` });
    }
  }

  return findings;
}

function buildPreparedRows(rows, confirmedMappings, autoFixSelections) {
  return rows.map((row, index) => {
    const preparedRow = {
      __rowNumber: index + 2,
    };

    ROSTER_FIELDS.forEach((field) => {
      const mappedHeader = getMappedHeaderForField(confirmedMappings, field.key);
      preparedRow[field.key] = mappedHeader
        ? applyAutoFixes(row[mappedHeader], field.key, autoFixSelections)
        : '';
    });

    return preparedRow;
  });
}

function countWhitespaceCharactersToTrim(value) {
  const raw = String(value ?? '');
  const trimmed = raw.trim();

  if (!trimmed && !raw.trim()) {
    return raw.length;
  }

  let count = 0;
  let startIndex = 0;
  let endIndex = raw.length - 1;

  while (startIndex < raw.length && /\s/.test(raw[startIndex])) {
    count += 1;
    startIndex += 1;
  }

  while (endIndex >= startIndex && /\s/.test(raw[endIndex])) {
    count += 1;
    endIndex -= 1;
  }

  return count;
}

function buildAutoFixSummary(rows, confirmedMappings) {
  let whitespaceCharactersToTrim = 0;
  let capitalizationCandidates = 0;
  let dateValuesToStandardize = 0;

  const capitalizationFields = ['employee_name', 'manager', 'department', 'title', 'location'];

  ROSTER_FIELDS.forEach((field) => {
    const mappedHeader = getMappedHeaderForField(confirmedMappings, field.key);
    if (!mappedHeader) {
      return;
    }

    rows.forEach((row) => {
      const rawValue = row[mappedHeader];
      const clean = cleanValue(rawValue);

      whitespaceCharactersToTrim += countWhitespaceCharactersToTrim(rawValue);

      if (
        capitalizationFields.includes(field.key) &&
        clean &&
        titleCase(clean) !== clean
      ) {
        capitalizationCandidates += 1;
      }

      if (field.key === 'start_date' && clean) {
        const parsed = parseDate(clean);
        if (parsed && formatDate(parsed) !== clean) {
          dateValuesToStandardize += 1;
        }
      }
    });
  });

  return {
    whitespaceCharactersToTrim,
    capitalizationCandidates,
    dateValuesToStandardize,
  };
}

export function validateRoster(rows, headers, confirmedMappings, autoFixSelections) {
  const blockers = [];
  const warnings = [];
  const columnFindings = {};

  headers.forEach((header) => {
    const fieldKey = confirmedMappings[header] ?? '';
    columnFindings[header] = summarizeColumnFindings(rows, header, fieldKey);
  });

  const mappedRequiredFields = REQUIRED_ROSTER_FIELDS.filter((field) =>
    Object.values(confirmedMappings).includes(field.key),
  );

  const missingRequiredFields = REQUIRED_ROSTER_FIELDS.filter(
    (field) => !mappedRequiredFields.some((mappedField) => mappedField.key === field.key),
  );

  missingRequiredFields.forEach((field) => {
    blockers.push({
      id: `missing-${field.key}`,
      message: `${field.label} is not mapped.`,
      nextAction: 'Map the required field before continuing.',
    });
  });

  const duplicateMappings = Object.values(confirmedMappings)
    .filter(Boolean)
    .filter((fieldKey, index, values) => values.indexOf(fieldKey) !== index && fieldKey !== IGNORE_FIELD);

  if (duplicateMappings.length > 0) {
    blockers.push({
      id: 'duplicate-mapping',
      message: 'The same internal field is mapped more than once.',
      nextAction: 'Review the mapping table and remove duplicate assignments.',
    });
  }

  const preparedRows = buildPreparedRows(rows, confirmedMappings, autoFixSelections);
  const rowBlockers = new Map();
  const rowWarnings = new Map();

  preparedRows.forEach((row) => {
    REQUIRED_ROSTER_FIELDS.forEach((field) => {
      if (!cleanValue(row[field.key])) {
        rowBlockers.set(row.__rowNumber, true);
      }
    });

    if (row.start_date && !parseDate(row.start_date)) {
      rowBlockers.set(row.__rowNumber, true);
    }
  });

  const employeeIdCounts = preparedRows.reduce((current, row) => {
    const employeeId = cleanValue(row.employee_id);
    if (!employeeId) {
      return current;
    }

    current[employeeId] = (current[employeeId] ?? 0) + 1;
    return current;
  }, {});

  const duplicateEmployeeIds = Object.entries(employeeIdCounts).filter(([, count]) => count > 1);
  if (duplicateEmployeeIds.length > 0) {
    blockers.push({
      id: 'duplicate-employee-id',
      message: `${duplicateEmployeeIds.length} duplicate employee ID value(s) detected.`,
      nextAction: 'Review the employee ID column or clean duplicates before continuing.',
    });

    preparedRows.forEach((row) => {
      if (employeeIdCounts[cleanValue(row.employee_id)] > 1) {
        rowBlockers.set(row.__rowNumber, true);
      }
    });
  }

  headers.forEach((header) => {
    columnFindings[header].forEach((finding) => {
      if (finding.tone === 'blocked') {
        blockers.push({
          id: `column-${header}-${finding.message}`,
          message: `${header}: ${finding.message}.`,
          nextAction: 'Review this column mapping or fix the source values.',
        });
      } else {
        warnings.push({
          id: `column-${header}-${finding.message}`,
          message: `${header}: ${finding.message}.`,
          nextAction: 'Review the sample values and keep or ignore the column.',
        });
      }
    });
  });

  preparedRows.forEach((row) => {
    if (!rowBlockers.has(row.__rowNumber) && (!row.employee_name || !row.manager || !row.department)) {
      rowWarnings.set(row.__rowNumber, true);
    }
  });

  return {
    blockers,
    warnings,
    columnFindings,
    preparedRows,
    autoFixSummary: buildAutoFixSummary(rows, confirmedMappings),
    summary: {
      totalRows: preparedRows.length,
      rowsReady: preparedRows.length - rowBlockers.size,
      rowsWithWarnings: rowWarnings.size,
      blockingIssues: blockers.length,
      requiredFieldsMapped: mappedRequiredFields.length,
    },
    isReadyToContinue: blockers.length === 0 && preparedRows.length > 0,
  };
}
