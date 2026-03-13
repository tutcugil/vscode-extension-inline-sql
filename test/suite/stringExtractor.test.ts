import * as assert from 'assert';
import { extractStrings, replaceInterpolations } from '../../src/detection/stringExtractor';

describe('String Extractor', () => {
  describe('TypeScript/JavaScript', () => {
    it('should extract template literals', () => {
      const code = 'const q = `SELECT * FROM users`;';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
      assert.strictEqual(strings[0].type, 'template');
    });

    it('should extract double-quoted strings', () => {
      const code = 'const q = "SELECT * FROM users";';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
    });

    it('should extract single-quoted strings', () => {
      const code = "const q = 'SELECT * FROM users';";
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
    });

    it('should handle template literals with interpolations', () => {
      const code = 'const q = `SELECT * FROM users WHERE id = ${userId}`;';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
      assert.ok(strings[0].content.includes('${userId}'));
    });

    it('should skip single-line comments', () => {
      const code = '// const q = "not a string";\nconst q = "real string";';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'real string');
    });

    it('should skip multi-line comments', () => {
      const code = '/* "not a string" */ const q = "real string";';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'real string');
    });

    it('should handle escaped quotes', () => {
      const code = 'const q = "SELECT \\"name\\" FROM users";';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 1);
    });

    it('should extract multiple strings', () => {
      const code = 'const a = "first"; const b = "second";';
      const strings = extractStrings(code, 'typescript');
      assert.strictEqual(strings.length, 2);
    });
  });

  describe('Python', () => {
    it('should extract double-quoted strings', () => {
      const code = 'q = "SELECT * FROM users"';
      const strings = extractStrings(code, 'python');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
    });

    it('should extract triple-quoted strings', () => {
      const code = 'q = """SELECT * FROM users"""';
      const strings = extractStrings(code, 'python');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
    });

    it('should extract f-strings', () => {
      const code = 'q = f"SELECT * FROM users WHERE id = {user_id}"';
      const strings = extractStrings(code, 'python');
      assert.strictEqual(strings.length, 1);
      assert.ok(strings[0].content.includes('{user_id}'));
    });

    it('should skip comments', () => {
      const code = '# "not a string"\nq = "real string"';
      const strings = extractStrings(code, 'python');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'real string');
    });

    it('should handle multiline triple-quoted strings', () => {
      const code = 'q = """\n  SELECT *\n  FROM users\n"""';
      const strings = extractStrings(code, 'python');
      assert.strictEqual(strings.length, 1);
      assert.ok(strings[0].content.includes('SELECT'));
      assert.ok(strings[0].content.includes('FROM'));
    });
  });

  describe('Java', () => {
    it('should extract double-quoted strings', () => {
      const code = 'String q = "SELECT * FROM users";';
      const strings = extractStrings(code, 'java');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
    });

    it('should extract text blocks', () => {
      const code = 'String q = """\n    SELECT * FROM users\n    """;';
      const strings = extractStrings(code, 'java');
      assert.strictEqual(strings.length, 1);
      assert.ok(strings[0].content.includes('SELECT'));
      assert.strictEqual(strings[0].type, 'textblock');
    });

    it('should skip comments', () => {
      const code = '// "not a string"\nString q = "real string";';
      const strings = extractStrings(code, 'java');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'real string');
    });

    it('should skip char literals', () => {
      const code = "char c = 'x'; String q = \"real string\";";
      const strings = extractStrings(code, 'java');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'real string');
    });
  });

  describe('C#', () => {
    it('should extract regular strings', () => {
      const code = 'string q = "SELECT * FROM users";';
      const strings = extractStrings(code, 'csharp');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'SELECT * FROM users');
    });

    it('should extract verbatim strings', () => {
      const code = 'string q = @"SELECT * FROM users WHERE name = ""test""";';
      const strings = extractStrings(code, 'csharp');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].type, 'verbatim');
    });

    it('should extract interpolated strings', () => {
      const code = 'string q = $"SELECT * FROM users WHERE id = {userId}";';
      const strings = extractStrings(code, 'csharp');
      assert.strictEqual(strings.length, 1);
    });

    it('should extract interpolated verbatim strings ($@)', () => {
      const code = 'string q = $@"SELECT * FROM users WHERE id = {userId}";';
      const strings = extractStrings(code, 'csharp');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].type, 'verbatim');
    });

    it('should extract interpolated verbatim strings (@$)', () => {
      const code = 'string q = @$"SELECT * FROM users WHERE id = {userId}";';
      const strings = extractStrings(code, 'csharp');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].type, 'verbatim');
    });

    it('should skip comments', () => {
      const code = '// "not a string"\nstring q = "real string";';
      const strings = extractStrings(code, 'csharp');
      assert.strictEqual(strings.length, 1);
      assert.strictEqual(strings[0].content, 'real string');
    });
  });
});

describe('Replace Interpolations', () => {
  it('should replace JS template interpolations', () => {
    const result = replaceInterpolations('SELECT * FROM users WHERE id = ${userId}', 'typescript');
    assert.ok(!result.includes('${'));
    assert.ok(result.includes('__P__'));
  });

  it('should replace Python f-string interpolations', () => {
    const result = replaceInterpolations('SELECT * FROM users WHERE id = {user_id}', 'python');
    assert.ok(!result.includes('{user_id}'));
    assert.ok(result.includes('__P__'));
  });

  it('should preserve escaped braces in Python', () => {
    const result = replaceInterpolations('SELECT {{col}} FROM users WHERE id = {user_id}', 'python');
    assert.ok(result.includes('{col}'));
    assert.ok(result.includes('__P__'));
  });

  it('should replace C# interpolations', () => {
    const result = replaceInterpolations('SELECT * FROM users WHERE id = {userId}', 'csharp');
    assert.ok(!result.includes('{userId}'));
    assert.ok(result.includes('@__p__'));
  });

  it('should not modify Java strings', () => {
    const input = 'SELECT * FROM users WHERE id = ?';
    const result = replaceInterpolations(input, 'java');
    assert.strictEqual(result, input);
  });
});
