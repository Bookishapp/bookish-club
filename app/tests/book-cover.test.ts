import test from 'node:test';
import assert from 'node:assert/strict';
import { bookCover } from '../src/book-cover.ts';
import { data } from '../src/data.ts';

test('current book resolves a real bundled cover by title when directory omits its id', () => {
  const markup = bookCover(undefined, 'The Midnight Library');
  assert.match(markup, /covers\/the-midnight-library\.jpg/);
  assert.match(markup, /alt="Cover of The Midnight Library"/);
});

test('unknown book retains its actual title without substituting an unrelated cover', () => {
  const markup = bookCover('unknown-book', '<My Book>');
  assert.match(markup, /&lt;My Book&gt;/);
  assert.doesNotMatch(markup, /<img/);
});

test('catalog covers retain the Open Library source when no bundled copy exists', () => {
  data.books = [{id:'test-book', t:'A Test Book', a:'Reader', c:12345, p:null, ol:null, m:[]}];
  assert.match(bookCover('test-book'), /covers\.openlibrary\.org\/b\/id\/12345-M\.jpg/);
});
test('server cover metadata displays an unfamiliar current book with a safe fallback',()=>{
 assert.match(bookCover('new-book','A New Story','',{cover_url:'https://covers.openlibrary.org/b/id/123-M.jpg',cover_style:'green'}),/123-M.jpg/);
 assert.doesNotMatch(bookCover('new-book','A New Story','',{cover_url:'javascript:alert(1)'}),/<img/);
});
