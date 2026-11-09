(() => {
'use strict';
const books = [...document.querySelectorAll('.book')];
const shelves = [...document.querySelectorAll('.shelf')];
const search = document.querySelector('#mr-search');
const mood = document.querySelector('#mr-mood');
const trope = document.querySelector('#mr-trope');
const fold = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’‘]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
function filterBooks() {
  const query = fold(search.value.trim());
  const keys = new Set();
  for (const book of books) {
    const show = fold(book.dataset.search).includes(query) && (!mood.value || book.dataset.moods.split('; ').includes(mood.value)) && (!trope.value || book.dataset.tropes.split('; ').includes(trope.value));
    book.hidden = !show;
    if (show) keys.add(book.dataset.key);
  }
  for (const shelf of shelves) {
    const count = shelf.querySelectorAll('.book:not([hidden])').length;
    shelf.hidden = count === 0;
    shelf.querySelector('.shelf-size').textContent = `${count} ${count === 1 ? 'book' : 'books'}`;
    const link = document.querySelector(`[data-shelf-link="${shelf.dataset.shelf}"]`);
    link.hidden = count === 0;
    link.querySelector('span').textContent = count;
  }
  document.querySelector('#result-count').textContent = `${keys.size} unique ${keys.size === 1 ? 'book' : 'books'} across the shelves`;
  document.querySelector('#empty').hidden = keys.size !== 0;
}
function reset() { search.value = ''; mood.value = ''; trope.value = ''; filterBooks(); search.focus(); }
search.addEventListener('input', filterBooks);
mood.addEventListener('change', filterBooks);
trope.addEventListener('change', filterBooks);
document.querySelector('#mr-reset').addEventListener('click', reset);
document.querySelector('#empty-reset').addEventListener('click', reset);
document.querySelector('#mr-filters').hidden = false;

for (const image of document.querySelectorAll('.book-cover img')) {
  const fallback = image.parentElement.querySelector('.cover-fallback');
  const failed = () => { image.hidden = true; fallback.hidden = false; };
  image.addEventListener('error', failed);
  image.addEventListener('load', () => { image.hidden = false; fallback.hidden = true; });
  if (image.complete && image.naturalWidth === 0) failed();
}

})();
