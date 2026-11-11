import assert from 'node:assert/strict';

export const requiredWebScreens=['01','05','06','07','08','09','10','11','12','13','14','15','16','17','20','22','23','24','25','26','27','29','30','31','32','33','34','35','37'];
export const requiredNativeScreens=['39','40','41','42','43'];
export const primaryCaptureByScreen={'01':'01-welcome','05':'05-taste','06':'06-notifications-prime','07':'07-near-me-list','08':'08-near-me-map','09':'09-club-detail','10':'10-join-request','11':'11-join-sent','12':'12-join-approved','13':'13-public-calendar','14':'14-read-next','15':'15-book-detail','16':'16-saved','17':'17-club-home','20':'20-current-book','22':'22-vote','23':'23-vote-winner','24':'24-meeting','25':'25-schedule-meeting','26':'26-members','27':'27-share-invite','29':'29-profile','30':'30-settings','31':'31-create-club','32':'32-club-started','33':'33-empty-club','34':'34-empty-near','35':'35-empty-saved','37':'37-no-club'};
export const reviewScores={'01':4,'05':5,'06':3,'07':5,'08':3,'09':3,'10':6,'11':7,'12':3,'13':4,'14':5,'15':3,'16':5,'17':5,'20':4,'22':7,'23':4,'24':5,'25':4,'26':7,'27':5,'29':4,'30':4,'31':5,'32':3,'33':5,'34':6,'35':6,'37':4,'39':6,'40':7,'41':7,'42':6,'43':7};
export function assertWebCoverage(captures){
 for(const screen of requiredWebScreens){
  const capture=captures.find(c=>c.approved===screen&&c.id===primaryCaptureByScreen[screen]&&c.checks.width===390&&c.checks.height===844);
  assert.ok(capture,`Missing actual built screen ${screen}`);
  assert.doesNotMatch(capture.id,/equivalent/,'An equivalent surface cannot stand in for a required screen');
  assert.ok(capture.comparison,`Missing side-by-side PNG for screen ${screen}`);
 }
}
export function comparisonHTML(approved,built,title){
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 return `<!doctype html><html><meta charset="utf-8"><title>${esc(title)}</title><style>*{box-sizing:border-box}html,body{margin:0;width:780px;height:880px;background:#f5ead8;color:#2a0f15;font:600 13px system-ui}main{display:grid;grid-template-columns:390px 390px}figure{margin:0}figcaption{height:36px;padding:10px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{display:block;width:390px;height:844px;object-fit:contain;background:#f5ead8}</style><main><figure><figcaption>${esc(title)} | Approved reference</figcaption><img src="${esc(approved)}"></figure><figure><figcaption>${esc(title)} | Actual built app</figcaption><img src="${esc(built)}"></figure></main></html>`;
}
