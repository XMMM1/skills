#!/usr/bin/env node
// okf-check: checks a directory against Open Knowledge Format v0.2
// (references/SPEC.md in this skill).
//
// Runs on Node >= 16 with no dependencies: an installed skill is copied without
// node_modules, and the host project's packages cannot be resolved from here.
// That is why YAML is read by the strict subset parser below, which throws on
// anything it does not understand instead of guessing.

import fs from 'node:fs';
import path from 'node:path';

const SPEC_VERSION = '0.2';

const HELP = `usage: node okf-check.mjs [--strict] <bundle-dir>

Checks <bundle-dir> against Open Knowledge Format v${SPEC_VERSION}.

Errors (the bundle is not conformant, SPEC section 11):
  - a .md file other than index.md / log.md without YAML frontmatter
  - frontmatter that is not valid YAML, or uses YAML outside the subset below
  - frontmatter without a non-empty \`type\`
  - an index.md with frontmatter (the bundle-root one may carry only
    okf_version), without a heading, or with entries above its first heading
  - a log.md whose "##" headings are not YYYY-MM-DD dates, newest first,
    or with an entry above its first date heading

Warnings (the spec's SHOULDs; --strict makes them fail too):
  - provenance, trust and lifecycle fields that do not follow SPEC sections 5-10
  - links to files that do not exist, index.md entries without a description,
    and concepts or subdirectories that an index.md does not list

YAML subset (what okf-check can read):
  block mappings and sequences (including "- key: value" items), flow [ ] and
  { } collections, plain, 'single' and "double" quoted scalars (multi-line too),
  | and > block scalars, and # comments. Plain scalars resolve per the YAML 1.2
  core schema. Unsupported: anchors (&), aliases (*), tags (!), complex keys
  (?), empty keys, document markers, a tab after "-", and, inside [ ] or { },
  key: value pairs in a list, collections used as keys, plain scalars spanning
  lines and continuation lines that are not indented. A file using any of them
  fails as "unsupported", because okf-check cannot verify it. okf-check never
  passes a file it could not read.

Exit status: 0 conformant, 1 not conformant, 2 usage error.`;

const YAML_NOTE =
  'YAML: read by okf-check\'s built-in subset parser. Anchors, aliases, tags, complex keys and document markers fail the file as unsupported; they are never passed unread (--help lists the subset).';

// ------------------------------------------------------------------ YAML subset

class YamlError extends Error {
  constructor(kind, message, line) {
    super(message);
    this.kind = kind; // 'invalid' | 'unsupported'
    this.line = line;
  }
}
const invalid = (message, line) => new YamlError('invalid', message, line);
const unsupported = (construct, line) => new YamlError('unsupported', construct, line);

const NONE = Symbol('no node');
const isBlank = (s) => /^[ \t]*(#.*)?$/.test(s);
const isSeqItem = (s) => s === '-' || /^-[ \t]/.test(s);

function resolvePlain(text) {
  if (text === '' || /^(?:~|null|Null|NULL)$/.test(text)) return null;
  if (/^(?:true|True|TRUE)$/.test(text)) return true;
  if (/^(?:false|False|FALSE)$/.test(text)) return false;
  if (/^[-+]?[0-9]+$/.test(text)) return Number(text);
  if (/^0o[0-7]+$/.test(text)) return parseInt(text.slice(2), 8);
  if (/^0x[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(2), 16);
  if (/^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/.test(text)) return Number(text);
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(text)) return text[0] === '-' ? -Infinity : Infinity;
  if (/^\.(?:nan|NaN|NAN)$/.test(text)) return NaN;
  return text;
}

const keyName = (k) => (k === null ? '' : String(k));

const ESCAPES = {
  0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029',
};
const HEX_ESCAPES = { x: 2, u: 4, U: 8 };

class YamlParser {
  constructor(text, firstLine) {
    this.lines = text.split(/\r?\n/);
    // A final newline ends the last line; it does not start an empty one, which
    // would add a line to a keep-chomped (|+, >+) block scalar.
    if (this.lines.length > 1 && this.lines[this.lines.length - 1] === '') this.lines.pop();
    this.first = firstLine; // file line number of lines[0]
    this.i = 0;
  }

  lineNo(i = this.i) {
    return this.first + i;
  }

  parse() {
    const value = this.blockNode(-1, false);
    this.skipBlank();
    if (this.i < this.lines.length) throw invalid('unexpected content here (check its indentation)', this.lineNo());
    return value === NONE ? null : value;
  }

  skipBlank() {
    while (this.i < this.lines.length && isBlank(this.lines[this.i])) this.i++;
  }

  indentOf(i) {
    const s = this.lines[i];
    let n = 0;
    while (s[n] === ' ') n++;
    if (s[n] === '\t') throw invalid('tab character in indentation (YAML indents with spaces only)', this.lineNo(i));
    if (n === 0 && /^(?:---|\.\.\.)(?:[ \t]|$)/.test(s)) throw unsupported('a document marker (--- or ...)', this.lineNo(i));
    return n;
  }

  // The node whose first content line is the next non-blank line, if that line is
  // indented deeper than its parent. A sequence may sit at its parent key's own
  // indentation ("key:" then "- item"), which YAML allows for mapping values.
  blockNode(parentIndent, seqMayShareIndent) {
    this.skipBlank();
    if (this.i >= this.lines.length) return NONE;
    const ind = this.indentOf(this.i);
    const content = this.lines[this.i].slice(ind);
    const shared = seqMayShareIndent && ind === parentIndent && isSeqItem(content);
    if (ind <= parentIndent && !shared) return NONE;
    if (isSeqItem(content)) return this.blockSeq(ind);
    if (content[0] === '%') throw invalid('a plain value cannot start with "%"', this.lineNo());
    if (this.keyAt(this.i, ind)) return this.blockMap(ind);
    return this.inlineValue(this.i, ind, parentIndent);
  }

  blockSeq(ind) {
    const items = [];
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length) break;
      const lind = this.indentOf(this.i);
      if (lind < ind) break;
      if (lind > ind) throw invalid('unexpected indentation inside a "- " list', this.lineNo());
      const s = this.lines[this.i];
      if (!isSeqItem(s.slice(ind))) break;
      if (/^-[ ]*\t/.test(s.slice(ind))) throw unsupported('a tab after "-"', this.lineNo());
      // Blank out the dash: the item's content then sits at its own column, so
      // "- key: value" and "- - x" parse as the nested nodes they are.
      this.lines[this.i] = s.slice(0, ind) + ' ' + s.slice(ind + 1);
      const item = this.blockNode(ind, false);
      items.push(item === NONE ? null : item);
    }
    return items;
  }

  blockMap(ind) {
    const map = Object.create(null);
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length) break;
      const lind = this.indentOf(this.i);
      if (lind < ind) break;
      if (lind > ind) throw invalid('unexpected indentation (a value must be on its key\'s line or indented below it)', this.lineNo());
      const content = this.lines[this.i].slice(ind);
      if (isSeqItem(content)) throw invalid('a "- " item where a "key:" was expected (check its indentation)', this.lineNo());
      const key = this.keyAt(this.i, ind);
      if (!key) throw invalid('expected "key: value"', this.lineNo());
      const name = keyName(key.key);
      if (name in map) throw invalid(`duplicate key "${name}"`, this.lineNo());
      map[name] = this.valueAfter(this.i, key.after, ind);
    }
    return map;
  }

  // A mapping key at lines[i][col], or null when the line is not "key: ...".
  keyAt(i, col) {
    const s = this.lines[i];
    const c = s[col];
    if (c === '"' || c === "'") {
      const q = this.quoted(i, col, -1, true);
      if (!q) return null;
      const m = /^[ \t]*:(?=[ \t]|$)/.exec(s.slice(q.col));
      return m ? { key: q.value, after: q.col + m[0].length } : null;
    }
    if (c === '?' && (s.length === col + 1 || s[col + 1] === ' ' || s[col + 1] === '\t'))
      throw unsupported('a complex key (?)', this.lineNo(i));
    if (c === '[' || c === '{') return null;
    for (let k = col; k < s.length; k++) {
      if (s[k] === '#' && k > col && (s[k - 1] === ' ' || s[k - 1] === '\t')) return null;
      if (s[k] === ':' && (k + 1 === s.length || s[k + 1] === ' ' || s[k + 1] === '\t')) {
        const raw = s.slice(col, k).replace(/[ \t]+$/, '');
        if (raw === '') throw unsupported('an empty key', this.lineNo(i));
        this.checkPlainStart(raw, i, false);
        return { key: resolvePlain(raw), after: k + 1 };
      }
    }
    return null;
  }

  valueAfter(i, col, ownerIndent) {
    const s = this.lines[i];
    let p = col;
    while (s[p] === ' ' || s[p] === '\t') p++;
    if (p >= s.length || s[p] === '#') {
      this.i = i + 1;
      const value = this.blockNode(ownerIndent, true);
      return value === NONE ? null : value;
    }
    return this.inlineValue(i, p, ownerIndent);
  }

  // A scalar or flow collection starting at lines[i][p]. Continuation lines must
  // be indented deeper than ownerIndent.
  inlineValue(i, p, ownerIndent) {
    const s = this.lines[i];
    const c = s[p];
    if (c === '|' || c === '>') return this.blockScalar(i, p, ownerIndent);
    if (c === '[' || c === '{') return this.flowTop(i, p, ownerIndent);
    if (c === '"' || c === "'") {
      const q = this.quoted(i, p, ownerIndent, false);
      const rest = this.lines[q.line].slice(q.col);
      if (/^[ \t]*:(?:[ \t]|$)/.test(rest)) throw invalid('a key cannot span lines', this.lineNo(q.line));
      if (!/^(?:[ \t]+#.*|[ \t]*)$/.test(rest)) throw invalid('unexpected text after the closing quote', this.lineNo(q.line));
      this.i = q.line + 1;
      return q.value;
    }
    if (isSeqItem(s.slice(p))) throw invalid('a "- " list cannot start on the same line as its key', this.lineNo(i));
    this.checkPlainStart(s.slice(p), i, false);
    return this.plain(i, p, ownerIndent);
  }

  checkPlainStart(text, i, flow) {
    const c = text[0];
    const next = text[1];
    if (c === '&') throw unsupported('an anchor (&)', this.lineNo(i));
    if (c === '*') throw unsupported('an alias (*)', this.lineNo(i));
    if (c === '!') throw unsupported('a tag (!)', this.lineNo(i));
    if (c === '-' || c === '?' || c === ':') {
      const ends = next === undefined || next === ' ' || next === '\t' || (flow && ',[]{}'.includes(next));
      if (flow && c === ':' && ends) throw unsupported('an empty key', this.lineNo(i));
      if (ends)
        throw invalid(`a plain value cannot start with "${c} "`, this.lineNo(i));
      return;
    }
    if (',[]{}#|>\'"%@`'.includes(c)) throw invalid(`a plain value cannot start with "${c}" (quote the value)`, this.lineNo(i));
  }

  // One line of a block-context plain scalar: the text before any comment.
  plainLine(text, i) {
    for (let k = 0; k < text.length; k++) {
      if (text[k] === '#' && k > 0 && (text[k - 1] === ' ' || text[k - 1] === '\t'))
        return { text: text.slice(0, k).replace(/[ \t]+$/, ''), comment: true };
      if (text[k] === ':' && (k + 1 === text.length || text[k + 1] === ' ' || text[k + 1] === '\t'))
        throw invalid('": " inside a plain value (quote the value)', this.lineNo(i));
    }
    return { text: text.replace(/[ \t]+$/, ''), comment: false };
  }

  plain(i, p, ownerIndent) {
    const first = this.plainLine(this.lines[i].slice(p), i);
    let out = first.text;
    let last = i;
    let breaks = 0;
    for (let j = i + 1; !this.endedByComment(first, last, i) && j < this.lines.length; j++) {
      const raw = this.lines[j];
      if (/^[ \t]*$/.test(raw)) {
        breaks++;
        continue;
      }
      let lind = 0;
      while (raw[lind] === ' ') lind++;
      if (lind <= ownerIndent) break;
      const content = raw.slice(lind).replace(/^[ \t]+/, '');
      if (content[0] === '#') break;
      const part = this.plainLine(content, j);
      out += breaks ? '\n'.repeat(breaks) : ' ';
      out += part.text;
      breaks = 0;
      last = j;
      if (part.comment) break;
    }
    this.i = last + 1;
    return resolvePlain(out);
  }

  endedByComment(first, last, i) {
    return last === i && first.comment;
  }

  blockScalar(i, p, ownerIndent) {
    const m = /^([|>])([+-]?)([1-9]?)([+-]?)(?:[ \t]+#.*|[ \t]*)$/.exec(this.lines[i].slice(p));
    if (!m || (m[2] && m[4])) throw invalid('malformed block scalar header', this.lineNo(i));
    const literal = m[1] === '|';
    const chomp = m[2] || m[4];
    let indent = m[3] ? ownerIndent + Number(m[3]) : -1;
    if (indent < 0) {
      for (let j = i + 1; j < this.lines.length; j++) {
        if (/^ *$/.test(this.lines[j])) continue;
        let n = 0;
        while (this.lines[j][n] === ' ') n++;
        indent = n;
        break;
      }
      if (indent <= ownerIndent) indent = Infinity; // no content lines
    }
    const body = [];
    let j = i + 1;
    for (; j < this.lines.length; j++) {
      const raw = this.lines[j];
      if (/^ *$/.test(raw)) {
        body.push(raw.length > indent ? raw.slice(indent) : '');
        continue;
      }
      let n = 0;
      while (raw[n] === ' ') n++;
      if (n < indent) break;
      body.push(raw.slice(indent));
    }
    let end = body.length;
    while (end > 0 && body[end - 1] === '') end--;
    const trailing = body.length - end;
    // Trailing empty lines belong to the scalar; a non-blank line ends it.
    this.i = j;
    const lines = body.slice(0, end);
    let text = literal ? lines.join('\n') : foldLines(lines);
    if (end === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '+') text += '\n' + '\n'.repeat(trailing);
    else if (chomp !== '-') text += '\n';
    return text;
  }

  // A quoted scalar opening at lines[i][p]. Returns { value, line, col } with col
  // just past the closing quote, or null when singleLine and it does not close.
  quoted(i, p, ownerIndent, singleLine) {
    const quote = this.lines[i][p];
    let out = '';
    let keep = 0; // escaped text that trailing-whitespace trimming must not eat
    let li = i;
    let k = p + 1;
    let escapedBreak = false;
    for (;;) {
      const s = this.lines[li];
      while (k < s.length) {
        const ch = s[k];
        if (ch === quote) {
          if (quote === "'" && s[k + 1] === "'") {
            out += "'";
            k += 2;
            continue;
          }
          return { value: out, line: li, col: k + 1 };
        }
        if (quote === '"' && ch === '\\') {
          if (k + 1 === s.length) {
            escapedBreak = true;
            k++;
            break;
          }
          const e = s[k + 1];
          if (e in ESCAPES) {
            out += ESCAPES[e];
            k += 2;
          } else if (e in HEX_ESCAPES) {
            const hex = s.slice(k + 2, k + 2 + HEX_ESCAPES[e]);
            if (!new RegExp(`^[0-9a-fA-F]{${HEX_ESCAPES[e]}}$`).test(hex)) throw invalid(`malformed \\${e} escape`, this.lineNo(li));
            out += String.fromCodePoint(parseInt(hex, 16));
            k += 2 + HEX_ESCAPES[e];
          } else throw invalid(`unknown escape "\\${e}" in a double-quoted value`, this.lineNo(li));
          keep = out.length;
          continue;
        }
        out += ch;
        k++;
      }
      if (singleLine) return null;
      if (!escapedBreak) out = out.slice(0, keep) + out.slice(keep).replace(/[ \t]+$/, '');
      // Fold onto the next line: one break is a space, each empty line a newline.
      let empties = 0;
      for (;;) {
        li++;
        if (li >= this.lines.length) throw invalid('a quoted value is never closed', this.lineNo(i));
        if (!/^[ \t]*$/.test(this.lines[li])) break;
        empties++;
      }
      const next = this.lines[li];
      let lind = 0;
      while (next[lind] === ' ') lind++;
      if (lind <= ownerIndent) throw invalid('a quoted value continues on a line that is not indented', this.lineNo(li));
      k = lind;
      while (next[k] === ' ' || next[k] === '\t') k++;
      out += empties ? '\n'.repeat(empties) : escapedBreak ? '' : ' ';
      keep = out.length;
      escapedBreak = false;
    }
  }

  // ---- flow collections: [ ... ] and { ... }, possibly over several lines

  flowTop(i, p, ownerIndent) {
    this.f = { li: i, k: p, owner: ownerIndent };
    const value = this.flowNode();
    const rest = this.lines[this.f.li].slice(this.f.k);
    if (/^[ \t]*:(?:[ \t]|$)/.test(rest)) throw unsupported('a [ ] or { } collection used as a key', this.lineNo(this.f.li));
    if (!/^(?:[ \t]+#.*|[ \t]*)$/.test(rest)) throw invalid('unexpected text after the closing bracket', this.lineNo(this.f.li));
    this.i = this.f.li + 1;
    return value;
  }

  fpeek() {
    return this.lines[this.f.li][this.f.k];
  }

  // Skip whitespace, comments and line breaks inside a flow collection.
  fskip() {
    for (;;) {
      const s = this.lines[this.f.li];
      while (s[this.f.k] === ' ' || s[this.f.k] === '\t') this.f.k++;
      if (this.f.k < s.length && s[this.f.k] !== '#') return;
      if (s[this.f.k] === '#' && this.f.k > 0 && s[this.f.k - 1] !== ' ' && s[this.f.k - 1] !== '\t') return;
      this.f.li++;
      if (this.f.li >= this.lines.length) throw invalid('a [ or { is never closed', this.lineNo(this.f.li - 1));
      const next = this.lines[this.f.li];
      let lind = 0;
      while (next[lind] === ' ') lind++;
      if (!/^[ \t]*$/.test(next) && lind <= this.f.owner)
        throw unsupported('a [ ] or { } collection continued on a line that is not indented', this.lineNo(this.f.li));
      this.f.k = 0;
    }
  }

  flowNode() {
    this.fskip();
    const c = this.fpeek();
    if (c === '[') return this.flowSeq();
    if (c === '{') return this.flowMap();
    if (c === '"' || c === "'") {
      const q = this.quoted(this.f.li, this.f.k, this.f.owner, false);
      this.f.li = q.line;
      this.f.k = q.col;
      return q.value;
    }
    const s = this.lines[this.f.li];
    this.checkPlainStart(s.slice(this.f.k), this.f.li, true);
    let k = this.f.k;
    for (; k < s.length; k++) {
      const ch = s[k];
      if (',[]{}'.includes(ch)) break;
      if (ch === ':' && (k + 1 === s.length || ' \t,[]{}'.includes(s[k + 1]))) break;
      if (ch === '#' && (s[k - 1] === ' ' || s[k - 1] === '\t')) break;
    }
    const text = s.slice(this.f.k, k).replace(/[ \t]+$/, '');
    const startLine = this.f.li;
    this.f.k = k;
    if (k >= s.length || s[k] === '#') {
      this.fskip();
      if (!',]}:'.includes(this.fpeek())) throw unsupported('a plain value spanning lines inside [ ] or { }', this.lineNo(startLine));
    }
    return resolvePlain(text);
  }

  flowSeq() {
    this.f.k++;
    const items = [];
    for (;;) {
      this.fskip();
      if (this.fpeek() === ']') {
        this.f.k++;
        return items;
      }
      items.push(this.flowNode());
      this.fskip();
      if (this.fpeek() === ':') throw unsupported('a "key: value" pair inside [ ]', this.lineNo(this.f.li));
      if (this.fpeek() === ',') {
        this.f.k++;
        continue;
      }
      if (this.fpeek() === ']') {
        this.f.k++;
        return items;
      }
      throw invalid('expected "," or "]"', this.lineNo(this.f.li));
    }
  }

  flowMap() {
    this.f.k++;
    const map = Object.create(null);
    for (;;) {
      this.fskip();
      if (this.fpeek() === '}') {
        this.f.k++;
        return map;
      }
      const s = this.lines[this.f.li];
      const c = this.fpeek();
      if (c === '[' || c === '{') throw unsupported('a [ ] or { } collection used as a key', this.lineNo(this.f.li));
      if (c === '?' && ' \t'.includes(s[this.f.k + 1] || ' ')) throw unsupported('a complex key (?)', this.lineNo(this.f.li));
      const keyLine = this.f.li;
      const name = keyName(this.flowNode());
      this.fskip();
      let value = null;
      if (this.fpeek() === ':') {
        this.f.k++;
        this.fskip();
        if (this.fpeek() !== ',' && this.fpeek() !== '}') value = this.flowNode();
        this.fskip();
      }
      if (name in map) throw invalid(`duplicate key "${name}"`, this.lineNo(keyLine));
      map[name] = value;
      if (this.fpeek() === ',') {
        this.f.k++;
        continue;
      }
      if (this.fpeek() === '}') {
        this.f.k++;
        return map;
      }
      throw invalid('expected "," or "}"', this.lineNo(this.f.li));
    }
  }
}

// Folded (>) block scalar: a single break between two plain lines becomes a
// space; empty lines become newlines; breaks next to more-indented lines stay.
function foldLines(lines) {
  let out = '';
  let prev = null;
  let empties = 0;
  for (const line of lines) {
    if (line === '') {
      if (prev === null) out += '\n';
      else empties++;
      continue;
    }
    if (prev !== null) {
      if (/^[ \t]/.test(line) || /^[ \t]/.test(prev)) out += '\n'.repeat(empties + 1);
      else out += empties ? '\n'.repeat(empties) : ' ';
    }
    out += line;
    prev = line;
    empties = 0;
  }
  return out;
}

export function parseYaml(text, firstLine = 1) {
  return new YamlParser(text, firstLine).parse();
}

// ------------------------------------------------------------------ markdown

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const LIST_ITEM = /^ {0,3}(?:[*+-]|\d{1,9}[.)])[ \t]+(.*)$/;
const LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const FOOTNOTE = /\[\^([^\]\s]+)\]/g;
// Inline code shows markdown as text; links and footnotes inside it are not live.
const withoutCode = (text) => text.replace(/(`+)[^`]*?\1/g, '');

// Lines outside fenced code blocks, as { idx, text }.
function* prose(lines, from) {
  let fence = null;
  for (let idx = from; idx < lines.length; idx++) {
    const text = lines[idx];
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(text);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^ {0,3}[`~]+[ \t]*$/.test(text)) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    yield { idx, text };
  }
}

function readFrontmatter(lines) {
  if (lines.length === 0 || lines[0].replace(/[ \t]+$/, '') !== '---') return { present: false, bodyStart: 0 };
  for (let k = 1; k < lines.length; k++)
    if (lines[k].replace(/[ \t]+$/, '') === '---') return { present: true, closed: true, text: lines.slice(1, k).join('\n'), bodyStart: k + 1 };
  return { present: true, closed: false, bodyStart: lines.length };
}

// ------------------------------------------------------------------ checks

const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const ACTOR = /^(?:human|process):\S+$|^[^\s:/]+\/\S+$/;
const STATUSES = ['draft', 'stable', 'deprecated'];
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validDate(y, m, d) {
  const t = new Date(Date.UTC(+y, +m - 1, +d));
  return t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d;
}

function isDatetime(v) {
  const m = typeof v === 'string' && ISO_DATETIME.exec(v);
  return Boolean(m) && validDate(m[1], m[2], m[3]) && +m[4] < 24 && +m[5] < 60 && (m[6] === undefined || +m[6] < 60);
}

class Bundle {
  constructor(root) {
    this.root = root;
    this.findings = [];
    this.files = [];
    this.dirs = new Map(); // dir rel path ('' = root) -> { concepts, subdirs, index }
  }

  report(level, file, line, message) {
    this.findings.push({ level, file, line, message });
  }

  walk(rel = '') {
    const entry = { concepts: [], subdirs: [], index: false };
    this.dirs.set(rel, entry);
    let hasMarkdown = false;
    const abs = path.join(this.root, rel);
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) {
        if (e.name.endsWith('.md')) this.report('warning', r, 1, 'symlink not followed: this file was not checked');
        continue;
      }
      if (e.isDirectory()) {
        if (this.walk(r)) {
          entry.subdirs.push(e.name);
          hasMarkdown = true;
        }
      } else if (e.isFile() && e.name.endsWith('.md')) {
        this.files.push(r);
        hasMarkdown = true;
        if (e.name === 'index.md') entry.index = true;
        else if (e.name !== 'log.md') entry.concepts.push(e.name);
      }
    }
    return hasMarkdown;
  }

  check() {
    this.walk();
    for (const rel of this.files) {
      const lines = fs.readFileSync(path.join(this.root, rel), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
      const name = path.posix.basename(rel);
      if (name === 'index.md') this.checkIndex(rel, lines);
      else if (name === 'log.md') this.checkLog(rel, lines);
      else this.checkConcept(rel, lines);
    }
    return this;
  }

  // Parses frontmatter, reporting why it could not be read. Returns
  // { ok, data, bodyStart } or { ok: false, bodyStart }.
  frontmatter(rel, lines, fm) {
    if (!fm.closed) {
      this.report('error', rel, 1, 'frontmatter is never closed: add a "---" line after it');
      return { ok: false, bodyStart: fm.bodyStart };
    }
    try {
      return { ok: true, data: parseYaml(fm.text, 2), bodyStart: fm.bodyStart };
    } catch (e) {
      if (!(e instanceof YamlError)) throw e;
      if (e.kind === 'unsupported')
        this.report('error', rel, e.line, `frontmatter uses ${e.message}, which okf-check's YAML subset cannot read, so this file is unverified; rewrite it without that construct`);
      else this.report('error', rel, e.line, `frontmatter is not valid YAML: ${e.message}`);
      return { ok: false, bodyStart: fm.bodyStart };
    }
  }

  checkConcept(rel, lines) {
    const fm = readFrontmatter(lines);
    if (!fm.present) {
      this.report('error', rel, 1, 'no frontmatter: a concept must open with a "---" line, YAML with a `type`, and a closing "---"');
      return;
    }
    const parsed = this.frontmatter(rel, lines, fm);
    if (!parsed.ok) return;
    const data = parsed.data;
    if (data === null) {
      this.report('error', rel, 1, 'frontmatter is empty: it needs a non-empty `type`');
      return;
    }
    if (!isMap(data)) {
      this.report('error', rel, 2, 'frontmatter must be a YAML mapping of "key: value" lines');
      return;
    }
    const at = (key) => {
      const idx = lines.findIndex((l, n) => n > 0 && n < fm.bodyStart && l.startsWith(`${key}:`));
      return idx < 0 ? 1 : idx + 1;
    };
    if (!('type' in data)) this.report('error', rel, 1, 'frontmatter has no `type`: every concept needs one, e.g. `type: Runbook`');
    else if (data.type === null || (typeof data.type === 'string' && data.type.trim() === ''))
      this.report('error', rel, at('type'), '`type` is empty: name the kind of concept, e.g. `type: Runbook`');
    else if (typeof data.type === 'object') this.report('error', rel, at('type'), '`type` must be a string, not a list or mapping');
    else if (typeof data.type !== 'string') this.report('warning', rel, at('type'), '`type` should be a descriptive string');

    this.checkFamilies(rel, data, at);
    const ids = new Set(Array.isArray(data.sources) ? data.sources.filter(isMap).map((s) => s.id).filter((id) => id !== undefined).map(String) : []);
    const flagged = new Set();
    for (const { idx, text } of prose(lines, parsed.bodyStart)) {
      const h = HEADING.exec(text);
      if (h && h[1] === '#' && /^citations$/i.test((h[2] || '').trim()))
        this.report('warning', rel, idx + 1, 'a "# Citations" list is OKF v0.1; v0.2 records sources in `sources` frontmatter');
      for (const m of withoutCode(text).matchAll(FOOTNOTE)) {
        if (ids.has(m[1]) || flagged.has(m[1])) continue;
        flagged.add(m[1]);
        this.report('warning', rel, idx + 1, `footnote [^${m[1]}] matches no \`sources\` entry's \`id\``);
      }
      this.checkLinks(rel, idx, text);
    }
  }

  checkFamilies(rel, data, at) {
    const warn = (key, message) => this.report('warning', rel, at(key), message);
    const datetime = (key, value, name) => {
      if (!isDatetime(value)) warn(key, `\`${name}\` should be an ISO 8601 datetime with an offset, e.g. 2026-10-10T09:00:00Z`);
    };
    const actor = (key, value, name) => {
      if (typeof value !== 'string' || !ACTOR.test(value))
        warn(key, `\`${name}\` should be an actor: <producer>/<version>, human:<id> or process:<id>`);
    };
    const window = (key, value, name) => {
      if (!isMap(value)) warn(key, `\`${name}\` should be a mapping: { from: <datetime>, to: <datetime> }`);
      else for (const end of ['from', 'to']) datetime(key, value[end], `${name}.${end}`);
    };

    for (const key of ['title', 'description', 'resource'])
      if (key in data && typeof data[key] !== 'string') warn(key, `\`${key}\` should be a string`);
    if (!('description' in data)) warn('type', 'no `description`: add one sentence; index.md entries reuse it');
    if ('tags' in data && !(Array.isArray(data.tags) && data.tags.every((t) => typeof t === 'string')))
      warn('tags', '`tags` should be a list of strings, e.g. tags: [billing, api]');
    if ('status' in data && !STATUSES.includes(data.status))
      warn('status', `\`status\` should be one of ${STATUSES.join(' | ')}`);
    if ('stale_after' in data) datetime('stale_after', data.stale_after, 'stale_after');
    if ('timestamp' in data) warn('timestamp', '`timestamp` is OKF v0.1; v0.2 records it as `generated: { by, at }`');

    if ('generated' in data) {
      const g = data.generated;
      if (!isMap(g)) warn('generated', '`generated` should be a mapping: { by: <actor>, at: <datetime> }');
      else {
        if (!('by' in g)) warn('generated', '`generated` needs `by`');
        else actor('generated', g.by, 'generated.by');
        if ('at' in g) datetime('generated', g.at, 'generated.at');
      }
    }
    if ('verified' in data) {
      const list = isMap(data.verified) ? [data.verified] : data.verified;
      if (!Array.isArray(list)) warn('verified', '`verified` should be a list of { by, at } entries');
      else
        list.forEach((v, n) => {
          const name = `verified[${n}]`;
          if (!isMap(v)) return warn('verified', `\`${name}\` should be a mapping: { by: <actor>, at: <datetime> }`);
          if (!('by' in v)) warn('verified', `\`${name}\` needs \`by\``);
          else actor('verified', v.by, `${name}.by`);
          if (!('at' in v)) warn('verified', `\`${name}\` needs \`at\``);
          else datetime('verified', v.at, `${name}.at`);
        });
    }
    if ('sources' in data) {
      if (!Array.isArray(data.sources)) warn('sources', '`sources` should be a list of entries, each with a `resource`');
      else {
        const seen = new Set();
        data.sources.forEach((s, n) => {
          const name = `sources[${n}]`;
          if (!isMap(s)) return warn('sources', `\`${name}\` should be a mapping with a \`resource\``);
          if (typeof s.resource !== 'string' || s.resource.trim() === '') warn('sources', `\`${name}\` needs a \`resource\``);
          if ('id' in s) {
            if (seen.has(String(s.id))) warn('sources', `\`${name}.id\` "${s.id}" is used twice; footnotes need unique ids`);
            seen.add(String(s.id));
          }
          if ('last_modified' in s) datetime('sources', s.last_modified, `${name}.last_modified`);
          if ('usage_count' in s && !(Number.isInteger(s.usage_count) && s.usage_count >= 0))
            warn('sources', `\`${name}.usage_count\` should be a whole number`);
          if ('usage_window' in s) window('sources', s.usage_window, `${name}.usage_window`);
        });
      }
    }
    if ('usage_window' in data) window('usage_window', data.usage_window, 'usage_window');
    if (data.type === 'Attested Computation' && !('runtime' in data))
      warn('type', 'an Attested Computation needs `runtime` (SPEC section 10.2)');
  }

  // Resolves a link target to an absolute path, or null for external links.
  resolve(rel, target) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('#') || target.startsWith('//')) return null;
    let t = target.split('#')[0].split('?')[0];
    if (!t) return null;
    try {
      t = decodeURIComponent(t);
    } catch {
      // keep the raw target
    }
    return t.startsWith('/') ? path.join(this.root, t) : path.join(this.root, path.dirname(rel), t);
  }

  checkLinks(rel, idx, text, collect) {
    for (const m of withoutCode(text).matchAll(LINK)) {
      const abs = this.resolve(rel, m[1]);
      if (abs === null) continue;
      if (!fs.existsSync(abs)) this.report('warning', rel, idx + 1, `link target \`${m[1]}\` does not exist`);
      else if (collect) collect.add(abs.replace(/[\\/]index\.md$/, '').replace(/[\\/]+$/, ''));
    }
  }

  checkIndex(rel, lines) {
    const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    const fm = readFrontmatter(lines);
    let bodyStart = 0;
    if (fm.present) {
      bodyStart = fm.bodyStart;
      if (dir !== '') this.report('error', rel, 1, 'index.md takes no frontmatter: only the bundle-root index.md may carry one, holding just `okf_version`');
      else {
        const parsed = this.frontmatter(rel, lines, fm);
        if (parsed.ok) {
          const data = parsed.data;
          if (!isMap(data) || !('okf_version' in data))
            this.report('error', rel, 1, 'the bundle-root index.md frontmatter may only carry `okf_version`; remove it or write okf_version: "0.2"');
          else {
            for (const key of Object.keys(data))
              if (key !== 'okf_version') this.report('error', rel, 1, `the bundle-root index.md frontmatter may only carry \`okf_version\`, not \`${key}\``);
            const v = data.okf_version;
            if (typeof v !== 'string') this.report('warning', rel, 2, 'write `okf_version` as a quoted string, e.g. okf_version: "0.2"');
            else if (v !== SPEC_VERSION)
              this.report('warning', rel, 2, `okf_version is "${v}": okf-check knows OKF ${SPEC_VERSION} only and checked against it`);
          }
        }
      }
    }
    let sawHeading = false;
    const listed = new Set();
    for (const { idx, text } of prose(lines, bodyStart)) {
      if (HEADING.test(text)) {
        sawHeading = true;
        continue;
      }
      const item = LIST_ITEM.exec(text);
      if (item) {
        if (!sawHeading) this.report('error', rel, idx + 1, 'index entry above the first heading: group entries under a "# Heading"');
        const entry = /^\[(?:[^\]\\]|\\.)*\]\([^)]*\)(.*)$/.exec(item[1]);
        if (!entry) this.report('warning', rel, idx + 1, 'index entry should read "[Title](link) - description"');
        else if (!/^\s*[-–—:]\s*\S/.test(entry[1]))
          this.report('warning', rel, idx + 1, 'index entry has no description: append " - " and the concept\'s `description`');
      }
      this.checkLinks(rel, idx, text, listed);
    }
    if (!sawHeading) this.report('error', rel, bodyStart + 1, 'index.md has no heading: list its entries under at least one "# Heading"');

    const here = this.dirs.get(dir);
    for (const name of [...here.concepts, ...here.subdirs])
      if (!listed.has(path.join(this.root, dir, name)))
        this.report('warning', rel, 1, `index.md does not list \`${name}${here.subdirs.includes(name) ? '/' : ''}\``);
  }

  checkLog(rel, lines) {
    const fm = readFrontmatter(lines);
    let bodyStart = 0;
    if (fm.present) {
      const parsed = this.frontmatter(rel, lines, fm);
      bodyStart = parsed.bodyStart;
    }
    let previous = null;
    let sawDate = false;
    let groupLine = 0;
    let groupSize = 0;
    const closeGroup = () => {
      if (sawDate && groupSize === 0) this.report('warning', rel, groupLine, 'date heading with no entries under it');
    };
    for (const { idx, text } of prose(lines, bodyStart)) {
      const h = HEADING.exec(text);
      if (h && h[1] === '##') {
        closeGroup();
        sawDate = true;
        groupLine = idx + 1;
        groupSize = 0;
        const date = (h[2] || '').trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        if (!m || !validDate(m[1], m[2], m[3])) {
          this.report('error', rel, idx + 1, `log heading "## ${date}" is not an ISO 8601 date: date headings read "## YYYY-MM-DD"`);
          continue;
        }
        if (previous === date) this.report('error', rel, idx + 1, `date ${date} has two headings: keep one heading per day`);
        else if (previous !== null && date > previous)
          this.report('error', rel, idx + 1, `log dates must run newest first: ${date} sits below ${previous}`);
        previous = date;
        continue;
      }
      if (h) continue;
      if (/\S/.test(text)) {
        if (sawDate) groupSize++;
        else if (LIST_ITEM.test(text))
          this.report('error', rel, idx + 1, 'log entry above the first "## YYYY-MM-DD" heading: every entry belongs under a date');
      }
      this.checkLinks(rel, idx, text);
    }
    closeGroup();
  }
}

// ------------------------------------------------------------------ main

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const strict = args.includes('--strict');
  const unknown = args.filter((a) => a.startsWith('-') && a !== '--strict');
  const dirs = args.filter((a) => !a.startsWith('-'));
  if (unknown.length || dirs.length !== 1) {
    console.error(`${unknown.length ? `unknown option ${unknown[0]}\n` : ''}usage: node okf-check.mjs [--strict] <bundle-dir>   (--help for details)`);
    return 2;
  }
  const root = path.resolve(dirs[0]);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`okf-check: ${dirs[0]} is not a directory`);
    return 2;
  }

  const bundle = new Bundle(root).check();
  const counts = { concept: 0, index: 0, log: 0 };
  for (const f of bundle.files) counts[f.endsWith('/index.md') || f === 'index.md' ? 'index' : f.endsWith('/log.md') || f === 'log.md' ? 'log' : 'concept']++;
  if (bundle.files.length === 0) bundle.report('error', '.', 0, 'no .md files found: is this the bundle directory?');

  console.log(`okf-check (OKF v${SPEC_VERSION}): ${root}`);
  console.log(`${counts.concept} concepts, ${counts.index} index.md, ${counts.log} log.md\n`);
  const sorted = bundle.findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  for (const f of sorted) console.log(`${f.file}${f.line ? `:${f.line}` : ''}: ${f.level}: ${f.message}`);

  const errors = sorted.filter((f) => f.level === 'error').length;
  const warnings = sorted.length - errors;
  const fails = errors > 0 || (strict && warnings > 0);
  const tally = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
  console.log(`${sorted.length ? '\n' : ''}${fails ? 'NOT CONFORMANT' : 'CONFORMANT'}: ${tally}${strict && !errors && warnings ? ' (--strict counts warnings)' : ''}`);
  console.log(YAML_NOTE);
  return fails ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) process.exitCode = main(process.argv);
