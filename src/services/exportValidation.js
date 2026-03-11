const STABLE_KEY_ALIASES = {
  workdayId: ['Workday ID', 'WorkdayID', 'Worker ID', 'Employee ID'],
  salesforceId: ['Salesforce ID', 'Salesforce User ID', 'SFDC ID'],
  workEmail: ['Work Email', 'Email', 'MarketStar Email', 'Company Email'],
};

const COMPARISON_FIELD_ALIASES = {
  name: ['Full Name', 'Employee Name', 'Name'],
  email: ['Work Email', 'Email', 'MarketStar Email', 'Company Email'],
  manager: ['Manager', 'Current Manager'],
  segment: ['Segment'],
  function: ['Function Origin', 'Function'],
  LOB: ['LOB', 'Line of Business'],
  pod: ['Pod', 'POD', 'Team', 'Current Team'],
  terminationDate: ['End Date', 'Termination Date', 'Term Date'],
  termType: ['Term Type', 'Termination Type'],
  reasonForTerm: ['Reason for Term', 'Termination Reason', 'Term Reason'],
  regrettedFlag: ['Regretted Flag', 'Regretted', 'Regretted?'],
};

const COMPARISON_FIELD_LABELS = {
  name: 'name',
  email: 'email',
  manager: 'manager',
  segment: 'segment',
  function: 'function',
  LOB: 'LOB',
  pod: 'pod',
  terminationDate: 'termination date',
  termType: 'term type',
  reasonForTerm: 'reason for term',
  regrettedFlag: 'regretted flag',
};

function cleanValue(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseDateInput(value) {
  const raw = cleanValue(value);
  if (!raw) {
    return null;
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

function getOutputHeaderLabel(fieldKey, header) {
  if (!header) {
    return '';
  }

  if (fieldKey === 'Hire_Date') {
    return 'Start Date';
  }

  if (fieldKey === 'Termination_Date') {
    return 'End Date';
  }

  return header;
}

function findHeader(headers, preferredHeader, aliases) {
  if (preferredHeader && headers.includes(preferredHeader)) {
    return preferredHeader;
  }

  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  return (
    headers.find((header) => normalizedAliases.includes(normalizeHeader(header))) ?? ''
  );
}

function toBoolean(value) {
  const normalized = cleanValue(value).toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'y' || value === true;
}

function normalizeComparisonValue(fieldKey, value) {
  const raw = cleanValue(value);
  if (!raw) {
    return '';
  }

  if (fieldKey === 'terminationDate') {
    const parsedDate = parseDateInput(raw);
    return parsedDate ? formatDate(parsedDate) : raw.toLowerCase();
  }

  if (fieldKey === 'regrettedFlag') {
    if (['true', 'yes', 'y', '1'].includes(raw.toLowerCase())) {
      return 'true';
    }

    if (['false', 'no', 'n', '0'].includes(raw.toLowerCase())) {
      return 'false';
    }
  }

  return raw.toLowerCase();
}

function buildLiveProjection(row, liveHeaders, liveMapping, rowNumber) {
  const headerToField = new Map(
    Object.entries(liveMapping)
      .filter(([, header]) => header)
      .map(([fieldKey, header]) => [header, fieldKey]),
  );

  const projectedRow = {
    __rowNumber: rowNumber,
  };

  liveHeaders.forEach((header) => {
    const fieldKey = headerToField.get(header);
    const outputHeader = fieldKey ? getOutputHeaderLabel(fieldKey, header) : header;
    projectedRow[outputHeader] = cleanValue(row[header]);
  });

  return projectedRow;
}

function resolveHeaders(liveHeaders, liveMapping) {
  const projectedHeaders = liveHeaders.map((header) => {
    const matchedField = Object.entries(liveMapping).find(([, mappedHeader]) => mappedHeader === header);
    return matchedField ? getOutputHeaderLabel(matchedField[0], header) : header;
  });

  const stableHeaders = {
    workdayId: findHeader(projectedHeaders, '', STABLE_KEY_ALIASES.workdayId),
    salesforceId: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('SFDC_ID', liveMapping.SFDC_ID),
      STABLE_KEY_ALIASES.salesforceId,
    ),
    workEmail: findHeader(projectedHeaders, '', STABLE_KEY_ALIASES.workEmail),
  };

  const comparisonHeaders = {
    name: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('Full_Name', liveMapping.Full_Name),
      COMPARISON_FIELD_ALIASES.name,
    ),
    email: findHeader(projectedHeaders, stableHeaders.workEmail, COMPARISON_FIELD_ALIASES.email),
    manager: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('Manager', liveMapping.Manager),
      COMPARISON_FIELD_ALIASES.manager,
    ),
    segment: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('Segment', liveMapping.Segment),
      COMPARISON_FIELD_ALIASES.segment,
    ),
    function: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('Function_Origin', liveMapping.Function_Origin),
      COMPARISON_FIELD_ALIASES.function,
    ),
    LOB: findHeader(projectedHeaders, '', COMPARISON_FIELD_ALIASES.LOB),
    pod: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('Team', liveMapping.Team),
      COMPARISON_FIELD_ALIASES.pod,
    ),
    terminationDate: findHeader(
      projectedHeaders,
      getOutputHeaderLabel('Termination_Date', liveMapping.Termination_Date),
      COMPARISON_FIELD_ALIASES.terminationDate,
    ),
    termType: findHeader(projectedHeaders, '', COMPARISON_FIELD_ALIASES.termType),
    reasonForTerm: findHeader(projectedHeaders, '', COMPARISON_FIELD_ALIASES.reasonForTerm),
    regrettedFlag: findHeader(projectedHeaders, '', COMPARISON_FIELD_ALIASES.regrettedFlag),
  };

  return {
    projectedHeaders,
    stableHeaders,
    comparisonHeaders,
  };
}

function getStableKey(row, stableHeaders) {
  const priority = [
    ['Workday ID', stableHeaders.workdayId],
    ['Salesforce ID', stableHeaders.salesforceId],
    ['Work Email', stableHeaders.workEmail],
  ];

  for (const [label, header] of priority) {
    const value = cleanValue(row[header]);
    if (header && value) {
      return {
        header,
        label,
        value,
        compositeKey: `${label}:${value.toLowerCase()}`,
      };
    }
  }

  return null;
}

function getPersonLabel(row, headers) {
  const labelParts = [];
  const name = cleanValue(row[headers.name]);
  const workEmail = cleanValue(row[headers.email]);
  const salesforceId = cleanValue(row[headers.salesforceId]);
  const workdayId = cleanValue(row[headers.workdayId]);

  if (name) {
    labelParts.push(name);
  }
  if (workEmail) {
    labelParts.push(workEmail);
  } else if (salesforceId) {
    labelParts.push(salesforceId);
  } else if (workdayId) {
    labelParts.push(workdayId);
  }

  return labelParts.join(' · ') || 'Unidentified row';
}

function buildSample(entry) {
  return {
    rowNumber: entry.rowNumber,
    person: entry.person,
    stableKey: entry.stableKey,
    reason: entry.reason,
  };
}

function buildIssue(type, title, count, samples, details) {
  return {
    type,
    title,
    count,
    samples: samples.slice(0, 5),
    details,
  };
}

export function validateHistoricalExport({
  stitchedRows,
  liveRows,
  liveHeaders,
  liveMapping,
}) {
  const { stableHeaders, comparisonHeaders } = resolveHeaders(liveHeaders, liveMapping);
  const projectedLiveRows = liveRows.map((row, index) =>
    buildLiveProjection(row, liveHeaders, liveMapping, index + 2),
  );
  const currentRows = stitchedRows
    .map((row, index) => ({ ...row, __exportRowNumber: index + 1 }))
    .filter((row) => toBoolean(row.Current_Record));

  const blockingErrors = [];
  const warnings = [];
  const fieldMismatches = [];

  const currentMissingStableKeys = [];
  const currentByStableKey = new Map();

  currentRows.forEach((row) => {
    const stableKey = getStableKey(row, stableHeaders);
    const entry = {
      row,
      rowNumber: row.__exportRowNumber,
      person: getPersonLabel(row, { ...comparisonHeaders, ...stableHeaders }),
      stableKey: stableKey ? `${stableKey.label}: ${stableKey.value}` : 'Missing stable key',
    };

    if (!stableKey) {
      currentMissingStableKeys.push({
        ...entry,
        reason: 'Current row is missing Workday ID, Salesforce ID, and Work Email.',
      });
      return;
    }

    if (!currentByStableKey.has(stableKey.compositeKey)) {
      currentByStableKey.set(stableKey.compositeKey, []);
    }

    currentByStableKey.get(stableKey.compositeKey).push({
      ...entry,
      stableKey: `${stableKey.label}: ${stableKey.value}`,
    });
  });

  if (currentMissingStableKeys.length) {
    blockingErrors.push(
      buildIssue(
        'missing-current-stable-keys',
        'Current rows missing stable keys',
        currentMissingStableKeys.length,
        currentMissingStableKeys.map(buildSample),
        'Every current row must have Workday ID, Salesforce ID, or Work Email before export can proceed.',
      ),
    );
  }

  const duplicateCurrentRows = [];
  currentByStableKey.forEach((entries) => {
    if (entries.length > 1) {
      entries.forEach((entry) => {
        duplicateCurrentRows.push({
          ...entry,
          reason: 'More than one Current_Record = TRUE row was found for this stable key.',
        });
      });
    }
  });

  if (duplicateCurrentRows.length) {
    blockingErrors.push(
      buildIssue(
        'duplicate-current-rows',
        'Duplicate current rows',
        duplicateCurrentRows.length,
        duplicateCurrentRows.map(buildSample),
        'Exactly one Current_Record = TRUE row is allowed per person.',
      ),
    );
  }

  const liveMissingStableKeys = [];
  const liveByStableKey = new Map();

  projectedLiveRows.forEach((row) => {
    const stableKey = getStableKey(row, stableHeaders);
    const entry = {
      row,
      rowNumber: row.__rowNumber,
      person: getPersonLabel(row, { ...comparisonHeaders, ...stableHeaders }),
      stableKey: stableKey ? `${stableKey.label}: ${stableKey.value}` : 'Missing stable key',
    };

    if (!stableKey) {
      liveMissingStableKeys.push({
        ...entry,
        reason: 'Live roster row is missing Workday ID, Salesforce ID, and Work Email.',
      });
      return;
    }

    if (!liveByStableKey.has(stableKey.compositeKey)) {
      liveByStableKey.set(stableKey.compositeKey, entry);
    }
  });

  if (liveMissingStableKeys.length) {
    blockingErrors.push(
      buildIssue(
        'missing-live-stable-keys',
        'Live roster rows missing stable keys',
        liveMissingStableKeys.length,
        liveMissingStableKeys.map(buildSample),
        'The current slice cannot be reconciled to live roster rows that have no stable key.',
      ),
    );
  }

  const missingFromCurrentSlice = [];
  liveByStableKey.forEach((liveEntry, stableKey) => {
    if (!currentByStableKey.has(stableKey)) {
      missingFromCurrentSlice.push({
        rowNumber: liveEntry.rowNumber,
        person: liveEntry.person,
        stableKey: liveEntry.stableKey,
        reason: 'Live roster person is missing from the stitched current slice.',
      });
    }
  });

  if (missingFromCurrentSlice.length) {
    blockingErrors.push(
      buildIssue(
        'missing-from-current-slice',
        'Live roster people missing from current slice',
        missingFromCurrentSlice.length,
        missingFromCurrentSlice.map(buildSample),
        'Every live roster person should have exactly one current row in the stitched output.',
      ),
    );
  }

  const missingFromLiveRoster = [];
  currentByStableKey.forEach((entries, stableKey) => {
    if (!liveByStableKey.has(stableKey)) {
      entries.forEach((entry) => {
        missingFromLiveRoster.push({
          rowNumber: entry.rowNumber,
          person: entry.person,
          stableKey: entry.stableKey,
          reason: 'Stitched current row is missing from the live roster.',
        });
      });
    }
  });

  if (missingFromLiveRoster.length) {
    blockingErrors.push(
      buildIssue(
        'missing-from-live-roster',
        'Current slice people missing from live roster',
        missingFromLiveRoster.length,
        missingFromLiveRoster.map(buildSample),
        'The export should not produce a current person who is not present in the live roster.',
      ),
    );
  }

  liveByStableKey.forEach((liveEntry, stableKey) => {
    const currentEntries = currentByStableKey.get(stableKey);
    if (!currentEntries || currentEntries.length !== 1) {
      return;
    }

    const stitchedEntry = currentEntries[0];

    Object.entries(comparisonHeaders).forEach(([fieldKey, header]) => {
      if (!header) {
        return;
      }

      const liveValue = cleanValue(liveEntry.row[header]);
      const stitchedValue = cleanValue(stitchedEntry.row[header]);

      if (!liveValue && !stitchedValue) {
        return;
      }

      if (
        normalizeComparisonValue(fieldKey, liveValue) !==
        normalizeComparisonValue(fieldKey, stitchedValue)
      ) {
        fieldMismatches.push({
          stableKey: liveEntry.stableKey,
          person: liveEntry.person,
          field: COMPARISON_FIELD_LABELS[fieldKey],
          liveValue: liveValue || '—',
          stitchedValue: stitchedValue || '—',
        });
      }
    });
  });

  if (fieldMismatches.length) {
    warnings.push(
      buildIssue(
        'current-field-mismatches',
        'Current field mismatches',
        fieldMismatches.length,
        fieldMismatches.map((mismatch) => ({
          rowNumber: 'live vs current',
          person: mismatch.person,
          stableKey: mismatch.stableKey,
          reason: `${mismatch.field}: live "${mismatch.liveValue}" vs stitched "${mismatch.stitchedValue}"`,
        })),
        'These rows exist in both places, but one or more current-state fields do not match the live roster.',
      ),
    );
  }

  const summary = {
    liveRosterRows: projectedLiveRows.length,
    assignmentRows: stitchedRows.length,
    currentRows: currentRows.length,
    blockingErrorCount: blockingErrors.reduce((sum, issue) => sum + issue.count, 0),
    warningCount: warnings.reduce((sum, issue) => sum + issue.count, 0),
    sampleMismatchCount: fieldMismatches.length,
  };

  return {
    passed: blockingErrors.length === 0,
    summary,
    blockingErrors,
    warnings,
    sampleMismatchedRows: fieldMismatches.slice(0, 10),
    stableKeyHeaders: stableHeaders,
  };
}
