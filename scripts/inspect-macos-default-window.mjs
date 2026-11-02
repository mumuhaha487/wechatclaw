import fs from 'node:fs/promises';import path from 'node:path';import {execFile}from'node:child_process';import{promisify}from'node:util';
const run=promisify(execFile),text=(await fs.readFile('.github/workflows/macos-official-browser.yml','utf8')).replaceAll('\r\n','\n');
const section=text.indexOf('      - name: Run the product Swift Host with the packaged frontend and real empty backend');
const marker="          node --input-type=module <<'NODE'\n",begin=text.indexOf(marker,section)+marker.length,end=text.indexOf('\n          NODE',begin);
if(section<0||begin<marker.length||end<0)throw Error('The current production Host check could not be extracted');
let body=text.slice(begin,end).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
body=body.replace('await fs.mkdir(base,{recursive:true});','await fs.mkdir(base,{recursive:true});await fs.mkdir(proof,{recursive:true});');
const setup=body.indexOf('const built=JSON.parse('),setupEnd=body.indexOf("const source=await fs.readFile('native/macos/QQClaw.swift'",setup);
if(setup<0||setupEnd<0)throw Error('Host packaging setup was not found');
body=body.slice(0,setup)+[
"const app=path.join(base,'QQClaw.app');await run('/usr/bin/ditto',[process.env.QQCLAW_INSPECTION_APP,app]);",
"const resources=path.join(app,'Contents/Resources'),binary=path.join(app,'Contents/MacOS/QQClaw');"
].join('\n')+'\n'+body.slice(setupEnd);
const oldCall="const popupResult=await call('await tab.playwright.getByRole(\"link\",{name:\"Open owned popup\",exact:true}).click();nodeRepl.write(await browser.tabs.list())');";
const newCall="const popupResult=await call('var created=await browser.tabs.new();await created.goto('+JSON.stringify(address+'popup')+');nodeRepl.write(await browser.tabs.list());nodeRepl.emitImage(await created.screenshot({fullPage:false}))');";
if(!body.includes(oldCall))throw Error('The original extension operation was not found');body=body.replace(oldCall,newCall);
const point='print("HOST_OFFICIAL_BINDING_PASS")';if(!body.includes(point))throw Error('The native inspection point was not found');
const dump=[
'func describe(_ view:NSView,_ depth:Int=0)->[String:Any] {',
'  var item:[String:Any]=["class":NSStringFromClass(type(of:view)),"frame":NSStringFromRect(view.frame),"bounds":NSStringFromRect(view.bounds),"hidden":view.isHidden,"autoresizingMask":view.autoresizingMask.rawValue,"windowNumber":view.window?.windowNumber ?? -1]',
'  if depth<9 { item["children"]=view.subviews.prefix(30).map{describe($0,depth+1)} };return item',
'}',
'let nativeWindows=NSApp.windows.map{window->[String:Any] in',
'  var item:[String:Any]=["class":NSStringFromClass(type(of:window)),"number":window.windowNumber,"title":window.title,"visible":window.isVisible,"frame":NSStringFromRect(window.frame),"root":window === runtime.window,"firstResponderClass":window.firstResponder.map{NSStringFromClass(type(of:$0))} ?? ""]',
'  if let view=window.contentView { item["view"]=describe(view) };return item',
'}',
'let rawTabs=try runtime.control(["action":"tabs"])',
'try jsonData(["inspectionOnly":true,"runtime":runtime.state,"tabs":rawTabs,"windows":nativeWindows]).write(to:URL(fileURLWithPath:ProcessInfo.processInfo.environment["QQCLAW_WINDOW_REPORT"]!),options:.atomic)',
'print("NORMAL_WINDOW_DIAGNOSTICS_SAVED")'
].join('\n');
body=body.replace(point,point+'\n'+dump);
body=body.replace("scope:'Production prepareOfficialBrowser with the actual Swift Host profile, packaged original runtime, copied original host, original identity API and actual link click opening a popup. No model or WeChat.'","scope:'Inspection: original browser.tabs.new creates a native Chrome window. No embedding success is implied; no model or WeChat.'");
body=body.replace("QQCLAW_HOST_RESULT:path.join(proof,'host-preview.json')","QQCLAW_HOST_RESULT:path.join(proof,'host-preview.json'),QQCLAW_WINDOW_REPORT:path.join(proof,'window-hierarchy.json')");
const oldCatch="catch(error){await fs.writeFile(path.join(proof,'host-preview.log'),(error.stdout||'')+(error.stderr||'')+'\\n'+error.message);throw error;}";
const newCatch="catch(error){await fs.writeFile(path.join(proof,'host-preview.log'),(error.stdout||'')+(error.stderr||'')+'\\n'+error.message);const report=JSON.parse(await fs.readFile(path.join(proof,'window-hierarchy.json'),'utf8'));if(!report.inspectionOnly||!report.windows?.length)throw error;await fs.writeFile(path.join(proof,'inspection-result.json'),JSON.stringify({inspectionCompleted:true,productEmbeddingPassed:false,error:error.message,scope:'Owned native windows and view hierarchy after original official browser.tabs.new; not a product acceptance pass.'},null,2));}";
if(!body.includes(oldCatch))throw Error('The expected native result boundary was not found');body=body.replace(oldCatch,newCatch);
const script=path.join(process.cwd(),'.inspect-macos-default-window.generated.mjs');await fs.writeFile(script,body);await import('node:url').then(({pathToFileURL})=>import(pathToFileURL(script).href));
