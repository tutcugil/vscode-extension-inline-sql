import { StringLiteral } from '../types';

/** Find the end of a host expression, ignoring braces in quoted values/comments. */
export function interpolationEnd(text: string, start: number, width = 1, languageId = 'typescript'): number {
  const frames: Array<{ mode: string; depth: number; width: number }> = [{ mode: 'code', depth: 0, width }];
  for (let i = start; i < text.length; i++) {
    const frame = frames[frames.length - 1];
    const ch = text[i];
    if (frame.mode !== 'code') {
      if (ch === '\\') { i++; }
      else if (ch === frame.mode) { frames.pop(); }
      else if (frame.mode === '`' && text.startsWith('${', i)) {
        frames.push({ mode: 'code', depth: 0, width: 1 });
        i++;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      frames.push({ mode: ch, depth: 0, width: 0 });
    } else if (languageId !== 'python' && text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) { return -1; }
      i = end + 1;
    } else if ((languageId !== 'python' && text.startsWith('//', i)) || (languageId === 'python' && ch === '#')) {
      const end = text.indexOf('\n', i + 2);
      if (end < 0) { return -1; }
      i = end;
    } else if (ch === '{') {
      frame.depth++;
    } else if (ch === '}') {
      if (frame.depth === 0 && text.startsWith('}'.repeat(frame.width), i)) {
        i += frame.width - 1;
        frames.pop();
        if (frames.length === 0) { return i + 1; }
      } else { frame.depth--; }
    }
  }
  return -1;
}

/** Replaces only actual interpolations, preserving ordinary SQL braces verbatim. */
export function transformInterpolations(
  literal: StringLiteral, languageId: string, replace: (expression: string) => string,
): string {
  const width = literal.interpolationWidth ?? 0;
  if (!width) { return literal.content; }
  const js = /^(?:javascript|typescript)/.test(languageId);
  const open = js ? '${' : '{'.repeat(width);
  const text = literal.content;
  let result = '';
  for (let i = 0; i < text.length;) {
    if (js && text[i] === '\\') {
      result += text.slice(i, i + 2);
      i += 2;
    } else if (!js && literal.type !== 'raw' && (text.startsWith('{{', i) || text.startsWith('}}', i))) {
      result += text.slice(i, i + 2);
      i += 2;
    } else if (text.startsWith(open, i)) {
      const end = interpolationEnd(text, i + open.length, width, languageId);
      if (end < 0) { return result + text.slice(i); }
      result += replace(text.slice(i, end));
      i = end;
    } else {
      result += text[i++];
    }
  }
  return result;
}
