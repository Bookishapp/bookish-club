from pathlib import Path
import hashlib,json,plistlib,subprocess,sys
ipa=Path(sys.argv[1]).resolve()
tree=ipa.parent/'verified-tree'
if tree.exists():raise SystemExit('Use a fresh extraction directory')
subprocess.run(['ditto','-xk',str(ipa),str(tree)],check=True,capture_output=True)
app=tree/'Payload/App.app'
info=plistlib.loads((app/'Info.plist').read_bytes())
assert info['CFBundleIdentifier']=='com.meetbookish.app'
assert info.get('TFInternalTestingOnly') is True
assert info['CFBundleShortVersionString']=='1.1' and info['CFBundleVersion']=='4'
assert sorted(p.name for p in (app/'PlugIns').iterdir())==['BookishStickers.appex']
manifest=plistlib.loads((app/'PrivacyInfo.xcprivacy').read_bytes())
assert manifest['NSPrivacyTracking'] is False
assert len(manifest['NSPrivacyCollectedDataTypes'])==8
for row in manifest['NSPrivacyCollectedDataTypes']:
 assert row['NSPrivacyCollectedDataTypeLinked'] is True and row['NSPrivacyCollectedDataTypeTracking'] is False
public=app/'public'
assert json.loads((public/'data/clubs.json').read_text())==[]
assert json.loads((public/'data/community.json').read_text())=={'national':[],'city':[],'state':[],'next':[]}
for file in public.glob('assets/*.js'):
 text=file.read_text();assert 'local-access-fixture' not in text and 'local-refresh-fixture' not in text
 assert 'bookish-auth' in text and 'bookish-delete-account' in text
 source=Path('app/dist/assets')/file.name
 assert source.exists() and source.read_bytes()==file.read_bytes()
for bundle in [app,app/'PlugIns/BookishStickers.appex']:
 bi=plistlib.loads((bundle/'Info.plist').read_bytes());assert bi['CFBundleVersion']=='4' and bi['CFBundleShortVersionString']=='1.1'
 profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(bundle/'embedded.mobileprovision')],stderr=subprocess.DEVNULL))
 assert profile['Entitlements']['application-identifier']=='L8YGD7ATLL.'+bi['CFBundleIdentifier']
 ent=plistlib.loads(subprocess.check_output(['codesign','-d','--entitlements',':-',str(bundle)],stderr=subprocess.DEVNULL))
 assert ent['application-identifier']=='L8YGD7ATLL.'+bi['CFBundleIdentifier'] and not ent.get('get-task-allow',False)
result=subprocess.check_output(['python3','/Users/vahallo/ted-ops/ted-board/jobs/card-c-bookish-submit-1023/verify_bundle_signature_identifiers.py',str(app)],text=True)
record={'ipa':str(ipa),'sha256':hashlib.sha256(ipa.read_bytes()).hexdigest(),'version':'1.1','build':'4','shipped_extensions':['BookishStickers.appex'],'privacy_categories':8,'testflight_internal_only':True,'no_bundled_clubs':True,'web_bundle_matches_final_build':True,'signature_verification':json.loads(result)}
Path('.ted/IPA-VERIFICATION.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
