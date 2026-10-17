// Minimal JavaScript scanner used by the architecture check: it separates code from comments and the contents of
// strings, templates and regex literals, so rules never produce false positives from text inside strings or comments.
//
// scan(src) -> { code, text, imports }
//   code    : same length as src; comments and the CONTENT of strings, templates and regex literals are blanked with
//             spaces (newlines are kept, so line numbers match).
//   text    : like `code` but string contents are kept (only comments are blanked); used for rules that look INSIDE
//             strings on purpose (e.g. "<style>" injected from a view).
//   imports : [{ spec, line, dynamic }] for `import ... from 'x'`, `export ... from 'x'`, `import 'x'` and `import('x')`.

const REGEX_PREV = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
]);
const REGEX_KW = /(?:^|[^\w$.])(return|typeof|case|do|else|in|of|void|delete|throw|yield|await|new)$/;
const IMPORT_BEFORE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)$/;

export function scan(src) {
  const code = src.split('');
  const text = src.split('');
  const imports = [];
  const n = src.length;
  const keepEol = (ch) => ch === '\n' || ch === '\r';
  const blankComment = (a, b) => {
    for (let k = a; k < b; k++)
      if (!keepEol(src[k])) {
        code[k] = ' ';
        text[k] = ' ';
      }
  };
  const blankString = (a, b) => {
    for (let k = a; k < b; k++) if (!keepEol(src[k])) code[k] = ' ';
  };
  const stack = []; // brace depth saved when entering a ${ ... } inside a template literal
  let i = 0,
    braces = 0,
    last = '',
    line = 1,
    lineAt = 0;
  const lineOf = (pos) => {
    while (lineAt < pos) {
      if (src[lineAt] === '\n') line++;
      lineAt++;
    }
    return line;
  };

  const readString = (q, start) => {
    let k = start + 1;
    while (k < n && src[k] !== q && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1;
    return k + 1;
  };
  // Reads template text from `start`; returns the index after the closing backtick or after `${`.
  const readTemplate = (start) => {
    let k = start;
    while (k < n) {
      if (src[k] === '\\') {
        k += 2;
        continue;
      }
      if (src[k] === '`') return { end: k + 1, expr: false };
      if (src[k] === '$' && src[k + 1] === '{') return { end: k + 2, expr: true };
      k++;
    }
    return { end: n, expr: false };
  };
  const readRegex = (start) => {
    let j = start + 1,
      inClass = false;
    while (j < n && src[j] !== '\n') {
      if (src[j] === '\\') {
        j += 2;
        continue;
      }
      if (src[j] === '[') inClass = true;
      else if (src[j] === ']') inClass = false;
      else if (src[j] === '/' && !inClass) break;
      j++;
    }
    return j;
  };

  while (i < n) {
    const c = src[i],
      d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      blankComment(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j < 0 ? n : j + 2;
      blankComment(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const j = readString(c, i);
      const m = IMPORT_BEFORE.exec(code.slice(Math.max(0, i - 40), i).join(''));
      if (m)
        imports.push({
          spec: src.slice(i + 1, j - 1),
          start: i + 1,
          end: j - 1,
          line: lineOf(i),
          dynamic: /\(\s*$/.test(m[0]),
        });
      blankString(i + 1, j - 1);
      i = j;
      last = c;
      continue;
    }
    if (c === '`') {
      const r = readTemplate(i + 1);
      blankString(i + 1, r.expr ? r.end - 2 : r.end - 1);
      if (r.expr) {
        stack.push(braces);
        braces = 0;
        last = '{';
      } else last = '`';
      i = r.end;
      continue;
    }
    if (c === '{') {
      braces++;
      last = c;
      i++;
      continue;
    }
    if (c === '}') {
      if (braces === 0 && stack.length) {
        // end of ${ ... }: back into the template text
        const r = readTemplate(i + 1);
        blankString(i + 1, r.expr ? r.end - 2 : r.end - 1);
        if (r.expr) {
          braces = 0;
          last = '{';
        } else {
          braces = stack.pop();
          last = '`';
        }
        i = r.end;
        continue;
      }
      braces--;
      last = c;
      i++;
      continue;
    }
    if (
      c === '/' &&
      (REGEX_PREV.has(last) || last === '' || REGEX_KW.test(src.slice(Math.max(0, i - 12), i).trimEnd()))
    ) {
      const j = readRegex(i);
      blankString(i + 1, j);
      i = j + 1;
      last = '/';
      continue;
    }
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return { code: code.join(''), text: text.join(''), imports };
}
