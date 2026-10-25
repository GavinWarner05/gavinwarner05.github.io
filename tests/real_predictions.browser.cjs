const { chromium } = require('playwright');
const fs = require('node:fs');const http = require('node:http');const path = require('node:path');const assert = require('node:assert/strict');
const root=process.env.REAL_TEST_SITE_DIR||'/tmp/real-predictions-preview';
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=path.join(root,url.pathname,url.pathname.endsWith('/')?'index.html':'');fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];const requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),body:r.postData()}));
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await page.clock.setFixedTime(new Date('2026-10-25T16:00:00Z'));await page.goto(base+'/real/predictions/',{waitUntil:'networkidle'});
 const input=page.locator('#paper-balance');const text=key=>page.locator(`[data-${key}]`).textContent();const fixed=await page.locator('[data-frozen-ledger]').allTextContents();
 assert.equal(await input.inputValue(),'');assert.equal(await text('budget'),'—');assert.equal(await page.locator('[data-pick]:visible').count(),7);
 assert.equal(await page.locator('form').count(),0);assert.match(await page.locator('meta[name=robots]').getAttribute('content'),/noindex/);
 const before=requests.length;const url=page.url();
 await input.fill('10000');assert.equal(await text('budget'),'100 Rax');assert.equal(await text('allocated'),'98 Rax');assert.equal(await text('loss'),'98 Rax');assert.equal(await text('unused'),'2 Rax');
 assert.equal(await page.locator('[data-pick=okc] [data-pick-allocation]').textContent(),'14 Rax');assert.equal(await page.locator('[data-pick=okc] [data-pick-return]').textContent(),'15.68 Rax');
 await input.press('Enter');assert.equal(page.url(),url);
 await page.locator('[data-pick=okc] [data-include]').uncheck();assert.equal(await text('allocated'),'96 Rax');await page.locator('[data-pick=okc] [data-include]').check();
 await page.locator('[data-portfolio-button=value]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-pick]:visible').count(),2);assert.equal(await page.locator('[data-pick=min]').isVisible(),false);assert.equal(await page.locator('[data-pick=nyk]').isVisible(),false);
 assert.equal(await text('allocated'),'100 Rax');assert.equal(await page.locator('[data-pick=tor] [data-pick-return]').textContent(),'124 Rax');assert.equal(await page.locator('[data-pick=orl] [data-pick-return]').textContent(),'210 Rax');
 await page.locator('[data-pick=tor] [data-include]').uncheck();assert.equal(await page.locator('[data-pick=orl] [data-pick-allocation]').textContent(),'100 Rax');
 await page.selectOption('#paper-rate','25');assert.equal(await text('budget'),'25 Rax');assert.equal(await text('allocated'),'25 Rax');
 await page.locator('[data-pick=orl] [data-include]').uncheck();assert.equal(await text('allocated'),'0 Rax');assert.equal(await text('unused'),'25 Rax');
 await page.locator('[data-portfolio-button=diagnostic]').click();await page.selectOption('#paper-rate','100');
 for(const invalid of ['-1','NaN','Infinity','1e9','12.5','1000000000001']){await input.fill(invalid);assert.equal(await text('budget'),'—');assert.equal(await input.getAttribute('aria-invalid'),'true');}
 await input.fill('');assert.equal(await text('budget'),'—');assert.equal(await input.getAttribute('aria-invalid'),'false');
 for(const tiny of ['0','1','99']){await input.fill(tiny);assert.equal(await text('allocated'),'0 Rax');assert.equal(await text('budget'),'0 Rax');}
 await input.fill('100');assert.equal(await text('budget'),'1 Rax');assert.equal(await text('allocated'),'0 Rax');assert.equal(await text('unused'),'1 Rax');
 await input.fill('1000000000000');assert.equal(await text('budget'),'10,000,000,000 Rax');assert.equal(await text('allocated'),'9,999,999,996 Rax');assert.equal(await text('unused'),'4 Rax');
 await input.fill('10000');await page.selectOption('#paper-rate','0');assert.equal(await text('allocated'),'0 Rax');await page.selectOption('#paper-rate','100');
 assert.deepEqual(await page.locator('[data-frozen-ledger]').allTextContents(),fixed);
 assert.equal(requests.length,before);assert.equal(page.url(),url);assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
 await page.locator('[data-pick=okc] summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('details[open]').count(),1);await page.keyboard.press('Enter');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);if(width===390)await page.screenshot({path:'/tmp/predictions-mobile.png',fullPage:true});}
 await page.screenshot({path:'/tmp/predictions-desktop.png',fullPage:true});
 await page.clock.setFixedTime(new Date('2026-10-25T21:01:00Z'));await input.fill('10001');assert.equal(await page.locator('[data-pick=lal] [data-include]').isDisabled(),true);assert.match(await page.locator('[data-pick=lal] [data-game-state]').textContent(),/Started/);assert.equal(await text('allocated'),'96 Rax');
 await page.clock.setFixedTime(new Date('2026-10-26T02:00:00Z'));await input.fill('10000');assert.equal(await text('allocated'),'0 Rax');assert.equal(await text('unused'),'100 Rax');assert.match(await page.locator('[data-freshness]').textContent(),/Stale/);assert.deepEqual(await page.locator('[data-frozen-ledger]').allTextContents(),fixed);
 assert.deepEqual(errors,[]);
 for(const file of ['sitemap.xml','index.xml','index.html','sports/index.html'])assert(!fs.readFileSync(path.join(root,file),'utf8').includes('/real/predictions/'));
 const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(base+'/real/predictions/');assert.equal(await nojs.locator('[data-pick]:visible').count(),9);await nojs.close();
 console.log('PASS: fixed ledger totals, separate opposing portfolios, allocations/rounding/invalid/large inputs, selected picks, started/stale states, keyboard, no form submission or balance network/storage/URL transmission, mobile widths and noindex.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
