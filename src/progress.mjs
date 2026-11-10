// Chapter position plus the current paragraph's fraction of that chapter.
// This stays meaningful for online books whose later chapters are not cached.
export function readingPercent(book, position = {}) {
  const count = book?.chapters?.length || 0;
  if (!count) return 0;
  const chapter = Math.max(0, Math.min(count - 1, Number(position.chapter) || 0));
  if (position.finished === true && chapter === count - 1) return 100;
  const paragraphs = book.chapters[chapter]?.paragraphs?.length || 1;
  const paragraph = Math.max(0, Math.min(paragraphs - 1, Number(position.paragraph) || 0));
  // Never show 100% just because the last chapter was opened.
  return Math.min(99.9, Math.floor((chapter + paragraph / paragraphs) / count * 1000) / 10);
}
