import { FormatOptionsWithLanguage, supportedDialects } from 'sql-formatter';

/** Formatting-only options; parameter substitution must never rewrite source values. */
export type SqlFormatOptions = Omit<FormatOptionsWithLanguage, 'params' | 'paramTypes'>;

const cases = ['preserve', 'upper', 'lower'];
const enums: Record<string, readonly string[]> = {
  language: supportedDialects,
  keywordCase: cases, identifierCase: cases, dataTypeCase: cases, functionCase: cases,
  indentStyle: ['standard', 'tabularLeft', 'tabularRight'],
  logicalOperatorNewline: ['before', 'after'],
};
const booleans = new Set(['useTabs', 'denseOperators', 'newlineBeforeSemicolon']);
const numbers: Record<string, [number, number]> = {
  tabWidth: [0, 16], expressionWidth: [1, 10000], linesBetweenQueries: [0, 100],
};

export function validateFormatOptions(value: unknown): SqlFormatOptions {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object.');
  }
  const options: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === '$schema') {
      if (typeof entry !== 'string') { throw new Error('$schema must be a string.'); }
      continue;
    }
    if (Object.hasOwn(enums, key)) {
      if (typeof entry !== 'string' || !enums[key].includes(entry)) {
        throw new Error(`${key} must be one of: ${enums[key].join(', ')}.`);
      }
    } else if (booleans.has(key)) {
      if (typeof entry !== 'boolean') { throw new Error(`${key} must be a boolean.`); }
    } else if (Object.hasOwn(numbers, key)) {
      const [minimum, maximum] = numbers[key];
      if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < minimum || entry > maximum) {
        throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
      }
    } else {
      throw new Error(`Unsupported option: ${key}. Only SQL formatting options are supported; params and paramTypes are not applied to source code.`);
    }
    options[key] = entry;
  }
  return options as SqlFormatOptions;
}
