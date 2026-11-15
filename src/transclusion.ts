/**
 * Transclusion of locally edited templates, used only to build preview text:
 * the wiki parser is still asked to expand everything else, so the page is
 * never saved to the site to see the result.
 */

export interface TemplateOverride {
  /** Page name without the template namespace, folded for comparison. */
  page: string;
  text: string;
}

/** Namespace prefixes that always mean the template namespace. */
const FALLBACK_NAMESPACES = ['template', '模板'];

const MAX_DEPTH = 40;
const MAX_LENGTH = 2_000_000;

/** Regions whose braces are literal text, never transclusions or parameters. */
const PROTECTED =
  /<!--[\s\S]*?-->|<(nowiki|pre|source|syntaxhighlight|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu;

type Span = readonly [number, number];

function protectedSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(PROTECTED)) {
    const start = match.index ?? 0;
    spans.push([start, start + match[0].length]);
  }
  return spans;
}

function protectedEnd(spans: readonly Span[], index: number): number | undefined {
  for (const [start, end] of spans) {
    if (index >= start && index < end) return end;
  }
  return undefined;
}

/** Fold a page name the way MediaWiki compares titles for transclusion. */
export function foldTitle(title: string): string {
  const folded = String(title)
    .replace(/_/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!folded) return '';
  return folded[0].toUpperCase() + folded.slice(1);
}

/**
 * Build the template-namespace prefix set from a parser config `nsid` map
 * (lowercased namespace name or alias -> namespace id).
 */
export function templateNamespaces(nsid: Record<string, number> | undefined): Set<string> {
  const namespaces = new Set(FALLBACK_NAMESPACES);
  for (const [name, id] of Object.entries(nsid || {})) {
    if (id === 10 && name) namespaces.add(name);
  }
  return namespaces;
}

/**
 * Page name of a template page, or undefined when the title is not in the
 * template namespace.
 */
export function templatePageName(
  title: string,
  namespaces: ReadonlySet<string>,
): string | undefined {
  const folded = foldTitle(title);
  const colon = folded.indexOf(':');
  if (colon < 0) return undefined;
  const prefix = folded.slice(0, colon).trim().toLowerCase();
  if (!namespaces.has(prefix)) return undefined;
  return folded.slice(colon + 1).trim();
}

/** Replace calls to the given templates in `text`. Other calls stay as-is. */
export function expandTemplates(
  text: string,
  overrides: readonly TemplateOverride[],
  namespaces: ReadonlySet<string>,
): string {
  if (!overrides.length || !text) return text;
  const sources = new Map<string, string>();
  for (const override of overrides) {
    if (override.page) sources.set(override.page, override.text);
  }
  if (!sources.size) return text;
  return expand(text, sources, namespaces, 0);
}

function expand(
  text: string,
  sources: ReadonlyMap<string, string>,
  namespaces: ReadonlySet<string>,
  depth: number,
): string {
  if (depth > MAX_DEPTH || text.length > MAX_LENGTH) return text;
  const spans = protectedSpans(text);
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{{', i);
    if (start < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    const skip = protectedEnd(spans, start);
    if (skip !== undefined) {
      out += text.slice(start, skip);
      i = skip;
      continue;
    }
    if (text.startsWith('{{{', start)) {
      const end = text.indexOf('}}}', start + 3);
      if (end < 0) {
        out += text.slice(start);
        break;
      }
      out += text.slice(start, end + 3);
      i = end + 3;
      continue;
    }
    const end = matchBraces(text, start);
    if (end < 0) {
      out += text.slice(start);
      break;
    }
    const inner = text.slice(start + 2, end - 2);
    const replacement = expandCall(inner, sources, namespaces, depth);
    out += replacement ?? `{{${expand(inner, sources, namespaces, depth + 1)}}}`;
    i = end;
    if (out.length > MAX_LENGTH) break;
  }
  return out;
}

function expandCall(
  inner: string,
  sources: ReadonlyMap<string, string>,
  namespaces: ReadonlySet<string>,
  depth: number,
): string | undefined {
  const parts = splitTopLevel(inner, '|');
  const name = parts[0].trim();
  // Parser functions, magic words and modifiers keep their server semantics.
  if (!name || name.startsWith('#') || name.startsWith('＃')) return undefined;
  if (/^(?:subst|safesubst|msgnw|raw|msg)\s*:/iu.test(name)) return undefined;
  const page = callPage(name, namespaces);
  if (!page) return undefined;
  const source = sources.get(page);
  if (source === undefined) return undefined;
  const args = parseArguments(parts.slice(1));
  let body = transclusionBody(source);
  body = substituteParameters(body, args);
  return expand(body, sources, namespaces, depth + 1);
}

/** `{{Foo}}` and `{{Template:Foo}}` both name the template page Foo. */
function callPage(name: string, namespaces: ReadonlySet<string>): string | undefined {
  // A leading colon forces the main namespace; it never means a template.
  if (name.startsWith(':')) return undefined;
  const colon = name.indexOf(':');
  if (colon < 0) return foldTitle(name);
  const prefix = foldTitle(name.slice(0, colon)).toLowerCase();
  if (!namespaces.has(prefix)) return undefined;
  return foldTitle(name.slice(colon + 1));
}

interface Arguments {
  named: Map<string, string>;
  positional: string[];
}

function parseArguments(segments: readonly string[]): Arguments {
  const named = new Map<string, string>();
  const positional: string[] = [];
  for (const segment of segments) {
    const parts = splitTopLevel(segment, '=');
    const name = parts[0].trim();
    if (parts.length > 1 && name) {
      // Named parameter values are trimmed; positional ones are not.
      named.set(name, parts.slice(1).join('=').trim());
    } else {
      positional.push(segment);
    }
  }
  return {named, positional};
}

function argument(args: Arguments, name: string): string | undefined {
  if (args.named.has(name)) return args.named.get(name);
  if (/^[0-9]+$/u.test(name)) {
    const index = Number(name);
    if (index >= 1 && index <= args.positional.length) return args.positional[index - 1];
  }
  return undefined;
}

/** Content a transclusion actually uses: onlyinclude, noinclude, includeonly. */
function transclusionBody(source: string): string {
  let only = '';
  let hasOnly = false;
  for (const match of source.matchAll(/<onlyinclude\b[^>]*>([\s\S]*?)<\/onlyinclude\s*>/giu)) {
    hasOnly = true;
    only += match[1];
  }
  let body = hasOnly ? only : source;
  body = body
    .replace(/<noinclude\b[^>]*\/>/giu, '')
    .replace(/<noinclude\b[^>]*>[\s\S]*?<\/noinclude\s*>/giu, '')
    .replace(/<\/?includeonly\b[^>]*>/giu, '');
  return body;
}

function substituteParameters(body: string, args: Arguments): string {
  const spans = protectedSpans(body);
  let out = '';
  let i = 0;
  while (i < body.length) {
    const start = body.indexOf('{{{', i);
    if (start < 0) {
      out += body.slice(i);
      break;
    }
    out += body.slice(i, start);
    const skip = protectedEnd(spans, start);
    if (skip !== undefined) {
      out += body.slice(start, skip);
      i = skip;
      continue;
    }
    const end = matchTriple(body, start);
    if (end < 0) {
      out += body.slice(start);
      break;
    }
    const inner = body.slice(start + 3, end);
    const parts = splitTopLevel(inner, '|');
    const name = parts[0].trim();
    const value = argument(args, name);
    if (value !== undefined) {
      out += value;
    } else if (parts.length > 1) {
      // Only the template's own parameters are substituted; a fallback can
      // contain more of them, a supplied value must stay untouched.
      out += substituteParameters(parts.slice(1).join('|'), args);
    } else {
      out += body.slice(start, end + 3);
    }
    i = end + 3;
  }
  return out;
}

/** Index just past the `}}` matching the `{{` at `start`. */
function matchBraces(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith('{{{', i)) {
      const end = text.indexOf('}}}', i + 3);
      if (end < 0) return -1;
      i = end + 3;
      continue;
    }
    if (text.startsWith('{{', i)) {
      depth++;
      i += 2;
      continue;
    }
    if (text.startsWith('}}', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return -1;
}

/** Index of the `}}}` matching the `{{{` at `start`, or -1. */
function matchTriple(text: string, start: number): number {
  let depth = 0;
  let i = start + 3;
  while (i < text.length) {
    if (text.startsWith('{{{', i)) {
      depth++;
      i += 3;
      continue;
    }
    if (text.startsWith('}}}', i)) {
      if (depth === 0) return i;
      depth--;
      i += 3;
      continue;
    }
    i++;
  }
  return -1;
}

/** Split on a separator that occurs outside braces and links. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let braces = 0;
  let triples = 0;
  let links = 0;
  let external = 0;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('{{{', i)) {
      triples++;
      i += 3;
      continue;
    }
    if (text.startsWith('}}}', i)) {
      if (triples > 0) triples--;
      i += 3;
      continue;
    }
    if (text.startsWith('{{', i)) {
      braces++;
      i += 2;
      continue;
    }
    if (text.startsWith('}}', i)) {
      if (braces > 0) braces--;
      i += 2;
      continue;
    }
    if (text.startsWith('[[', i)) {
      links++;
      i += 2;
      continue;
    }
    if (text.startsWith(']]', i)) {
      if (links > 0) links--;
      i += 2;
      continue;
    }
    if (text[i] === '[') {
      external++;
      i++;
      continue;
    }
    if (text[i] === ']') {
      if (external > 0) external--;
      i++;
      continue;
    }
    if (
      text[i] === separator &&
      braces === 0 &&
      triples === 0 &&
      links === 0 &&
      external === 0
    ) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(text.slice(start));
  return parts;
}
