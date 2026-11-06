import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appLink } from '../src/app-links.ts';

test('opens only Bookish invite and club links, without navigating the WebView away',()=>{
 assert.deepEqual(appLink('https://meetbookish.com/app/#invite=abcdef12'),{kind:'invite',code:'ABCDEF12'});
 assert.deepEqual(appLink('https://meetbookish.com/book-clubs/chicago-il/#club-123'),{kind:'club',id:'club-123'});
 for(const url of ['https://evil.test/app/#invite=ABCDEF12','https://meetbookish.com.evil.test/app/#invite=ABCDEF12','http://meetbookish.com/app/#invite=ABCDEF12','https://user@meetbookish.com/app/#invite=ABCDEF12','https://meetbookish.com/privacy/','https://meetbookish.com/app/#invite=%ZZ','javascript:alert(1)','https://meetbookish.com/book-clubs/chicago-il/#%ZZ']) assert.equal(appLink(url),null,url);
});
