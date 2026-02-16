import { Buffer } from 'buffer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  totalIncome: number;
  totalExpenses: number;
  dateRange: {
    start: string;
    end: string;
  };
  sourceChunks?: string[];
}

const DATE_FIELD_KEYS = ['date', 'transaction_date', 'posted_date', 'post_date', 'value_date'];
const DESCRIPTION_FIELD_KEYS = ['description', 'memo', 'payee', 'merchant', 'narration', 'details', 'transaction'];
const AMOUNT_FIELD_KEYS = ['amount', 'transaction_amount', 'value', 'transaction value', 'amt'];
const DEBIT_FIELD_KEYS = ['debit', 'withdrawal', 'withdrawals', 'payment', 'outflow', 'debits'];
const CREDIT_FIELD_KEYS = ['credit', 'deposit', 'deposits', 'inflow', 'credits'];

const PDF_DATE_REGEX = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
const PDF_DATE_TOKEN_REGEX = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
const PDF_AMOUNT_REGEX = /(?:-?\$?\(?\d[\d,]*(?:\.\d{2})?\)?-?(?:\s?(?:CR|DR))?)/gi;
const PDF_NON_TRANSACTION_PATTERNS = [
  /beginning balance/i,
  /ending balance/i,
  /available balance/i,
  /daily balance/i,
  /statement period/i,
  /total (deposits|credits|withdrawals|debits|fees|interest)/i,
  /account (number|summary)/i,
  /page \d+ of \d+/i,
  /^date\s+description/i,
  /^description\s+amount/i,
  /transactions? total/i,
];

function asCleanString(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date support.
    if (value > 20000 && value < 80000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const normalized = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);

      if (!Number.isNaN(normalized.getTime())) {
        return normalized.toISOString().split('T')[0];
      }
    }

    throw new Error(`Invalid date format: ${value}`);
  }

  const raw = asCleanString(value);
  if (!raw) {
    throw new Error('Invalid date format: empty');
  }

  const date = new Date(raw);

  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  // Handles MM/DD/YYYY and DD/MM/YYYY variants.
  const parts = raw.split(/[\/-]/).map((item) => item.trim());
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const maybeUs = new Date(`${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`);
    if (!Number.isNaN(maybeUs.getTime())) {
      return maybeUs.toISOString().split('T')[0];
    }

    const maybeIntl = new Date(`${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`);
    if (!Number.isNaN(maybeIntl.getTime())) {
      return maybeIntl.toISOString().split('T')[0];
    }
  }

  throw new Error(`Invalid date format: ${raw}`);
}

function hasAmountSign(raw: string) {
  return (
    raw.includes('(') ||
    raw.includes(')') ||
    raw.trim().startsWith('-') ||
    raw.trim().endsWith('-') ||
    /\b(cr|dr)\b/i.test(raw)
  );
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid amount: ${value}`);
    }
    return value;
  }

  const raw = asCleanString(value);
  if (!raw) {
    throw new Error('Invalid amount: empty');
  }

  const isCr = /\bcr\b/i.test(raw);
  const isDr = /\bdr\b/i.test(raw);
  const isNegative = raw.includes('(') || raw.trim().startsWith('-') || raw.trim().endsWith('-') || isDr;

  const cleaned = raw.replace(/[$,\s]/g, '').replace(/[()]/g, '').replace(/\b(cr|dr)\b/gi, '');
  const numeric = Number(cleaned);

  if (Number.isNaN(numeric)) {
    throw new Error(`Invalid amount: ${raw}`);
  }

  if (isNegative) return -Math.abs(numeric);
  if (isCr) return Math.abs(numeric);
  return numeric;
}

function classifyCategory(description: string, amount: number) {
  const desc = description.toLowerCase();

  if (amount > 0) {
    if (desc.includes('payroll') || desc.includes('salary') || desc.includes('wage')) {
      return 'income_salary';
    }

    if (desc.includes('interest') || desc.includes('dividend')) {
      return 'income_investment';
    }

    return 'income_other';
  }

  if (desc.includes('uber') || desc.includes('lyft') || desc.includes('gas') || desc.includes('shell') || desc.includes('chevron')) {
    return 'transportation';
  }

  if (desc.includes('rent') || desc.includes('mortgage')) {
    return 'housing';
  }

  if (desc.includes('walmart') || desc.includes('costco') || desc.includes('target') || desc.includes('whole foods') || desc.includes('trader joe')) {
    return 'groceries';
  }

  if (desc.includes('restaurant') || desc.includes('doordash') || desc.includes('grubhub') || desc.includes('coffee') || desc.includes('cafe')) {
    return 'dining';
  }

  if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('hulu') || desc.includes('prime')) {
    return 'subscriptions';
  }

  if (desc.includes('hospital') || desc.includes('clinic') || desc.includes('pharmacy')) {
    return 'healthcare';
  }

  if (desc.includes('insurance')) {
    return 'insurance';
  }

  if (desc.includes('tuition') || desc.includes('student loan')) {
    return 'education';
  }

  return 'other';
}

function normalizeRowKeys(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase().trim()] = value;
  }

  return normalized;
}

function pickField(normalized: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalized[key];
    if (value !== undefined && asCleanString(value) !== '') {
      return value;
    }
  }

  return undefined;
}

function extractAmountFromNormalized(normalized: Record<string, unknown>) {
  const amountRaw = pickField(normalized, AMOUNT_FIELD_KEYS);
  if (amountRaw !== undefined) {
    return parseAmount(amountRaw);
  }

  const debitRaw = pickField(normalized, DEBIT_FIELD_KEYS);
  const creditRaw = pickField(normalized, CREDIT_FIELD_KEYS);

  const hasDebit = debitRaw !== undefined && asCleanString(debitRaw) !== '';
  const hasCredit = creditRaw !== undefined && asCleanString(creditRaw) !== '';

  if (!hasDebit && !hasCredit) {
    return null;
  }

  const debit = hasDebit ? Math.abs(parseAmount(debitRaw)) : 0;
  const credit = hasCredit ? Math.abs(parseAmount(creditRaw)) : 0;

  if (credit > 0 && debit > 0) return credit - debit;
  if (credit > 0) return credit;
  if (debit > 0) return -debit;

  return null;
}

function rowToTransaction(row: Record<string, unknown>) {
  const normalized = normalizeRowKeys(row);
  const dateRaw = pickField(normalized, DATE_FIELD_KEYS);
  const descriptionRaw = pickField(normalized, DESCRIPTION_FIELD_KEYS);

  if (dateRaw === undefined || descriptionRaw === undefined) {
    return null;
  }

  const amount = extractAmountFromNormalized(normalized);
  if (amount === null) {
    return null;
  }

  const description = asCleanString(descriptionRaw);
  if (!description) {
    return null;
  }

  try {
    const normalizedDate = normalizeDate(dateRaw);
    return {
      date: normalizedDate,
      description,
      amount,
      category: classifyCategory(description, amount),
    } satisfies ParsedTransaction;
  } catch {
    return null;
  }
}

function finalizeResult(rawTransactions: ParsedTransaction[]): ParseResult {
  if (rawTransactions.length === 0) {
    throw new Error('No valid transaction rows were found');
  }

  const sortedByDate = [...rawTransactions].sort((a, b) => a.date.localeCompare(b.date));

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of rawTransactions) {
    if (tx.amount > 0) {
      totalIncome += tx.amount;
    } else {
      totalExpenses += Math.abs(tx.amount);
    }
  }

  return {
    transactions: sortedByDate,
    totalIncome,
    totalExpenses,
    dateRange: {
      start: sortedByDate[0].date,
      end: sortedByDate[sortedByDate.length - 1].date,
    },
  };
}

function chunkTextByMaxLength(text: string, maxChars = 2000) {
  if (!text.trim()) {
    return [] as string[];
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  };

  for (const line of lines) {
    // Split pathological long lines into max-sized slices.
    if (line.length > maxChars) {
      flush();
      for (let index = 0; index < line.length; index += maxChars) {
        chunks.push(line.slice(index, index + maxChars));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxChars) {
      flush();
      current = line;
    } else {
      current = candidate;
    }
  }

  flush();
  return chunks;
}

function isCsvFile(file: File) {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.csv') || file.type.includes('csv');
}

function isExcelFile(file: File) {
  const lower = file.name.toLowerCase();

  return (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    file.type.includes('spreadsheetml') ||
    file.type.includes('ms-excel')
  );
}

function isPdfFile(file: File) {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.pdf') || file.type.includes('pdf');
}

function scoreHeaderRow(cells: unknown[]) {
  const headers = cells.map((cell) => asCleanString(cell).toLowerCase().replace(/[^a-z0-9]+/g, '_'));

  let score = 0;

  if (headers.some((item) => DATE_FIELD_KEYS.includes(item))) score += 1;
  if (headers.some((item) => DESCRIPTION_FIELD_KEYS.includes(item))) score += 1;
  if (headers.some((item) => [...AMOUNT_FIELD_KEYS, ...DEBIT_FIELD_KEYS, ...CREDIT_FIELD_KEYS].includes(item))) {
    score += 1;
  }

  return score;
}

function findHeaderRowIndex(rows: unknown[][]) {
  const limit = Math.min(rows.length, 25);

  for (let index = 0; index < limit; index += 1) {
    const score = scoreHeaderRow(rows[index] || []);
    if (score >= 2) {
      return index;
    }
  }

  return -1;
}

function looksLikeAmountToken(value: string) {
  return /^-?\$?\(?((\d{1,3}(,\d{3})+)|\d+)(\.\d{2})?\)?-?(\s?(CR|DR))?$/i.test(value.trim());
}

function looksLikePositiveDescription(text: string) {
  return /\b(credit|deposit|payroll|salary|refund|interest|dividend|transfer in|ach credit)\b/i.test(text);
}

function safeParseAmount(value: string) {
  try {
    return parseAmount(value);
  } catch {
    return null;
  }
}

function hasDateToken(text: string) {
  return PDF_DATE_REGEX.test(text);
}

function getFirstDateToken(text: string) {
  const match = text.match(PDF_DATE_REGEX);
  return match ? match[0] : null;
}

function isLikelyAmountToken(value: string) {
  const token = value.trim();
  if (!token) return false;
  if (/^\d{1,2}$/.test(token)) return false; // Day/month fragments.
  if (/^\d{4}$/.test(token)) return false; // Year fragments.
  if (/[/-]/.test(token)) return false; // Date-like.

  // Prefer strongly amount-like tokens while allowing 3+ digit integers.
  const stronglyAmountLike = /[.$,()\-]|(?:\bCR\b|\bDR\b)/i.test(token) || /\d+\.\d{2}\b/.test(token);
  const plainIntegerAmount = /^\d{3,}$/.test(token);

  if (!stronglyAmountLike && !plainIntegerAmount) return false;
  return safeParseAmount(token) !== null;
}

function extractPdfAmountTokens(text: string) {
  const matches = text.match(PDF_AMOUNT_REGEX) || [];
  return matches.map((token) => token.trim()).filter((token) => isLikelyAmountToken(token));
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizePdfDescription(text: string, dateToken: string, amountTokens: string[]) {
  let cleaned = text;
  const dateTokens = cleaned.match(PDF_DATE_TOKEN_REGEX) || [dateToken];

  for (const token of dateTokens) {
    cleaned = cleaned.replace(new RegExp(escapeForRegex(token), 'g'), ' ');
  }

  // Remove longer amount tokens first to avoid partial overlaps.
  const sortedAmountTokens = [...amountTokens].sort((a, b) => b.length - a.length);
  for (const token of sortedAmountTokens) {
    cleaned = cleaned.replace(new RegExp(escapeForRegex(token), 'g'), ' ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function isLikelyNonTransactionDescription(description: string) {
  const normalized = description.trim();
  if (!normalized) return true;
  if (normalized.length < 3) return true;
  if (!/[a-z]/i.test(normalized)) return true;
  return PDF_NON_TRANSACTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildPdfTransactionFromText(
  text: string,
  fallbackDateToken?: string,
): ParsedTransaction | null {
  const dateToken = fallbackDateToken || getFirstDateToken(text);
  if (!dateToken) return null;

  let normalizedDate: string;
  try {
    normalizedDate = normalizeDate(dateToken);
  } catch {
    return null;
  }

  const amountTokens = extractPdfAmountTokens(text);
  if (amountTokens.length === 0) {
    return null;
  }

  // Statements frequently include "... amount balance", so prefer token before final when "balance" appears.
  let selectedAmountToken = amountTokens[amountTokens.length - 1];
  if (/balance/i.test(text) && amountTokens.length > 1) {
    selectedAmountToken = amountTokens[amountTokens.length - 2];
  }

  let parsedAmount = safeParseAmount(selectedAmountToken);
  if (parsedAmount === null) {
    const parsedCandidates = amountTokens
      .map((token) => ({ token, value: safeParseAmount(token) }))
      .filter((entry): entry is { token: string; value: number } => entry.value !== null);
    if (parsedCandidates.length === 0) return null;
    const fallbackCandidate = parsedCandidates[parsedCandidates.length - 1];
    selectedAmountToken = fallbackCandidate.token;
    parsedAmount = fallbackCandidate.value;
  }

  const description = sanitizePdfDescription(text, dateToken, amountTokens);
  if (isLikelyNonTransactionDescription(description)) {
    return null;
  }

  const amount =
    hasAmountSign(selectedAmountToken) || looksLikePositiveDescription(description) || looksLikePositiveDescription(text)
      ? parsedAmount
      : -Math.abs(parsedAmount);

  return {
    date: normalizedDate,
    description,
    amount,
    category: classifyCategory(description, amount),
  };
}

function buildPdfTransactionKey(tx: ParsedTransaction) {
  return `${tx.date}|${tx.description.toLowerCase()}|${tx.amount.toFixed(2)}|${tx.category.toLowerCase()}`;
}

function buildTransactionCountMap(transactions: ParsedTransaction[]) {
  const countMap = new Map<string, { tx: ParsedTransaction; count: number }>();

  for (const tx of transactions) {
    const key = buildPdfTransactionKey(tx);
    const existing = countMap.get(key);
    if (!existing) {
      countMap.set(key, { tx, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  return countMap;
}

function mergePdfStrategies(strategies: ParsedTransaction[][]) {
  const merged = new Map<string, { tx: ParsedTransaction; maxCount: number }>();

  for (const strategyTransactions of strategies) {
    const countMap = buildTransactionCountMap(strategyTransactions);
    for (const [key, value] of countMap.entries()) {
      const existing = merged.get(key);
      if (!existing || value.count > existing.maxCount) {
        merged.set(key, { tx: value.tx, maxCount: value.count });
      }
    }
  }

  const finalTransactions: ParsedTransaction[] = [];
  for (const { tx, maxCount } of merged.values()) {
    for (let count = 0; count < maxCount; count += 1) {
      finalTransactions.push({ ...tx });
    }
  }

  return finalTransactions;
}

function parsePdfTransactionsFromLines(lines: string[]) {
  const transactions: ParsedTransaction[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const dateToken = getFirstDateToken(line);
    if (!dateToken) continue;

    const singleLineTx = buildPdfTransactionFromText(line, dateToken);
    if (singleLineTx) {
      transactions.push(singleLineTx);
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && !hasDateToken(nextLine)) {
      const twoLineTx = buildPdfTransactionFromText(`${line} ${nextLine}`, dateToken);
      if (twoLineTx) {
        transactions.push(twoLineTx);
        continue;
      }
    }

    const thirdLine = lines[index + 2];
    if (nextLine && thirdLine && !hasDateToken(nextLine) && !hasDateToken(thirdLine)) {
      const threeLineTx = buildPdfTransactionFromText(`${line} ${nextLine} ${thirdLine}`, dateToken);
      if (threeLineTx) {
        transactions.push(threeLineTx);
      }
    }
  }

  return transactions;
}

function parsePdfTransactionsFromBlocks(lines: string[]) {
  const transactions: ParsedTransaction[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const dateToken = getFirstDateToken(line);
    if (!dateToken) continue;

    let block = line;
    let lookaheadIndex = index + 1;
    let consumed = 0;

    while (lookaheadIndex < lines.length && consumed < 4) {
      const candidateLine = lines[lookaheadIndex];
      if (hasDateToken(candidateLine)) break;
      block = `${block} ${candidateLine}`;
      lookaheadIndex += 1;
      consumed += 1;
    }

    const transaction = buildPdfTransactionFromText(block, dateToken);
    if (transaction) {
      transactions.push(transaction);
    }
  }

  return transactions;
}

function parseSimpleRow(row: unknown[]) {
  const cells = row.map((cell) => asCleanString(cell)).filter(Boolean);
  if (cells.length < 3) {
    return null;
  }

  let normalizedDate: string;
  try {
    normalizedDate = normalizeDate(cells[0]);
  } catch {
    return null;
  }

  let amountIndex = -1;
  for (let idx = cells.length - 1; idx >= 1; idx -= 1) {
    if (looksLikeAmountToken(cells[idx])) {
      amountIndex = idx;
      break;
    }
  }

  if (amountIndex === -1) {
    return null;
  }

  const amountToken = cells[amountIndex];
  const parsedAmount = safeParseAmount(amountToken);
  if (parsedAmount === null) {
    return null;
  }

  const description = cells.slice(1, amountIndex).join(' ').trim();
  if (!description) {
    return null;
  }

  const amount =
    hasAmountSign(amountToken) || looksLikePositiveDescription(description)
      ? parsedAmount
      : -Math.abs(parsedAmount);

  return {
    date: normalizedDate,
    description,
    amount,
    category: classifyCategory(description, amount),
  } satisfies ParsedTransaction;
}

function parseRowsToTransactions(rows: unknown[][]) {
  const headerRowIndex = findHeaderRowIndex(rows);
  const transactions: ParsedTransaction[] = [];

  if (headerRowIndex >= 0) {
    const headerCells = rows[headerRowIndex] || [];
    const headers = headerCells.map((cell) =>
      asCleanString(cell).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    );

    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index] || [];
      const mapped: Record<string, unknown> = {};

      headers.forEach((header, headerIndex) => {
        if (!header) return;
        mapped[header] = row[headerIndex];
      });

      const tx = rowToTransaction(mapped);
      if (tx) transactions.push(tx);
    }
  }

  if (transactions.length > 0) {
    return transactions;
  }

  return rows
    .map((row) => parseSimpleRow(row))
    .filter(Boolean) as ParsedTransaction[];
}

async function parseCsvTransactions(file: File): Promise<ParsedTransaction[]> {
  const text = await file.text();

  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    throw new Error(`CSV parse error: ${result.errors[0]?.message || 'Unknown error'}`);
  }

  return result.data
    .map((row) => rowToTransaction(row as Record<string, unknown>))
    .filter(Boolean) as ParsedTransaction[];
}

async function parseExcelTransactions(file: File): Promise<ParsedTransaction[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    raw: false,
    cellDates: false,
  });

  const parsed: ParsedTransaction[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    parsed.push(...parseRowsToTransactions(rows));
  }

  return parsed;
}

async function parsePdfTransactions(
  file: File,
): Promise<{ transactions: ParsedTransaction[]; sourceChunks: string[] }> {
  const { text, sourceChunks } = await extractPdfTextWithChunks(file, 2000);

  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
  const normalizedLines = rawLines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Strategy A: preserve table boundaries (2+ spaces/tabs) and parse like tabular rows.
  const tableRows = rawLines.map((line) => line.split(/\s{2,}|\t+/).map((cell) => cell.trim()).filter(Boolean));
  const tableTransactions = parseRowsToTransactions(tableRows);

  // Strategy B: same-line and short lookahead parsing.
  const lineTransactions = parsePdfTransactionsFromLines(normalizedLines);

  // Strategy C: block parsing until next date line.
  const blockTransactions = parsePdfTransactionsFromBlocks(normalizedLines);

  const transactions = mergePdfStrategies([
    tableTransactions,
    lineTransactions,
    blockTransactions,
  ]);

  return {
    transactions,
    sourceChunks,
  };
}

async function extractPdfTextWithChunks(file: File, maxChunkChars: number) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
    data: Buffer,
    options?: Record<string, unknown>,
  ) => Promise<{ text?: string }>;
  const parsed = await pdfParse(buffer, { max: 0 });
  const text = parsed.text || '';
  const sourceChunks = chunkTextByMaxLength(text, maxChunkChars);

  return {
    text,
    sourceChunks,
  };
}

export async function extractPdfTextChunks(file: File, maxChunkChars = 2000): Promise<string[]> {
  if (!isPdfFile(file)) {
    throw new Error('File is not a PDF statement');
  }

  const { sourceChunks } = await extractPdfTextWithChunks(file, maxChunkChars);
  return sourceChunks;
}

export async function parseCSV(file: File): Promise<ParseResult> {
  if (!isCsvFile(file)) {
    throw new Error('File is not a CSV statement');
  }

  const transactions = await parseCsvTransactions(file);
  return finalizeResult(transactions);
}

export async function parseBankStatement(file: File): Promise<ParseResult> {
  if (isCsvFile(file)) {
    const transactions = await parseCsvTransactions(file);
    return finalizeResult(transactions);
  }

  if (isExcelFile(file)) {
    const transactions = await parseExcelTransactions(file);
    if (transactions.length === 0) {
      throw new Error('No valid transaction rows were found in Excel file');
    }
    return finalizeResult(transactions);
  }

  if (isPdfFile(file)) {
    const parsedPdf = await parsePdfTransactions(file);
    if (parsedPdf.transactions.length === 0) {
      throw new Error(
        'No valid transaction rows were found in PDF. Try exporting a CSV/XLSX statement from your bank for best results.',
      );
    }
    return {
      ...finalizeResult(parsedPdf.transactions),
      sourceChunks: parsedPdf.sourceChunks,
    };
  }

  throw new Error('Unsupported statement format. Please upload CSV, XLS, XLSX, or PDF.');
}
