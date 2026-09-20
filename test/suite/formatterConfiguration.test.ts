import * as assert from 'assert';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import type * as VSCode from 'vscode';
import { detectSqlRegions } from '../../src/detection/sqlDetector';
import { validateFormatOptions } from '../../src/formatting/formatOptions';

class Uri {
  constructor(public path: string, public scheme = 'file', public authority = '') {}
  toString(): string { return `${this.scheme}://${this.authority}${this.path}`; }
  static joinPath(uri: Uri, ...parts: string[]): Uri {
    return new Uri(posix.join(uri.path, ...parts), uri.scheme, uri.authority);
  }
}
const requireModule = createRequire(__filename);
const loader = requireModule('node:module') as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
let settings: Record<string, unknown> = {};
let roots: Uri[] = [];
const files = new Map<string, string>();
const reads: string[] = [];
const warnings: string[] = [];
const edits: string[] = [];
let afterRead: (() => void) | undefined;
let readError: Error | undefined;
let source = '';
let document: ReturnType<typeof makeDocument>;
let editCalls = 0;
function makeDocument(uri = new Uri('/project/src/query.ts')) {
  return {
    uri, languageId: 'typescript', isUntitled: false, isClosed: false, version: 1,
    getText: () => source,
    offsetAt: () => source.indexOf('select'),
    positionAt: (offset: number) => ({ line: 0, character: offset }),
    lineAt: () => ({ text: source }),
  };
}
const vscode = {
  Uri,
  Range: class { constructor(public start: unknown, public end: unknown) {} },
  workspace: {
    getConfiguration: () => ({ get: (key: string, fallback: unknown) => settings[key] ?? fallback }),
    getWorkspaceFolder: (uri: Uri) => {
      const root = roots.filter(r => r.scheme === uri.scheme && r.authority === uri.authority && (uri.path === r.path || uri.path.startsWith(r.path + '/')))
        .sort((a, b) => b.path.length - a.path.length)[0];
      return root ? { uri: root } : undefined;
    },
    fs: {
      stat: async (uri: Uri) => {
        const text = files.get(uri.toString());
        if (text === undefined) { throw Object.assign(new Error('Not found'), { code: 'FileNotFound' }); }
        return { size: Buffer.byteLength(text) };
      },
      readFile: async (uri: Uri) => {
        if (readError) { throw readError; }
        reads.push(uri.toString());
        afterRead?.();
        return Buffer.from(files.get(uri.toString())!);
      },
    },
  },
  window: {
    get activeTextEditor() {
      return {
        document, selection: { active: {} },
        edit: async (callback: (builder: { replace: (range: unknown, text: string) => void }) => void) => {
          editCalls++;
          callback({ replace: (_range, text) => edits.push(text) });
          return true;
        },
      };
    },
    showWarningMessage: (message: string) => warnings.push(message),
    showInformationMessage() {},
  },
};
loader._load = (name, ...args) => {
  if (name === 'vscode') { return vscode; }
  // Isolate the provider from other test files' VS Code module doubles.
  if (name === '../configuration') { return { documentSqlRegions: () => detectSqlRegions(source, 'typescript') }; }
  return originalLoad(name, ...args);
};
let resolveFormatterOptions: typeof import('../../src/formatting/formatterConfiguration').resolveFormatterOptions;
let Provider: typeof import('../../src/formatting/sqlFormattingProvider').SqlFormattingProvider;
try {
  ({ resolveFormatterOptions } = requireModule('../../src/formatting/formatterConfiguration'));
  ({ SqlFormattingProvider: Provider } = requireModule('../../src/formatting/sqlFormattingProvider'));
} finally { loader._load = originalLoad; }
const resolve = () => resolveFormatterOptions(document as unknown as VSCode.TextDocument);
function config(path: string, text: string): void { files.set(new Uri(path).toString(), text); }

beforeEach(() => {
  settings = {}; roots = [new Uri('/project')]; files.clear(); reads.length = 0;
  warnings.length = 0; edits.length = 0; afterRead = undefined; readError = undefined; editCalls = 0;
  source = 'const a = `select id from users`; const b = `select name from accounts`;';
  document = makeDocument();
});

describe('Shared SQL formatter configuration', () => {
  it('falls back to resource settings when no config exists', async () => {
    settings = { 'formatting.dialect': 'postgresql', 'formatting.indent': 3, 'formatting.uppercase': false };
    assert.deepStrictEqual(await resolve(), { language: 'postgresql', tabWidth: 3, keywordCase: 'preserve' });
  });
  it('uses the nearest file and falls back per option without merging ancestor files', async () => {
    config('/project/.sql-formatter.json', '{"tabWidth":8,"keywordCase":"lower"}');
    config('/project/src/.sql-formatter.json', '{"tabWidth":2,"useTabs":true}');
    const options = await resolve();
    assert.strictEqual(options.tabWidth, 2);
    assert.strictEqual(options.keywordCase, 'upper');
    assert.strictEqual(options.useTabs, true);
    assert.strictEqual(reads.length, 1);
  });
  it('does not search above the owning workspace root or in another root', async () => {
    roots.push(new Uri('/other'));
    config('/.sql-formatter.json', '{"tabWidth":9}');
    config('/other/.sql-formatter.json', '{"tabWidth":8}');
    assert.strictEqual((await resolve()).tabWidth, 4);
    assert.strictEqual(reads.length, 0);
  });
  it('selects the owning folder in a multi-root workspace', async () => {
    roots.push(new Uri('/other'));
    document = makeDocument(new Uri('/other/query.ts'));
    config('/project/.sql-formatter.json', '{"tabWidth":9}');
    config('/other/.sql-formatter.json', '{"tabWidth":2}');
    assert.strictEqual((await resolve()).tabWidth, 2);
  });
  it('reads saved modifications and deletion on the next command', async () => {
    config('/project/.sql-formatter.json', '{"tabWidth":2}');
    assert.strictEqual((await resolve()).tabWidth, 2);
    config('/project/.sql-formatter.json', '{"tabWidth":3}');
    assert.strictEqual((await resolve()).tabWidth, 3);
    files.clear();
    assert.strictEqual((await resolve()).tabWidth, 4);
  });
  it('uses the VS Code filesystem for remote workspaces', async () => {
    roots = [new Uri('/project', 'vscode-remote', 'ssh-remote+host')];
    document = makeDocument(new Uri('/project/query.ts', 'vscode-remote', 'ssh-remote+host'));
    files.set('vscode-remote://ssh-remote+host/project/.sql-formatter.json', '{"language":"postgresql"}');
    assert.strictEqual((await resolve()).language, 'postgresql');
  });
  it('uses settings for untitled files and documents outside a workspace', async () => {
    config('/project/.sql-formatter.json', '{"tabWidth":2}');
    document.isUntitled = true;
    assert.strictEqual((await resolve()).tabWidth, 4);
    document = makeDocument(new Uri('/outside/query.ts'));
    assert.strictEqual((await resolve()).tabWidth, 4);
    assert.strictEqual(reads.length, 0);
  });
  it('accepts a BOM and ignores schema metadata', async () => {
    config('/project/.sql-formatter.json', '\uFEFF{"$schema":"https://example.com/schema.json","keywordCase":"lower"}');
    assert.strictEqual((await resolve()).keywordCase, 'lower');
  });
  it('reports invalid JSON, values and read failures without falling back silently', async () => {
    for (const json of ['{', 'null', '[]', '{"tabWidth":"2"}', '{"language":"invalid"}', '{"tabWidth":1000000000}']) {
      config('/project/.sql-formatter.json', json);
      await assert.rejects(resolve, /\.sql-formatter\.json/);
    }
    config('/project/.sql-formatter.json', '{}');
    readError = new Error('Permission denied');
    await assert.rejects(resolve, /Permission denied/);
  });
  it('rejects oversized configurations before reading them', async () => {
    config('/project/.sql-formatter.json', ' '.repeat(65537));
    await assert.rejects(resolve, /64 KiB/);
    assert.strictEqual(reads.length, 0);
  });
  it('rejects unsupported and prototype-related keys', () => {
    for (const key of ['params', 'paramTypes', '__proto__', 'constructor', 'unknown']) {
      assert.throws(() => validateFormatOptions(JSON.parse(`{"${key}":{}}`)), /Unsupported option/);
    }
  });
});

describe('Formatting command configuration integration', () => {
  it('applies the file configuration to the SQL at the cursor', async () => {
    config('/project/.sql-formatter.json', '{"keywordCase":"lower","useTabs":true}');
    await new Provider().formatSqlAtCursor();
    assert.strictEqual(edits.length, 1);
    assert.ok(edits[0].startsWith('select'));
    assert.ok(edits[0].includes('\t'));
  });
  it('loads configuration once for formatting all SQL regions', async () => {
    config('/project/.sql-formatter.json', '{"keywordCase":"lower"}');
    await new Provider().formatAllSqlInDocument();
    assert.strictEqual(reads.length, 1);
    assert.strictEqual(edits.length, 2);
    assert.ok(edits.every(text => text.startsWith('select')));
  });
  it('does not edit either command target when configuration is invalid', async () => {
    config('/project/.sql-formatter.json', '{"keywordCase":"invalid"}');
    const provider = new Provider();
    await provider.formatSqlAtCursor();
    await provider.formatAllSqlInDocument();
    assert.strictEqual(editCalls, 0);
    assert.strictEqual(warnings.length, 2);
  });
  it('does not apply stale ranges if the document changes during the config read', async () => {
    config('/project/.sql-formatter.json', '{}');
    afterRead = () => { document.version++; };
    const provider = new Provider();
    await provider.formatSqlAtCursor();
    await provider.formatAllSqlInDocument();
    assert.strictEqual(editCalls, 0);
  });
});
