import { format } from 'sql-formatter';
import { StringLiteral } from '../types';
import { transformInterpolations } from '../detection/interpolations';
import { SqlFormatOptions } from './formatOptions';

export function formatLiteral(
  literal: StringLiteral, languageId: string,
  options: SqlFormatOptions, baseIndent = '',
): string {
  const indent = options.tabWidth ?? 4;
  // Escapes require a complete host-language decoder; never rewrite their semantics.
  if (literal.content.includes('\\') || (literal.type === 'verbatim' && literal.content.includes('""'))) {
    throw new Error('Strings containing host-language escapes are left unchanged.');
  }
  let prefix = '__INLINE_SQL_EXPR_';
  while (literal.content.toUpperCase().includes(prefix)) { prefix += '_'; }
  const expressions: string[] = [];
  const sql = transformInterpolations(literal, languageId, expression => {
    expressions.push(expression);
    return `${prefix}${expressions.length - 1}__`;
  });
  // Host indentation must not become part of a multiline SQL value/identifier.
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2);
      i = end < 0 ? sql.length : end;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 1;
    } else if (sql[i] === "'" || sql[i] === '"' || sql[i] === '`' || sql[i] === '[') {
      const quote = sql[i] === '[' ? ']' : sql[i];
      for (i++; i < sql.length; i++) {
        if (sql[i] === '\n') { throw new Error('Multiline SQL values are left unchanged.'); }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i++; } else { break; }
        }
      }
    } else if (sql[i] === '$') {
      const delimiter = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, i + delimiter.length);
        if (end >= 0) {
          if (sql.slice(i, end).includes('\n')) { throw new Error('Multiline SQL values are left unchanged.'); }
          i = end + delimiter.length - 1;
        }
      }
    }
  }
  let formatted = format(sql, options);
  const multiline = !['single', 'double'].includes(literal.type);
  const singleLineRaw = literal.type === 'raw' && !literal.content.includes('\n');
  if ((literal.raw && !multiline) || singleLineRaw) {
    // In raw strings, an escaped newline would become literal backslash+n.
    throw new Error('Single-line raw strings are left unchanged.');
  }
  if (multiline) {
    // Preserve SQL's own indentation and the host's opening/closing line layout.
    const leading = literal.content.match(/^\s*\r?\n/)?.[0] ?? '';
    const trailing = literal.content.match(/\r?\n[\t ]*$/)?.[0] ?? '';
    const closingIndent = trailing.match(/[\t ]*$/)?.[0] ?? '';
    const contentIndent = (literal.type === 'raw' ? closingIndent : baseIndent) + (options.useTabs ? '\t' : ' '.repeat(indent));
    formatted = formatted.split('\n').map((line, index) =>
      index === 0 && !leading ? line : contentIndent + line
    ).join('\n');
    formatted = leading + formatted + trailing;
  } else {
    formatted = formatted.replace(/\r?\n/g, '\\n');
  }
  // Restore AFTER newline escaping/indentation so expressions remain byte-for-byte intact.
  return formatted.replace(new RegExp(`${prefix}(\\d+)__`, 'gi'), (_match, index: string) => expressions[Number(index)]);
}
