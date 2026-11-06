import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.INBOX_PLAYWRIGHT || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const version=process.argv[2];
if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version??''))throw new Error('Expected a DSH test version');
const base=pathToFileURL(resolve(process.env.INBOX_TEST_DIR || '.') + '/');
const log=await fs.readFile(new URL(version+'.log',base),'utf8');
const url=log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0];
assert.ok(url,'Isolated host must start successfully');
const errors=[];
const consoleErrors=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.INBOX_BROWSER_PATH});
const page=await browser.newPage({viewport:{width:1280,height:820},locale:'zh-CN'});
// Intercepting the document can make Chromium classify it as a public response.
await page.context().grantPermissions(['local-network-access'],{origin:new URL(url).origin});
await page.addLocatorHandler(page.getByRole('button',{name:'稍后配置',exact:true}),async locator=>{await locator.click();});
await page.addLocatorHandler(page.getByText('开始使用',{exact:true}),async()=>{await page.keyboard.press('Escape');});
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
await page.route(u=>u.href.includes('dsh-session-inbox/client.js'),async route=>{
 const response=await route.fetch();
 let body=await response.text();
 body=body.replace('return () => { unsubscribe?.();', 'return window.__inboxTestRelease = () => { unsubscribe?.();');
 await route.fulfill({response,body});
});
await page.route(u=>u.pathname==='/',async route=>{
 const response=await route.fetch();let body=await response.text();
 assert.ok(body.includes('inboxInstallShell(ctx);'));
 body=body.replaceAll('inboxInstallShell(ctx);','window.__inboxTestContext=ctx; inboxInstallShell(ctx);');
 body=body.replaceAll('const h = react.createElement;', 'window.__inboxPrimitiveTypes=Object.fromEntries(["Menu","HoverCard","HoverCardGroup","Modal","Button"].map(name=>[name,typeof _deepseek_ai_dsh_client_ui_primitives[name]])); const h = react.createElement;');
 body=body.replaceAll('const list = props.useSessions(snapshot => snapshot);','const rawList = props.useSessions(snapshot => snapshot); const list = react.useMemo(() => ({...rawList, byId: Object.fromEntries(Object.entries(rawList.byId).map(([id,row]) => [id,{...row,blank:false}]))}),[rawList]);');
 await route.fulfill({response,body});
});
const report={version,plugin:'0.5.0',platform:process.platform,browser:browser.version(),scope:'Real isolated official DSH Web runtime and headless Chromium browser; empty fixture sessions presented as nonblank in the workbench only; no model API calls',checks:[]};
const check=(name)=>{report.checks.push(name);console.log(version+' PASS '+name);};
let stage='startup';
try {
 await page.goto(url);
 await page.waitForFunction(()=>Boolean(window.__inboxTestContext));
 assert.equal(await page.evaluate(()=>window.__DSH_SESSION_INBOX_HOST__?.version),version);
 const welcome=page.getByRole('button',{name:'继续',exact:true});
 if(await welcome.waitFor({timeout:1800}).then(()=>true,()=>false)){await welcome.click();await welcome.waitFor({state:'hidden'});}
 await page.waitForTimeout(500);await page.keyboard.press('Escape');
 await page.locator('.dsi-root').waitFor({timeout:10000});
 check('current native module enhanced and workbench mounted');
 report.primitiveTypes=await page.evaluate(()=>window.__inboxPrimitiveTypes);
 stage='fixture';
 const sessions=await page.evaluate(async fixtureBase=>{
  const ctx=window.__inboxTestContext;await ctx.sessions.refresh();
  const rows=[];
  for(const [suffix,title] of [['a','兼容验收 A'],['b','兼容验收 B'],['c','兼容验收 C']]){
   const result=await ctx.sessions.create({cwd:fixtureBase+'/fixture-'+suffix});
   const id=typeof result==='string'?result:result.id;
   await ctx.sessions.using(id,{source:'workspaceOperation'},ref=>ref.binding.session.rename(title));
   await ctx.sessions.refreshProjections(id);rows.push({id,title});
  }
  await ctx.sessions.refresh();return rows;
 },fileURLToPath(base));
 const [a,b,c]=sessions;assert.equal(new Set(sessions.map(x=>x.id)).size,3);
 const row=id=>page.locator(`[data-inbox-session-id="${id}"]`);
 await row(a.id).waitFor();check('native create, rename and metadata refresh');
 const shell=await page.evaluate(()=>{
  const style=document.querySelector('style[data-plugin-css="@deepseek-ai/dsh-client-ui-sidebar/SidebarRoot.module.css"]');
  const name=style.textContent.match(/\.([_a-zA-Z][-\w]*_root)(?![-\w])/)[1];
  return {display:getComputedStyle(document.querySelector('.'+name)).display,unresolved:document.querySelector('style[data-inbox-shell]').textContent.includes('.dsi-shell-')};
 });assert.deepEqual(shell,{display:'grid',unresolved:false});
 const icon=await row(a.id).locator('.dsi-row-action svg').evaluate(el=>({width:el.getAttribute('width'),stroke:el.getAttribute('stroke-width')}));
 assert.deepEqual(icon,{width:'16',stroke:'1.5'});check('native shell aliases and rounded icons');
 stage='menus';
 for(const input of ['button','right click','Shift+F10']){
  if(input==='button')await row(a.id).locator('.dsi-icon-button').click();
  else if(input==='right click')await row(a.id).click({button:'right'});
  else {await row(a.id).focus();await page.keyboard.press('Shift+F10');}
  await page.getByRole('menuitem',{name:/重命名/}).waitFor({timeout:4000});
  assert.ok(await page.getByRole('menuitem',{name:/归档/}).count());
  await page.keyboard.press('Escape');await page.getByRole('menuitem',{name:/重命名/}).waitFor({state:'hidden'});
  check('native session menu: '+input);
 }
 stage='search';
 const search=page.locator('.dsi-search input');
 await search.fill('兼容验收 B');await row(b.id).waitFor();assert.equal(await row(a.id).count(),0);
 await search.fill('');await row(a.id).waitFor();check('search and clear');
 stage='undo';
 const toolbarBefore=await page.locator('.dsi-search').boundingBox();
 await row(a.id).locator('.dsi-row-action').click();const toast=page.locator('.dsi-toast');await toast.waitFor();
 assert.equal(await toast.locator('.dsi-toast-message').textContent(),'已整理');
 assert.deepEqual(await page.locator('.dsi-search').boundingBox(),toolbarBefore);
 await toast.hover();await page.waitForTimeout(5200);assert.ok(await toast.isVisible());
 await toast.getByRole('button',{name:'撤销',exact:true}).focus();await page.mouse.move(1000,100);await page.waitForTimeout(400);assert.ok(await toast.isVisible());
 await toast.getByRole('button',{name:'撤销',exact:true}).click();await toast.waitFor({state:'hidden'});
 await row(a.id).waitFor();assert.equal(await row(a.id).getAttribute('data-inbox-category'),'active');
 check('floating undo, no layout shift, hover and focus pauses');
 await row(a.id).locator('.dsi-open').focus();await page.keyboard.press('Shift+Enter');await toast.waitFor();
 await page.mouse.move(1000,100);await toast.waitFor({state:'hidden',timeout:6500});check('keyboard settle and timed dismissal');
 stage='persistence';
 await page.reload();await page.locator('.dsi-root').waitFor();await page.waitForFunction(()=>Boolean(window.__inboxTestContext));
 await page.waitForTimeout(600);await page.keyboard.press('Escape');
 assert.equal(await row(a.id).count(),0);await row(b.id).waitFor();
 const shelf=page.locator('.dsi-section-head').filter({hasText:'已整理'});await shelf.click();await row(a.id).waitFor();
 assert.equal(await row(a.id).getAttribute('data-inbox-category'),'settled');
 await row(a.id).locator('.dsi-row-action').click();await row(a.id).waitFor();
 assert.equal(await row(a.id).getAttribute('data-inbox-category'),'active');check('settled state survives reload and restores');
 stage='backup';
 await row(a.id).locator('.dsi-row-action').click();
 await page.getByRole('button',{name:'列表显示选项'}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('menuitem',{name:'导出整理备份…',exact:true}).click();
 const download=await downloadPromise;
 const backup=await fs.readFile(await download.path());
 assert.equal(JSON.parse(backup).state.settled[a.id]!==undefined,true);
 await page.getByRole('button',{name:'撤销',exact:true}).count().then(async count=>{if(count)await page.getByRole('button',{name:'撤销',exact:true}).click();});
 if(await row(a.id).count()===0)await shelf.click();
 if(await row(a.id).getAttribute('data-inbox-category')==='settled')await row(a.id).locator('.dsi-row-action').click();
 await page.getByLabel('选择整理备份文件').setInputFiles({name:'matrix-backup.json',mimeType:'application/json',buffer:backup});
 await page.getByRole('button',{name:'合并恢复',exact:true}).click();
 await page.locator('.dsi-toast-message').filter({hasText:'备份已合并'}).waitFor();
 check('backup export and merge preview');
 if(await row(a.id).count()===0)await shelf.click();
 await row(a.id).locator('.dsi-row-action').click();await row(a.id).waitFor();
 stage='original layout';
 for(const size of [{width:1280,height:820},{width:1471,height:1200}]){
  await page.setViewportSize(size);await page.getByRole('button',{name:'一键切回原布局'}).click();
  await page.getByRole('button',{name:'切到会话工作台'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.inboxMode),'original');
  await page.getByRole('button',{name:'切到会话工作台'}).click();await row(a.id).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.inboxMode),'inbox');
 }
 check('original layout round trip at both viewport sizes');
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.equal(await page.locator('.dsi-notice[role=alert]').count(),0);
 check('no browser errors or workbench fallback');
 stage='lifecycle fallback';
 await page.getByRole('button',{name:'一键切回原布局'}).click();
 const nativeBaseline=await page.locator('.dsi-original').evaluate(root=>{
   const element=root.firstElementChild;
   return {selector:element.tagName.toLowerCase()+[...element.classList].map(name=>'.'+CSS.escape(name)).join(''),text:element.innerText};
 });
 assert.ok(nativeBaseline.text.trim(),'Native browser controls must be present');
 await page.getByRole('button',{name:'切到会话工作台'}).click();
 const sheets=()=>page.evaluate(()=>[...document.querySelectorAll('style[data-plugin-css]')].map(s=>[s.dataset.pluginCss,s.textContent]));
 const beforeSheets=await sheets();
 await page.evaluate(()=>window.__inboxTestRelease());
 await page.locator('.dsi-root').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.inboxMode),'original');
 assert.deepEqual(await sheets(),beforeSheets);
 assert.equal(await page.evaluate(()=>window.__DSH_SESSION_INBOX_BRIDGE__.enabled),false);
 await page.getByRole('button',{name:'切到会话工作台'}).waitFor({state:'hidden'});
 await page.locator(nativeBaseline.selector).waitFor();
 assert.equal(await page.locator(nativeBaseline.selector).innerText(),nativeBaseline.text);
 await page.evaluate(()=>{window.__inboxTestReactivated=window.__DSH_SESSION_INBOX_BRIDGE__.activate();});
 await page.locator('.dsi-root').waitFor();
 check('effect disposal restores native list and CSS; reactivation restores workbench');
 stage='changed native source';
 report.changedNativeAssets=0;
 await page.route('**/*',async route=>{
   if(route.request().resourceType()!=='script')return route.fallback();
   const response=await route.fetch();
   if(!(response.headers()['content-type']??'').includes('javascript'))return route.fulfill({response});
   let body=await response.text();
   // DSH may deliver application modules in a batch rather than individual URLs.
   const owner=body.indexOf('id: "@deepseek-ai/dsh-client-ui-workspace"');
   if(owner>=0){
     const hook=body.indexOf('exports.apply = apply;',owner);
     assert.ok(hook>owner);
     body=body.slice(0,hook)+'/* simulated future native revision */ '+body.slice(hook);
     report.changedNativeAssets++;
   }
   await route.fulfill({response,body});
 });
 await page.reload();
 await page.waitForFunction(()=>window.__DSH_SESSION_INBOX_BRIDGE__?.reason==='native-factory-changed');
 assert.ok(report.changedNativeAssets>0,'The actual current native module must have changed');
 await page.getByText('会话工作台暂用 DSH 原生列表',{exact:true}).waitFor();
 await page.locator(nativeBaseline.selector).waitFor();
 await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.innerText===text,nativeBaseline,{timeout:10000});
 assert.equal(await page.locator('.dsi-root').count(),0);
 assert.equal(await page.evaluate(()=>window.__DSH_SESSION_INBOX_BRIDGE__.enabled),false);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 check('changed native factory falls back to the current native list without browser errors');
 report.passed=true;
}catch(error){
 report.passed=false;report.stage=stage;report.error=error.stack;process.exitCode=1;
 console.error(version+' FAIL '+stage+' '+error.message);
 console.log('CONSOLE '+JSON.stringify(consoleErrors));
 console.log((await page.locator('body').innerText()).slice(0,1800));
 await page.screenshot({path:new URL(version+'-failure.png',base).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
}finally{
 report.browserErrors=errors;
 report.consoleErrors=consoleErrors;
 await fs.writeFile(new URL(version+'-verification.json',base),JSON.stringify(report,null,2));
 await page.unrouteAll({behavior:'ignoreErrors'});
 await browser.close();
}
