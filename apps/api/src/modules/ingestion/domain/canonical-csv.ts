import { canonicalHash } from "../../shared/hash.js";
import { validationError } from "../../shared/errors.js";
import type { MoneyValue } from "../../shared/money.js";
import {
  marketplaceEventTypes,
  type CanonicalMarketplaceEvent,
  type DataQualityIssue,
  type MarketplaceEventType,
  type ParsedIngestion,
} from "./types.js";

const requiredHeaders = [
  "external_event_id",
  "event_type",
  "occurred_at",
  "amount_minor",
  "currency",
  "scale",
] as const;
const optionalHeaders = ["order_reference", "payout_reference", "source_status"] as const;
const allowedHeaders = new Set<string>([...requiredHeaders, ...optionalHeaders]);
const formulaPattern = /^[=+\-@]/;

export type CsvLimits = {
  maxBytes: number;
  maxRows: number;
  maxFieldLength: number;
};

const defaultLimits: CsvLimits = {
  maxBytes: 5_000_000,
  maxRows: 50_000,
  maxFieldLength: 2_048,
};

function parseRfc4180(text: string, limits: CsvLimits): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    if (field.length > limits.maxFieldLength) {
      validationError("CSV field exceeds the configured length limit.");
    }
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    if (rows.length > limits.maxRows + 1) {
      validationError("CSV exceeds the configured row limit.");
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string;
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        validationError("CSV quote must begin at the start of a field.");
      }
      inQuotes = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else if (character === "\r") {
      if (text[index + 1] !== "\n") {
        validationError("CSV carriage returns must use CRLF line endings.");
      }
      pushRow();
      index += 1;
    } else if (character === "\0") {
      validationError("CSV contains a NUL byte.");
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    validationError("CSV contains an unterminated quoted field.");
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

function normalizedTimestamp(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().replace(".000Z", "Z");
}

function rowIssue(rowNumber: number, field: string, detail: string): DataQualityIssue {
  return {
    code: "DATA_INCONSISTENT",
    severity: "BLOCKING",
    blocksAutomation: true,
    rowNumber,
    field,
    detail,
  };
}

function normalizeRow(
  values: string[],
  headers: string[],
  rowNumber: number,
): { event?: CanonicalMarketplaceEvent; issues: DataQualityIssue[] } {
  if (values.length !== headers.length) {
    return { issues: [rowIssue(rowNumber, "row", "Row column count does not match header.")] };
  }
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  const issues: DataQualityIssue[] = [];
  const eventType = record.event_type?.toUpperCase() ?? "";
  const occurredAt = normalizedTimestamp(record.occurred_at ?? "");
  const currency = record.currency?.toUpperCase() ?? "";
  const scale = Number(record.scale);

  if (!(marketplaceEventTypes as readonly string[]).includes(eventType)) {
    issues.push(rowIssue(rowNumber, "event_type", "Unsupported marketplace event type."));
  }
  if ((record.external_event_id ?? "").length === 0 || (record.external_event_id?.length ?? 0) > 255) {
    issues.push(rowIssue(rowNumber, "external_event_id", "External event ID is required."));
  }
  if (occurredAt === null) {
    issues.push(rowIssue(rowNumber, "occurred_at", "Timestamp must be UTC RFC 3339."));
  }
  if (!/^-?(0|[1-9][0-9]*)$/.test(record.amount_minor ?? "")) {
    issues.push(rowIssue(rowNumber, "amount_minor", "Amount must be a canonical integer string."));
  }
  if (!/^[A-Z0-9]{3,12}$/.test(currency)) {
    issues.push(rowIssue(rowNumber, "currency", "Currency must be an uppercase code."));
  }
  if (!/^\d+$/.test(record.scale ?? "") || !Number.isInteger(scale) || scale < 0 || scale > 18) {
    issues.push(rowIssue(rowNumber, "scale", "Scale must be an integer from 0 through 18."));
  }
  for (const fieldName of optionalHeaders) {
    const value = record[fieldName] ?? "";
    if (value.length > 0 && formulaPattern.test(value)) {
      issues.push(rowIssue(rowNumber, fieldName, "Formula-like text is not accepted."));
    }
  }
  if (issues.length > 0 || occurredAt === null) {
    return { issues };
  }

  const amount: MoneyValue = {
    amountMinor: record.amount_minor as string,
    currency,
    scale,
  };
  const safeRow = {
    externalEventId: record.external_event_id as string,
    eventType: eventType as MarketplaceEventType,
    occurredAt,
    amount,
    ...(record.order_reference ? { orderReference: record.order_reference } : {}),
    ...(record.payout_reference ? { payoutReference: record.payout_reference } : {}),
    ...(record.source_status ? { sourceStatus: record.source_status } : {}),
  };
  return {
    event: {
      ...safeRow,
      sourceRowHash: canonicalHash(safeRow),
      sourceRowNumber: rowNumber,
    },
    issues: [],
  };
}

export function parseCanonicalCsv(
  bytes: Uint8Array,
  configuredLimits: Partial<CsvLimits> = {},
): ParsedIngestion {
  const limits = { ...defaultLimits, ...configuredLimits };
  if (bytes.byteLength > limits.maxBytes) {
    validationError("CSV exceeds the configured byte limit.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    validationError("CSV must contain valid UTF-8.");
  }
  const rows = parseRfc4180(text, limits);
  if (rows.length === 0) {
    validationError("CSV header row is required.");
  }
  const headers = rows[0] as string[];
  if (new Set(headers).size !== headers.length) {
    validationError("CSV contains duplicate headers.");
  }
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      validationError(`CSV is missing required header ${required}.`);
    }
  }
  for (const header of headers) {
    if (!allowedHeaders.has(header)) {
      validationError(`CSV contains unsupported header ${header}.`);
    }
  }

  const issues: DataQualityIssue[] = [];
  const events: CanonicalMarketplaceEvent[] = [];
  const identities = new Map<string, string>();
  let duplicateRows = 0;
  let rejectedRows = 0;
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.length > 0));

  for (let index = 0; index < dataRows.length; index += 1) {
    const result = normalizeRow(dataRows[index] as string[], headers, index + 2);
    issues.push(...result.issues);
    if (result.event === undefined) {
      rejectedRows += 1;
      continue;
    }
    const previousHash = identities.get(result.event.externalEventId);
    if (previousHash === result.event.sourceRowHash) {
      duplicateRows += 1;
      continue;
    }
    if (previousHash !== undefined) {
      rejectedRows += 1;
      issues.push(
        rowIssue(
          result.event.sourceRowNumber,
          "external_event_id",
          "External event ID conflicts with a different canonical row.",
        ),
      );
      continue;
    }
    identities.set(result.event.externalEventId, result.event.sourceRowHash);
    events.push(result.event);
  }

  if (dataRows.length === 0) {
    issues.push({
      code: "MISSING_PAYOUT_HISTORY",
      severity: "BLOCKING",
      blocksAutomation: true,
      detail: "No marketplace event rows were supplied.",
    });
  }
  return {
    events,
    report: {
      format: "JEJAK_CANONICAL_CSV_V1",
      totalRows: dataRows.length,
      validUniqueRows: events.length,
      duplicateRows,
      rejectedRows,
      qualityScoreBps:
        dataRows.length === 0 ? 0 : Math.floor((events.length * 10_000) / dataRows.length),
      issues,
    },
  };
}
