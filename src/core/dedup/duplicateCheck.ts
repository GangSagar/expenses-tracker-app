import { Expense } from '../../types/expense';

export const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export type DedupRecord = Pick<Expense,
  | 'id'
  | 'amount'
  | 'merchant'
  | 'transactionType'
  | 'timestamp'
  | 'source'
  | 'referenceId'
  | 'rawMessage'
  | 'isInvalid'
  | 'isDuplicate'
>;

export type DedupCandidate = Omit<DedupRecord, 'id' | 'isInvalid' | 'isDuplicate'>
  & Partial<Pick<DedupRecord, 'id' | 'isInvalid' | 'isDuplicate'>>;

export interface DedupMatch {
  kind: 'definite' | 'possible';
  reason: 'reference_id' | 'exact_message' | 'amount_merchant_time';
  existingTransactionId?: number;
}

export interface DedupCache {
  records: DedupRecord[];
  referenceIndex: Map<string, DedupRecord[]>;
  timestampIndex: DedupRecord[];
}

export function findDuplicate(
  candidate: DedupCandidate,
  source: DedupRecord[] | DedupCache,
): DedupMatch | null {
  const cache = Array.isArray(source) ? null : source;
  const records = Array.isArray(source) ? source : source.records;
  const referenceId = normalizeReference(candidate.referenceId);
  if (referenceId) {
    const possibleReferences = cache?.referenceIndex.get(referenceId) || records;
    const match = possibleReferences.find(record =>
      isEligible(record) && normalizeReference(record.referenceId) === referenceId,
    );
    if (match) return matchResult('definite', 'reference_id', match);
  }

  const sourceByTime = cache?.timestampIndex || [...records].sort((left, right) => left.timestamp - right.timestamp);
  if (!Number.isFinite(candidate.timestamp)) return null;
  const minimum = candidate.timestamp - DEDUP_WINDOW_MS;
  const maximum = candidate.timestamp + DEDUP_WINDOW_MS;
  let start = lowerBound(sourceByTime, minimum);
  const withinWindow: DedupRecord[] = [];
  for (; start < sourceByTime.length && sourceByTime[start].timestamp <= maximum; start += 1) {
    if (isEligible(sourceByTime[start])) withinWindow.push(sourceByTime[start]);
  }
  const rawMessage = normalizeMessage(candidate.rawMessage);
  const matchingMessage = rawMessage && withinWindow.find(record =>
    Number(record.amount) === Number(candidate.amount) &&
    record.transactionType === candidate.transactionType &&
    normalizeMessage(record.rawMessage) === rawMessage,
  );
  if (matchingMessage) return matchResult('definite', 'exact_message', matchingMessage);

  const merchant = normalizeMerchant(candidate.merchant);
  if (!merchant) return null;
  const possibleMatch = withinWindow.find(record =>
    Number(record.amount) === Number(candidate.amount) &&
    record.transactionType === candidate.transactionType &&
    normalizeMerchant(record.merchant) === merchant,
  );
  return possibleMatch
    ? matchResult('possible', 'amount_merchant_time', possibleMatch)
    : null;
}

export function createDedupCache(records: DedupRecord[] = []): DedupCache {
  const cache: DedupCache = { records: [], referenceIndex: new Map(), timestampIndex: [] };
  records.filter(isEligible).forEach(record => addRecord(cache, { ...record }));
  return cache;
}

export function addDedupCandidate(cache: DedupCache, candidate: DedupCandidate): void {
  addRecord(cache, {
    ...candidate,
    isInvalid: false,
    isDuplicate: false,
  });
}

function addRecord(cache: DedupCache, record: DedupRecord): void {
  cache.records.push(record);
  const referenceId = normalizeReference(record.referenceId);
  if (referenceId) {
    const records = cache.referenceIndex.get(referenceId) || [];
    records.push(record);
    cache.referenceIndex.set(referenceId, records);
  }
  let index = lowerBound(cache.timestampIndex, record.timestamp);
  while (index < cache.timestampIndex.length && cache.timestampIndex[index].timestamp === record.timestamp) {
    index += 1;
  }
  cache.timestampIndex.splice(index, 0, record);
}

function lowerBound(records: DedupRecord[], timestamp: number): number {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (records[middle].timestamp < timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

function isEligible(record: DedupRecord): boolean {
  return !record.isInvalid && !record.isDuplicate;
}

function matchResult(
  kind: DedupMatch['kind'],
  reason: DedupMatch['reason'],
  record: DedupRecord,
): DedupMatch {
  return {
    kind,
    reason,
    existingTransactionId: record.id,
  };
}

function normalizeReference(value?: string | null): string {
  return (value || '').trim().toLocaleLowerCase();
}

function normalizeMessage(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeMerchant(value?: string | null): string {
  return (value || '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}
