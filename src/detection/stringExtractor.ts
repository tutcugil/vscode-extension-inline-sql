import { StringLiteral } from '../types';

/**
 * Extract all string literals from a document based on the host language.
 * Returns the content boundaries (inside delimiters) for each string found.
 */
export function extractStrings(text: string, languageId: string): StringLiteral[] {
  switch (languageId) {
    case 'typescript':
    case 'javascript':
    case 'typescriptreact':
    case 'javascriptreact':
      return extractJavaScriptStrings(text);
    case 'python':
      return extractPythonStrings(text);
    case 'java':
      return extractJavaStrings(text);
    case 'csharp':
      return extractCSharpStrings(text);
    default:
      return [];
  }
}

/**
 * Replace interpolation expressions with a SQL-safe placeholder.
 * Returns the cleaned SQL text.
 */
export function replaceInterpolations(content: string, languageId: string): string {
  switch (languageId) {
    case 'typescript':
    case 'javascript':
    case 'typescriptreact':
    case 'javascriptreact':
      // Replace ${...} with placeholder, handling nested braces
      return replaceNestedBraces(content, '${', '}', '__P__');
    case 'python':
      // Replace {expr} in f-strings (but not {{ escaped braces }})
      return content
        .replace(/\{\{/g, '__LBRACE__')
        .replace(/\}\}/g, '__RBRACE__')
        .replace(/\{[^}]*\}/g, '__P__')
        .replace(/__LBRACE__/g, '{')
        .replace(/__RBRACE__/g, '}');
    case 'csharp':
      // Replace {expr} in interpolated strings
      return content
        .replace(/\{\{/g, '__LBRACE__')
        .replace(/\}\}/g, '__RBRACE__')
        .replace(/\{[^}]*\}/g, '__P__')
        .replace(/__LBRACE__/g, '{')
        .replace(/__RBRACE__/g, '}');
    case 'java':
      // Java doesn't have string interpolation (text blocks are plain)
      return content;
    default:
      return content;
  }
}

function replaceNestedBraces(text: string, open: string, close: string, placeholder: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(open, i);
    if (idx === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, idx);
    // Find matching close brace, accounting for nesting
    let depth = 1;
    let j = idx + open.length;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') { depth++; }
      else if (text[j] === '}') { depth--; }
      j++;
    }
    result += placeholder;
    i = j;
  }
  return result;
}

// ─── JavaScript / TypeScript ───────────────────────────────────────────

function extractJavaScriptStrings(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  let i = 0;
  while (i < text.length) {
    // Skip single-line comments
    if (text[i] === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i === -1) { break; }
      i++;
      continue;
    }
    // Skip multi-line comments
    if (text[i] === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) { break; }
      i += 2;
      continue;
    }
    // Skip regex literals (basic heuristic)
    if (text[i] === '/' && isRegexContext(text, i)) {
      i++;
      while (i < text.length && text[i] !== '/') {
        if (text[i] === '\\') { i++; }
        i++;
      }
      i++; // skip closing /
      continue;
    }
    // Template literal
    if (text[i] === '`') {
      const start = i + 1;
      i++;
      while (i < text.length && text[i] !== '`') {
        if (text[i] === '\\') { i++; }
        else if (text[i] === '$' && text[i + 1] === '{') {
          // Skip interpolation
          let depth = 1;
          i += 2;
          while (i < text.length && depth > 0) {
            if (text[i] === '{') { depth++; }
            else if (text[i] === '}') { depth--; }
            else if (text[i] === '`') {
              // Nested template literal inside interpolation — skip it
              i++;
              while (i < text.length && text[i] !== '`') {
                if (text[i] === '\\') { i++; }
                i++;
              }
            }
            i++;
          }
          continue;
        }
        i++;
      }
      if (i < text.length) {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: 'template',
        });
        i++; // skip closing backtick
      }
      continue;
    }
    // Single or double quoted string
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      const start = i + 1;
      i++;
      while (i < text.length && text[i] !== quote && text[i] !== '\n') {
        if (text[i] === '\\') { i++; }
        i++;
      }
      if (i < text.length && text[i] === quote) {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: quote === '"' ? 'double' : 'single',
        });
        i++;
      }
      continue;
    }
    i++;
  }
  return literals;
}

function isRegexContext(text: string, pos: number): boolean {
  // Simple heuristic: if preceded by =, (, [, !, &, |, ^, ~, ,, ;, :, {, }
  // or start of line, it's likely a regex
  let j = pos - 1;
  while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) { j--; }
  if (j < 0) { return true; }
  return /[=([!&|^~,;:{}?+\-*%<>]/.test(text[j]);
}

// ─── Python ────────────────────────────────────────────────────────────

function extractPythonStrings(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  let i = 0;
  while (i < text.length) {
    // Skip comments
    if (text[i] === '#') {
      i = text.indexOf('\n', i);
      if (i === -1) { break; }
      i++;
      continue;
    }
    // Skip f/r/b/u prefix
    let prefix = '';
    if (/[fFrRbBuU]/.test(text[i]) && (text[i + 1] === '"' || text[i + 1] === "'")) {
      prefix = text[i];
      i++;
    } else if (
      /[fFrRbBuU]/.test(text[i]) && /[fFrRbBuU]/.test(text[i + 1]) &&
      (text[i + 2] === '"' || text[i + 2] === "'")
    ) {
      prefix = text.slice(i, i + 2);
      i += 2;
    }

    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      // Triple quote
      if (text[i + 1] === quote && text[i + 2] === quote) {
        const tripleQuote = quote.repeat(3);
        const start = i + 3;
        i += 3;
        const endIdx = text.indexOf(tripleQuote, i);
        if (endIdx !== -1) {
          literals.push({
            contentStart: start,
            contentEnd: endIdx,
            content: text.slice(start, endIdx),
            type: 'triple',
          });
          i = endIdx + 3;
        } else {
          i = text.length;
        }
        continue;
      }
      // Single-line string
      const start = i + 1;
      i++;
      while (i < text.length && text[i] !== quote && text[i] !== '\n') {
        if (text[i] === '\\') { i++; }
        i++;
      }
      if (i < text.length && text[i] === quote) {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: quote === '"' ? 'double' : 'single',
        });
        i++;
      }
      continue;
    }

    // Consume unused prefix character if no string followed
    if (prefix) { continue; }
    i++;
  }
  return literals;
}

// ─── Java ──────────────────────────────────────────────────────────────

function extractJavaStrings(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  let i = 0;
  while (i < text.length) {
    // Skip single-line comments
    if (text[i] === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i === -1) { break; }
      i++;
      continue;
    }
    // Skip multi-line comments
    if (text[i] === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) { break; }
      i += 2;
      continue;
    }
    // Skip char literals
    if (text[i] === "'") {
      i++;
      if (i < text.length && text[i] === '\\') { i++; }
      i++;
      if (i < text.length && text[i] === "'") { i++; }
      continue;
    }
    // Text block (Java 13+)
    if (text[i] === '"' && text[i + 1] === '"' && text[i + 2] === '"') {
      i += 3;
      // Skip whitespace until newline
      while (i < text.length && text[i] !== '\n') { i++; }
      if (i < text.length) { i++; } // skip newline
      const start = i;
      const endIdx = text.indexOf('"""', i);
      if (endIdx !== -1) {
        literals.push({
          contentStart: start,
          contentEnd: endIdx,
          content: text.slice(start, endIdx),
          type: 'textblock',
        });
        i = endIdx + 3;
      } else {
        i = text.length;
      }
      continue;
    }
    // Regular string
    if (text[i] === '"') {
      const start = i + 1;
      i++;
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') {
        if (text[i] === '\\') { i++; }
        i++;
      }
      if (i < text.length && text[i] === '"') {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: 'double',
        });
        i++;
      }
      continue;
    }
    i++;
  }
  return literals;
}

// ─── C# ────────────────────────────────────────────────────────────────

function extractCSharpStrings(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  let i = 0;
  while (i < text.length) {
    // Skip single-line comments
    if (text[i] === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i === -1) { break; }
      i++;
      continue;
    }
    // Skip multi-line comments
    if (text[i] === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) { break; }
      i += 2;
      continue;
    }
    // Skip char literals
    if (text[i] === "'") {
      i++;
      if (i < text.length && text[i] === '\\') { i++; }
      i++;
      if (i < text.length && text[i] === "'") { i++; }
      continue;
    }

    // Raw string literal (C# 11): """ or $""" or $$"""
    let dollarCount = 0;
    let peekI = i;
    while (peekI < text.length && text[peekI] === '$') {
      dollarCount++;
      peekI++;
    }
    if (text[peekI] === '"' && text[peekI + 1] === '"' && text[peekI + 2] === '"') {
      peekI += 3;
      // Skip to end of line for the opening
      while (peekI < text.length && text[peekI] !== '\n') { peekI++; }
      if (peekI < text.length) { peekI++; }
      const start = peekI;
      const endIdx = text.indexOf('"""', peekI);
      if (endIdx !== -1) {
        literals.push({
          contentStart: start,
          contentEnd: endIdx,
          content: text.slice(start, endIdx),
          type: 'raw',
        });
        i = endIdx + 3;
      } else {
        i = text.length;
      }
      continue;
    }

    // Interpolated verbatim: $@" or @$"
    if (
      (text[i] === '$' && text[i + 1] === '@' && text[i + 2] === '"') ||
      (text[i] === '@' && text[i + 1] === '$' && text[i + 2] === '"')
    ) {
      i += 3;
      const start = i;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          i += 2; // escaped quote in verbatim
          continue;
        }
        if (text[i] === '"') { break; }
        i++;
      }
      if (i < text.length) {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: 'verbatim',
        });
        i++;
      }
      continue;
    }

    // Verbatim string: @"
    if (text[i] === '@' && text[i + 1] === '"') {
      i += 2;
      const start = i;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          i += 2; // escaped quote
          continue;
        }
        if (text[i] === '"') { break; }
        i++;
      }
      if (i < text.length) {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: 'verbatim',
        });
        i++;
      }
      continue;
    }

    // Interpolated string: $"
    if (text[i] === '$' && text[i + 1] === '"') {
      i += 2;
      const start = i;
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') {
        if (text[i] === '\\') { i++; }
        else if (text[i] === '{' && text[i + 1] !== '{') {
          // Skip interpolation
          let depth = 1;
          i++;
          while (i < text.length && depth > 0) {
            if (text[i] === '{') { depth++; }
            else if (text[i] === '}') { depth--; }
            i++;
          }
          continue;
        }
        i++;
      }
      if (i < text.length && text[i] === '"') {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: 'double',
        });
        i++;
      }
      continue;
    }

    // Regular string: "
    if (text[i] === '"') {
      const start = i + 1;
      i++;
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') {
        if (text[i] === '\\') { i++; }
        i++;
      }
      if (i < text.length && text[i] === '"') {
        literals.push({
          contentStart: start,
          contentEnd: i,
          content: text.slice(start, i),
          type: 'double',
        });
        i++;
      }
      continue;
    }
    i++;
  }
  return literals;
}
