import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  expandTemplates,
  templateNamespaces,
  templatePageName,
} = require('../out/transclusion.js');

const namespaces = new Set(['template', '模板']);

const expand = (text, templates) =>
  expandTemplates(
    text,
    templates.map(([title, body]) => ({
      page: templatePageName(title, namespaces),
      text: body,
    })),
    namespaces,
  );

test('transcludes a template with positional, named and default parameters', () => {
  const body = 'Hello {{{1|world}}}, {{{name|nobody}}}!';
  assert.equal(
    expand('A {{Foo|Bob|name=Ann}} B', [['Template:Foo', body]]),
    'A Hello Bob, Ann! B',
  );
  assert.equal(
    expand('A {{Template:Foo}} B', [['Template:Foo', body]]),
    'A Hello world, nobody! B',
  );
  assert.equal(
    expand('A {{模板:Foo|1=Bob}} B', [['Template:Foo', body]]),
    'A Hello Bob, nobody! B',
  );
  assert.equal(expand('A {{foo|Bob}} B', [['Template:Foo', body]]), 'A Hello Bob, nobody! B');
});

test('named values are trimmed, positional values are not', () => {
  const body = '[{{{1}}}][{{{name}}}]';
  assert.equal(
    expand('{{Foo|  x  |name=  y  }}', [['Template:Foo', body]]),
    '[  x  ][y]',
  );
});

test('a missing parameter stays literal; defaults can nest', () => {
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', 'X{{{missing}}}Y']]),
    'X{{{missing}}}Y',
  );
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', '{{{1|{{{2|fallback}}}}}}']]),
    'fallback',
  );
});

test('include tags follow transclusion semantics', () => {
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', 'body<noinclude>docs</noinclude>']]),
    'body',
  );
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', '<includeonly>shown</includeonly>']]),
    'shown',
  );
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', 'keep<onlyinclude>only</onlyinclude>drop']]),
    'only',
  );
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', '<onlyinclude>a</onlyinclude>x<onlyinclude>b</onlyinclude>']]),
    'ab',
  );
});

test('nested open templates are expanded too', () => {
  const templates = [
    ['Template:Outer', 'outer({{Inner}})'],
    ['Template:Inner', 'inner'],
  ];
  assert.equal(expand('x {{Outer}} y', templates), 'x outer(inner) y');
});

test('non-template calls and parameters are left to the server', () => {
  const templates = [
    ['Template:Foo', 'foo({{{1}}})'],
    ['Template:Bar', 'bar'],
  ];
  assert.equal(expand('{{Foo}}', templates.slice(0, 1)), 'foo({{{1}}})');
  assert.equal(expand('{{Other}}', templates), '{{Other}}');
  assert.equal(expand('{{#if:a|b|c}}', templates), '{{#if:a|b|c}}');
  assert.equal(expand('{{:Foo}}', templates), '{{:Foo}}');
  assert.equal(expand('{{subst:Foo}}', templates), '{{subst:Foo}}');
  assert.equal(expand('top {{{1}}} level', templates), 'top {{{1}}} level');
});

test('calls inside parser functions still resolve open templates', () => {
  assert.equal(
    expand('{{#if:1|{{Foo}}|no}}', [['Template:Foo', 'yes']]),
    '{{#if:1|yes|no}}',
  );
});

test('pipes inside links do not split arguments', () => {
  const body = '{{{1}}}/{{{2|}}}';
  assert.equal(
    expand('{{Foo|[[a|b]]|[[c]]}}', [['Template:Foo', body]]),
    '[[a|b]]/[[c]]',
  );
  assert.equal(
    expand('{{Foo|[https://x.test/?a=b label]}}', [['Template:Foo', '{{{1}}}']]),
    '[https://x.test/?a=b label]',
  );
});

test('nowiki, pre and comments keep literal braces', () => {
  const templates = [['Template:Foo', 'body']];
  assert.equal(
    expand('<nowiki>{{Foo}}</nowiki>', templates),
    '<nowiki>{{Foo}}</nowiki>',
  );
  assert.equal(expand('<!-- {{Foo}} -->', templates), '<!-- {{Foo}} -->');
  assert.equal(
    expand('<pre>{{Foo}}</pre> {{Foo}}', templates),
    '<pre>{{Foo}}</pre> body',
  );
  assert.equal(
    expand('{{Foo}}', [['Template:Foo', '<nowiki>{{{1}}}</nowiki>']]),
    '<nowiki>{{{1}}}</nowiki>',
  );
});

test('recursion is depth limited instead of hanging', () => {
  const result = expand('{{A}}', [
    ['Template:A', 'a{{B}}'],
    ['Template:B', 'b{{A}}'],
  ]);
  assert.ok(result.length > 0 && result.length < 10_000, `unexpected length ${result.length}`);
});

test('template page names only resolve inside the template namespace', () => {
  assert.equal(templatePageName('Template:Foo', namespaces), 'Foo');
  assert.equal(templatePageName('模板:Foo', namespaces), 'Foo');
  assert.equal(templatePageName('template:Foo Bar', namespaces), 'Foo Bar');
  assert.equal(templatePageName('Foo', namespaces), undefined);
  assert.equal(templatePageName('Help:Foo', namespaces), undefined);
});

test('template namespace aliases come from the site config', () => {
  const fromConfig = templateNamespaces({template: 10, 'шаблон': 10, page: 0});
  assert.ok(fromConfig.has('template'));
  assert.ok(fromConfig.has('шаблон'));
  assert.ok(!fromConfig.has('page'));
});
