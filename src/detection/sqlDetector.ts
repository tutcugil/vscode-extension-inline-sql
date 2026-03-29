import { SqlRegion } from '../types';
import { extractStrings, replaceInterpolations } from './stringExtractor';
import {
  matchesSqlStatementStart,
  ALL_SQL_KEYWORDS,
  SQL_STATEMENT_KEYWORDS,
  MIN_SQL_STRING_LENGTH,
} from './patterns';

/**
 * Detect all SQL regions in a document.
 *
 * @param text - Full document text
 * @param languageId - Host language ID (typescript, python, java, csharp, etc.)
 * @param minKeywords - Minimum distinct SQL keywords for scoring-based detection (default: 2)
 * @returns Array of detected SQL regions
 */
export function detectSqlRegions(
  text: string,
  languageId: string,
  minKeywords: number = 2
): SqlRegion[] {
  const strings = extractStrings(text, languageId);
  const regions: SqlRegion[] = [];

  for (const str of strings) {
    const cleaned = replaceInterpolations(str.content, languageId);
    if (isSqlString(cleaned, minKeywords)) {
      regions.push({
        startOffset: str.contentStart,
        endOffset: str.contentEnd,
        sqlText: cleaned,
        languageId,
      });
    }
  }

  return regions;
}

/**
 * Check if a string content looks like SQL.
 *
 * Two-tier detection:
 * 1. Fast path: string starts with a SQL statement keyword (SELECT, INSERT, etc.)
 * 2. Scoring: string contains enough distinct SQL keywords and meets minimum length
 */
export function isSqlString(content: string, minKeywords: number = 2): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // Fast path: starts with a SQL statement keyword
  if (matchesSqlStatementStart(trimmed)) {
    return true;
  }

  // Skip pipe-delimited strings (e.g. "col1|col2|col3") — not SQL
  // This check runs AFTER the fast path so that genuine SQL containing '|'
  // literals (e.g. HASHBYTES concatenation) is not rejected.
  if ((trimmed.match(/\|/g) || []).length >= 2 && !trimmed.includes('||')) {
    return false;
  }

  // Scoring path: count distinct SQL keywords
  if (trimmed.length < MIN_SQL_STRING_LENGTH) {
    return false;
  }

  const distinctKeywords = countDistinctKeywords(trimmed);
  return distinctKeywords >= minKeywords;
}

/**
 * Count the number of distinct SQL keywords in a string.
 * Returns 0 if no statement keyword (SELECT, INSERT, etc.) is present,
 * preventing false positives from common English words that happen to be
 * clause keywords (IS, NOT, ON, OR, IN, WITH, CHECK, etc.).
 */
function countDistinctKeywords(text: string): number {
  const seen = new Set<string>();
  let hasStatementKeyword = false;
  // Create regex locally to avoid shared mutable state
  const pattern = new RegExp(`\\b(?:${ALL_SQL_KEYWORDS.join('|')})\\b`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const kw = match[0].toUpperCase();
    seen.add(kw);
    if (SQL_STATEMENT_KEYWORDS_SET.has(kw)) {
      hasStatementKeyword = true;
    }
  }
  return hasStatementKeyword ? seen.size : 0;
}

/**
 * Statement keywords that reliably indicate SQL in scoring context.
 * WITH is excluded because it's a common English word; it's still detected
 * via fast path when the string starts with "WITH ..." (CTE).
 */
const SQL_STATEMENT_KEYWORDS_SET = new Set(
  SQL_STATEMENT_KEYWORDS
    .filter((k: string) => k !== 'WITH')
    .map((k: string) => k.toUpperCase())
);

/**
 * Find the SQL region at a specific document offset, if any.
 * Useful for checking if the cursor is inside a SQL string.
 */
export function findSqlRegionAtOffset(
  regions: SqlRegion[],
  offset: number
): SqlRegion | undefined {
  return regions.find(r => offset >= r.startOffset && offset < r.endOffset);
}
