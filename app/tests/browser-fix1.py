import argparse, json, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description='Run local regression checks in a leased Ted Google Chrome worker.')
parser.add_argument('mode',choices=['paste','summaries'])
parser.add_argument('evidence',type=Path)
args=parser.parse_args()
base=args.evidence.resolve();base.mkdir(parents=True,exist_ok=True)
test_dir=Path(__file__).resolve().parent
cli=os.environ.get('BOOKISH_CHROME_CLI','tedchrome')
subprocess.run(['node',str(test_dir/'browser-fix1-harness.mjs'),str(base/'browser-harness.json')],check=True)
fixture=json.loads((base/'browser-harness.json').read_text())
worker=subprocess.check_output([cli,'lease','--job','bookish-fix1-browser'],text=True).strip()
failures=[]
try:
 subprocess.run([cli,'start',worker],check=True,stdout=subprocess.DEVNULL)
 with sync_playwright() as p:
  browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{9300+int(worker)}')
  context=browser.contexts[0]
  page=context.new_page()
  def route(r):
   if r.request.url=='http://127.0.0.1:4329/':r.fulfill(content_type='text/html',body='<html><style>'+fixture['css']+'</style><dialog id="detail"></dialog><script>'+fixture['js']+'</script></html>')
   else:r.abort()
  page.route('**/*',route)
  page.goto('http://127.0.0.1:4329/')
  page.bring_to_front()
  page.locator('[name=email]').fill('reader@example.test');page.locator('#account-email button[type=submit]').click()
  code=page.locator('#email-code');code.wait_for()
  cdp=context.new_cdp_session(page)
  cdp.send('Browser.grantPermissions',{'permissions':['clipboardReadWrite','clipboardSanitizedWrite'],'origin':'http://127.0.0.1:4329'})
  for text in [' 0123','Code 0123']:
   code.fill('');page.evaluate('(s)=>navigator.clipboard.writeText(s)',text);code.focus();page.keyboard.press('Meta+v')
   page.wait_for_timeout(150)
   actual=code.input_value();print(f'Chrome real clipboard paste {text!r}: {actual!r}',flush=True)
   if actual!='0123':failures.append(f'Paste {text!r}: expected 0123, got {actual!r}')
  if args.mode=='paste':
   assert not failures,'; '.join(failures)
  else:
   code.fill('0123');page.locator('#account-code button[type=submit]').click()
   page.locator('.terms-details summary').click();page.locator('[name=display_name]').fill('Alex');page.locator('[name=adult]').check();page.locator('[name=terms]').check();page.locator('#account-terms button[type=submit]').click()
   page.evaluate("async()=>{const b=document.createElement('button');b.dataset.home='10000000-0000-4000-8000-000000000001';await ui.click(b);}")
   page.locator('[data-room-tab=meet]').first.click();page.locator('.bring-add summary').wait_for()
   # Exercise every custom summary shape found in app sources, including those on other screens.
   import re
   root=test_dir.parent/'src'
   shapes=[]
   for path in sorted(root.glob('*.ts')):
    for tag in re.findall(r'<summary\b[^>]*>[^<]*',path.read_text()):
     if tag not in shapes:shapes.append(tag)
   for label in ['+ Add an item','Share, hosting, and safety']:
    s=page.locator('summary').filter(has_text=label).first
    style=s.evaluate("s=>({list:getComputedStyle(s).listStyleType,display:getComputedStyle(s).display,marker:getComputedStyle(s,'::-webkit-details-marker').display})")
    print(f'Meet summary {label!r}: {style}',flush=True)
    if style['list']!='none':failures.append(f'Default marker remains on {label}')
    for key in ['Enter','Space']:
     s.focus();before=s.evaluate('s=>s.parentElement.open');page.keyboard.press(key);after=s.evaluate('s=>s.parentElement.open')
     assert before!=after,f'{label} no longer toggles with {key}'
   # Use native details in a sandbox for remaining render variants, retaining their summary classes.
   for tag in shapes:
    if 'sr-only' in tag:continue # This intentionally hidden summary has a separate visible menu button.
    result=page.evaluate("tag=>{const d=document.createElement('details');d.innerHTML=tag+'</summary><p>Content</p>';document.querySelector('#detail').append(d);const s=d.firstElementChild;const r={tag,list:getComputedStyle(s).listStyleType};s.focus();r.focused=document.activeElement===s;return r;}",tag)
    print('Custom summary inventory:',result,flush=True)
    if result['list']!='none':failures.append('Default marker remains on '+tag)
    assert result['focused'],f'{tag} must receive native keyboard focus'
    for key in ['Enter','Space']:
     before=page.evaluate('()=>document.activeElement.parentElement.open');page.keyboard.press(key);after=page.evaluate('()=>document.activeElement.parentElement.open')
     assert before!=after,f'{tag} no longer toggles with {key}'
   print('PASS: Meet summaries and every visible custom summary variant toggle with Enter and Space',flush=True)
   assert not failures,'; '.join(failures)
  page.screenshot(path=str(base/f'chrome-{args.mode}-final.png'))
finally:
 subprocess.run([cli,'release',worker],check=True)
