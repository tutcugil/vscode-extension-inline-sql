import * as assert from 'assert';
import * as ts from 'typescript';
import { extractStrings } from '../../src/detection/stringExtractor';
import { detectSqlRegions } from '../../src/detection/sqlDetector';
import { formatLiteral } from '../../src/formatting/formatLiteral';

const options = { tabWidth: 2, keywordCase: 'upper', language: 'sql' } as const;

describe('Safe SQL formatting', () => {
  it('preserves host expressions including quoted braces', () => {
    const source = 'const q = `select id from users where id = ${lookup({ value: "}" })} and name = ${name}`;';
    const literal = extractStrings(source, 'typescript')[0];
    const result = formatLiteral(literal, 'typescript', options);
    assert.ok(result.includes('${lookup({ value: "}" })}'));
    assert.ok(result.includes('${name}'));
    assert.ok(!result.includes('__INLINE_SQL_EXPR_'));
    const output = ts.transpileModule('const q = `' + result + '`;', { reportDiagnostics: true });
    assert.deepStrictEqual(output.diagnostics, []);
  });

  it('writes valid quoted JavaScript with escaped line breaks', () => {
    const literal = extractStrings('const q = "select id from users where id = 1";', 'typescript')[0];
    const result = formatLiteral(literal, 'typescript', options);
    assert.ok(result.includes('\\n'));
    assert.ok(!result.includes('\n'));
    const source = 'const q = "' + result + '";';
    assert.deepStrictEqual(ts.transpileModule(source, { reportDiagnostics: true }).diagnostics, []);
    assert.ok(JSON.parse('"' + result + '"').includes('\n'));
  });

  it('preserves C# and Python interpolation', () => {
    for (const [lang, source] of [['csharp', 'var q = $"select id from users where id = {id}";'], ['python', 'q = f"select id from users where id = {id}"']]) {
      const result = formatLiteral(extractStrings(source, lang)[0], lang, options);
      assert.ok(result.includes('{id}'));
      assert.ok(!result.includes('@__p__'));
    }
  });

  it('preserves the closing delimiter line of multiline raw strings', () => {
    const literal = extractStrings('var q = """\n    select id from users\n    """;', 'csharp')[0];
    const result = formatLiteral(literal, 'csharp', options, '  ');
    assert.ok(result.startsWith('\n'));
    assert.ok(result.endsWith('\n    '));
  });

  it('leaves escaped and single-line raw strings untouched instead of corrupting them', () => {
    for (const [lang, source] of [['typescript', 'const q = "select id\\nfrom users";'], ['python', 'q = r"select id from users"'], ['csharp', 'var q = """select id from users""";']]) {
      assert.throws(() => formatLiteral(extractStrings(source, lang)[0], lang, options));
    }
  });

  it('does not normalize JSON braces in non-interpolated strings', () => {
    for (const [lang, source] of [['python', 'q = "SELECT \'{value}\' FROM users"'], ['csharp', 'var q = "SELECT \'{value}\' FROM users";'], ['typescript', 'const q = "SELECT \'${value}\' FROM users";']]) {
      const region = detectSqlRegions(source, lang)[0];
      assert.ok(region.sqlText.includes('{value}'));
      assert.ok(formatLiteral(region.literal!, lang, options).includes('{value}'));
    }
  });

  it('preserves double-dollar raw interpolation and literal single braces', () => {
    const literal = extractStrings('var q = $$"""\nSELECT \'{json}\' FROM users WHERE id = {{id}}\n""";', 'csharp')[0];
    const result = formatLiteral(literal, 'csharp', options);
    assert.ok(result.includes('{{id}}'));
    assert.ok(result.includes('{json}'));
  });

  it('does not insert indentation inside multiline SQL values', () => {
    const literal = extractStrings('const q = `SELECT \'first\nsecond\' FROM users`;', 'typescript')[0];
    assert.throws(() => formatLiteral(literal, 'typescript', options), /Multiline SQL values/);
  });

  it('respects the minimum indentation required by a C# raw closing delimiter', () => {
    const literal = extractStrings('var q = """\n        SELECT id FROM users\n        """;', 'csharp')[0];
    const result = formatLiteral(literal, 'csharp', options);
    assert.ok(result.split('\n').slice(1, -1).every(line => line.startsWith('        ')));
  });

  it('applies shared formatter options and restores expressions after identifier casing', () => {
    const literal = extractStrings('const q = `SELECT SomeColumn FROM users WHERE id = ${userId}`;', 'typescript')[0];
    const result = formatLiteral(literal, 'typescript', { ...options, keywordCase: 'lower', identifierCase: 'lower', useTabs: true });
    assert.ok(result.startsWith('select'));
    assert.ok(result.includes('\t'));
    assert.ok(result.includes('somecolumn'));
    assert.ok(result.includes('${userId}'));
    assert.ok(!result.toLowerCase().includes('__inline_sql_expr_'));
  });
});
