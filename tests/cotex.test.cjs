const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Store} = require('../electron/store.cjs');
const {parseTXT, finalizeBook} = require('../electron/core.cjs');

function fixtureRoot() {
  const base = path.join(__dirname, '../test-results');
  fs.mkdirSync(base, {recursive:true});
  return fs.mkdtempSync(path.join(base, 'cotex-unit-'));
}

test('upgrade calibrates old defaults without losing the library or custom settings', () => {
  const root = fixtureRoot();
  const book = finalizeBook(parseTXT(Buffer.from('第一章 初见\n第一段\n第二章 重逢\n第二段'), '示例.txt'), 'upgrade');
  const old = new Store(root);
  old.add(book);
  old.patch(book.id, {progress:{chapter:1,paragraph:0},bookmarks:[{chapter:0,paragraph:0}],collapsed:[0]});
  const db = JSON.parse(fs.readFileSync(path.join(root, 'library.json')));
  delete db.appearanceVersion;
  Object.assign(db.settings, {fontSize:17,lineHeight:1.95,width:850,theme:'paper',group:'我的书库'});
  fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify(db));
  const next = new Store(root);
  assert.equal(next.db.settings.fontSize, 14);
  assert.equal(next.db.settings.lineHeight, 1.7);
  assert.equal(next.db.settings.width, 736);
  assert.equal(next.db.settings.theme, 'paper');
  assert.equal(next.db.settings.group, '我的书库');
  assert.equal(next.db.activeId, book.id);
  assert.equal(next.get(book.id).progress.chapter, 1);
  assert.equal(next.get(book.id).bookmarks.length, 1);
  assert.deepEqual(next.get(book.id).collapsed, [0]);
  next.settings({fontSize:17,width:850});
  const restarted = new Store(root);
  assert.equal(restarted.db.settings.fontSize, 17, 'migration only runs once');
  assert.equal(restarted.db.settings.width, 850);
});

test('ring handles start, paragraph reading, final chapter and completion', async () => {
  const {readingPercent} = await import('../src/progress.mjs');
  const b = {chapters:[{paragraphs:['a','b','c','d']},{paragraphs:['e','f']}]};
  assert.equal(readingPercent(null), 0);
  assert.equal(readingPercent(b, {chapter:0,paragraph:0}), 0);
  assert.equal(readingPercent(b, {chapter:0,paragraph:2}), 25);
  assert.equal(readingPercent(b, {chapter:1,paragraph:0}), 50);
  assert.equal(readingPercent(b, {chapter:1,paragraph:1}), 75);
  assert.equal(readingPercent(b, {chapter:1,paragraph:1,finished:true}), 100);
  assert.equal(readingPercent({chapters:[{paragraphs:null}]}, {}), 0);
});

test('finished reading persists and resets when navigating backwards', () => {
  const s = new Store(fixtureRoot());
  const b = finalizeBook(parseTXT(Buffer.from('第一章 开始\n正文\n第二章 结束\n终章'), '示例.txt'), 'progress');
  s.add(b);
  s.patch(b.id, {progress:{chapter:1,paragraph:0,finished:true}});
  assert.equal(new Store(s.root).get(b.id).progress.finished, true);
  s.patch(b.id, {progress:{chapter:0,paragraph:0}});
  assert.equal(new Store(s.root).get(b.id).progress.finished, false);
});
