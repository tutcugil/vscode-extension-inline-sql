import * as assert from 'assert';
import { createRequire } from 'node:module';
import type * as VSCode from 'vscode';

const requireModule = createRequire(__filename);
const loader = requireModule('node:module') as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
let settings: Record<string, unknown> = {};
const vscode = {
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => settings[key] ?? fallback }) },
  CompletionItemKind: { Keyword: 1, Function: 2, TypeParameter: 3, Struct: 4, Field: 5 },
  CompletionItem: class { constructor(public label: string, public kind: number) {} },
  SnippetString: class { constructor(public value: string) {} },
};
loader._load = (name, ...args) => name === 'vscode' ? vscode : originalLoad(name, ...args);
let completion: typeof import('../../src/completion/sqlCompletionProvider');
try { completion = requireModule('../../src/completion/sqlCompletionProvider'); }
finally { loader._load = originalLoad; }

describe('SQL completion and configuration', () => {
  beforeEach(() => { settings = {}; });

  it('recognizes column clauses after trimming spaces without matching identifier suffixes', () => {
    assert.strictEqual(completion.getCompletionContext('SELECT id FROM users WHERE '), 'column');
    assert.strictEqual(completion.getCompletionContext('SELECT * FROM '), 'table');
    assert.strictEqual(completion.getCompletionContext('SELECT platform'), 'general');
  });

  it('completes at the end of SQL content and refreshes schemas on demand', async () => {
    const source = 'const q = "SELECT * FROM users WHERE ";';
    const document = { languageId: 'typescript', getText: () => source, offsetAt: () => source.lastIndexOf('"') } as unknown as VSCode.TextDocument;
    let calls = 0;
    const provider = new completion.SqlCompletionProvider(async () => {
      calls++;
      return { tables: [{ name: 'users', columns: [{ name: 'id', dataType: 'int', nullable: false }] }], lastUpdated: Date.now() };
    });
    const items = await provider.provideCompletionItems(document, {} as VSCode.Position, { isCancellationRequested: false } as VSCode.CancellationToken, {} as VSCode.CompletionContext);
    assert.ok(items?.some(item => item.label === 'id'));
    assert.strictEqual(calls, 1);
    settings.languages = ['python'];
    assert.strictEqual(await provider.provideCompletionItems(document, {} as VSCode.Position, {} as VSCode.CancellationToken, {} as VSCode.CompletionContext), undefined);
    assert.strictEqual(calls, 1);
  });
});
