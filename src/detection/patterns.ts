/** SQL keywords that typically start a SQL statement */
export const SQL_STATEMENT_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE',
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE',
  'WITH', 'MERGE', 'EXEC', 'EXECUTE', 'CALL',
  'GRANT', 'REVOKE', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'DECLARE', 'SET',
] as const;

/** SQL keywords that appear inside statements (clauses, operators, etc.) */
export const SQL_CLAUSE_KEYWORDS = [
  'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS',
  'NULL', 'AS', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'ALL', 'INTERSECT', 'EXCEPT', 'DISTINCT',
  'INTO', 'VALUES', 'SET', 'RETURNING',
  'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'TOP', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
  'TABLE', 'INDEX', 'VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT',
  'DEFAULT', 'CHECK', 'UNIQUE', 'CASCADE',
] as const;

/** All SQL keywords combined for scoring */
export const ALL_SQL_KEYWORDS = [
  ...SQL_STATEMENT_KEYWORDS,
  ...SQL_CLAUSE_KEYWORDS,
] as const;

/**
 * Check if text starts with a SQL statement keyword (after optional whitespace/comments).
 * Uses iterative stripping instead of nested regex quantifiers to avoid ReDoS.
 */
export function matchesSqlStatementStart(text: string): boolean {
  let s = text;
  // Strip leading whitespace and -- comments iteratively
  while (true) {
    s = s.replace(/^\s+/, '');
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      if (nl === -1) { return false; }
      s = s.slice(nl + 1);
    } else {
      break;
    }
  }
  return SQL_STATEMENT_START_SIMPLE.test(s);
}

const SQL_STATEMENT_START_SIMPLE = new RegExp(
  `^(?:${SQL_STATEMENT_KEYWORDS.join('|')})\\b`,
  'i'
);

/**
 * Build a regex that matches any of the given keywords as whole words.
 */
export function buildKeywordPattern(keywords: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${keywords.join('|')})\\b`, 'gi');
}

/** Pattern to find all SQL keywords (for scoring) */
export const ALL_KEYWORDS_PATTERN = buildKeywordPattern(ALL_SQL_KEYWORDS);

/** Minimum string length to consider for SQL detection via scoring */
export const MIN_SQL_STRING_LENGTH = 20;
