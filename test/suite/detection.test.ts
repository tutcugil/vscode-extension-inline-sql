import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { detectSqlRegions, isSqlString } from '../../src/detection/sqlDetector';

describe('isSqlString', () => {
  describe('should detect SQL strings', () => {
    const sqlStrings = [
      'SELECT * FROM users',
      'SELECT id, name FROM users WHERE active = true',
      'INSERT INTO users (name, email) VALUES (?, ?)',
      'UPDATE users SET name = ? WHERE id = ?',
      'DELETE FROM sessions WHERE expires_at < NOW()',
      'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))',
      'ALTER TABLE users ADD COLUMN age INT',
      'DROP TABLE IF EXISTS temp_data',
      'WITH cte AS (SELECT * FROM users) SELECT * FROM cte',
      'MERGE INTO target USING source ON target.id = source.id',
      'select id, name from users where active = true', // lowercase
    ];

    for (const sql of sqlStrings) {
      it(`should detect: "${sql.substring(0, 50)}..."`, () => {
        assert.ok(isSqlString(sql), `Expected "${sql}" to be detected as SQL`);
      });
    }
  });

  describe('should NOT detect non-SQL strings', () => {
    const nonSqlStrings = [
      'Hello, World!',
      'Welcome to the application',
      'https://api.example.com/users',
      '',
      '   ',
      'Please select an option',
      '<div class="container"></div>',
      'The quick brown fox jumps over the lazy dog',
      'Error: connection refused',
      '12345',
    ];

    for (const str of nonSqlStrings) {
      it(`should NOT detect: "${str.substring(0, 50)}"`, () => {
        assert.ok(!isSqlString(str), `Expected "${str}" to NOT be detected as SQL`);
      });
    }
  });

  it('should handle empty string', () => {
    assert.ok(!isSqlString(''));
  });

  it('should handle whitespace-only string', () => {
    assert.ok(!isSqlString('   \n\t  '));
  });
});

describe('detectSqlRegions', () => {
  describe('TypeScript', () => {
    it('should detect SQL in template literals', () => {
      const code = 'const q = `SELECT id, name FROM users WHERE active = true`;';
      const regions = detectSqlRegions(code, 'typescript');
      assert.strictEqual(regions.length, 1);
      assert.ok(regions[0].sqlText.includes('SELECT'));
      assert.ok(regions[0].sqlText.includes('FROM'));
    });

    it('should detect SQL in double-quoted strings', () => {
      const code = 'const q = "SELECT id, name FROM users WHERE active = true";';
      const regions = detectSqlRegions(code, 'typescript');
      assert.strictEqual(regions.length, 1);
    });

    it('should not detect non-SQL strings', () => {
      const code = 'const msg = "Hello, World!"; const url = "https://example.com";';
      const regions = detectSqlRegions(code, 'typescript');
      assert.strictEqual(regions.length, 0);
    });

    it('should detect multiple SQL regions', () => {
      const code = `
        const q1 = "SELECT * FROM users";
        const q2 = "INSERT INTO logs (msg) VALUES ('test')";
      `;
      const regions = detectSqlRegions(code, 'typescript');
      assert.strictEqual(regions.length, 2);
    });

    it('should handle interpolated SQL', () => {
      const code = 'const q = `SELECT * FROM users WHERE id = ${userId}`;';
      const regions = detectSqlRegions(code, 'typescript');
      assert.strictEqual(regions.length, 1);
      assert.ok(regions[0].sqlText.includes('__P__'));
    });
  });

  describe('Python', () => {
    it('should detect SQL in regular strings', () => {
      const code = 'q = "SELECT id, name FROM users WHERE active = true"';
      const regions = detectSqlRegions(code, 'python');
      assert.strictEqual(regions.length, 1);
    });

    it('should detect SQL in triple-quoted strings', () => {
      const code = 'q = """\nSELECT id, name\nFROM users\nWHERE active = true\n"""';
      const regions = detectSqlRegions(code, 'python');
      assert.strictEqual(regions.length, 1);
    });

    it('should not detect non-SQL strings', () => {
      const code = 'msg = "Hello, World!"\nurl = "https://example.com"';
      const regions = detectSqlRegions(code, 'python');
      assert.strictEqual(regions.length, 0);
    });
  });

  describe('Java', () => {
    it('should detect SQL in strings', () => {
      const code = 'String q = "SELECT id, name FROM users WHERE active = true";';
      const regions = detectSqlRegions(code, 'java');
      assert.strictEqual(regions.length, 1);
    });

    it('should detect SQL in text blocks', () => {
      const code = 'String q = """\n    SELECT id, name\n    FROM users\n    WHERE active = true\n    """;';
      const regions = detectSqlRegions(code, 'java');
      assert.strictEqual(regions.length, 1);
    });
  });

  describe('C#', () => {
    it('should detect SQL in regular strings', () => {
      const code = 'string q = "SELECT id, name FROM users WHERE active = true";';
      const regions = detectSqlRegions(code, 'csharp');
      assert.strictEqual(regions.length, 1);
    });

    it('should detect SQL in verbatim strings', () => {
      const code = 'string q = @"SELECT id, name\nFROM users\nWHERE active = true";';
      const regions = detectSqlRegions(code, 'csharp');
      assert.strictEqual(regions.length, 1);
    });

    it('should detect SQL in interpolated strings', () => {
      const code = 'string q = $"SELECT * FROM users WHERE id = {userId}";';
      const regions = detectSqlRegions(code, 'csharp');
      assert.strictEqual(regions.length, 1);
    });
  });

  describe('Fixture files', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');

    it('should detect SQL regions in TypeScript fixture', () => {
      const code = fs.readFileSync(path.join(fixturesDir, 'sample.ts'), 'utf8');
      const regions = detectSqlRegions(code, 'typescript');
      // Should find: simpleQuery, multiLineQuery, insertQuery, updateQuery, deleteQuery, withCte
      assert.ok(regions.length >= 5, `Expected at least 5 SQL regions, got ${regions.length}`);
    });

    it('should detect SQL regions in Python fixture', () => {
      const code = fs.readFileSync(path.join(fixturesDir, 'sample.py'), 'utf8');
      const regions = detectSqlRegions(code, 'python');
      assert.ok(regions.length >= 3, `Expected at least 3 SQL regions, got ${regions.length}`);
    });

    it('should detect SQL regions in Java fixture', () => {
      const code = fs.readFileSync(path.join(fixturesDir, 'sample.java'), 'utf8');
      const regions = detectSqlRegions(code, 'java');
      assert.ok(regions.length >= 2, `Expected at least 2 SQL regions, got ${regions.length}`);
    });

    it('should detect SQL regions in C# fixture', () => {
      const code = fs.readFileSync(path.join(fixturesDir, 'sample.cs'), 'utf8');
      const regions = detectSqlRegions(code, 'csharp');
      assert.ok(regions.length >= 3, `Expected at least 3 SQL regions, got ${regions.length}`);
    });
  });
});
