const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.REAL_TEST_SITE_DIR || '/tmp/real-site';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.join(root, url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
  fs.readFile(file, (err, data) => { if (err) {res.writeHead(404);res.end();return;} res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data); });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100},colorScheme:'dark'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await page.clock.setFixedTime(new Date('2026-10-28T08:00:00Z'));
    await page.goto(base+'/real/');
    const visible=()=>page.locator('[data-candidate]:visible').count();
    assert.equal(await visible(),6);
    assert.equal(await page.getByText('Opening / listed price', {exact:true}).count(),2);
    assert.match(await page.locator('#snapshot-age').textContent(),/Stale snapshot/);
    assert.equal(await page.locator('button.real-outbound:disabled').count(),4);
    assert.deepEqual(await page.locator('a.real-outbound').evaluateAll(links=>links.map(a=>a.href).sort()), ['https://www.realapp.com/xAtWFEFKQmWLQ','https://www.realapp.com/yPt1FvFyDQkGq']);
    await page.screenshot({path:'/tmp/real-desktop.png',fullPage:true});
    await page.selectOption('#sport','NFL');assert.equal(await visible(),3);
    await page.selectOption('#tier','Mystic');assert.equal(await visible(),0);
    assert.equal(await page.locator('#empty').isVisible(),true);
    await page.click('#clear-empty');await page.waitForTimeout(20);assert.equal(await visible(),6);
    await page.selectOption('#price','10000');assert.equal(await visible(),2);
    await page.selectOption('#price','');await page.selectOption('#status','Fair price');assert.equal(await visible(),1);
    assert.match(await page.locator('[data-candidate]:visible').textContent(),/Stephen Curry/);
    await page.selectOption('#status','Above budget');assert.equal(await visible(),0);
    await page.fill('#budget','10000');assert.equal(await visible(),4);
    await page.selectOption('#status','');assert.equal(await visible(),6);
    assert.equal(await page.locator('.above').count(),4);
    await page.click('button[type=reset]');await page.waitForTimeout(20);
    assert.equal(await page.locator('.above').count(),0);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
      if(width===390)await page.screenshot({path:'/tmp/real-mobile.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);
    assert.match(await page.locator('meta[name=robots]').getAttribute('content'),/noindex/);
    for(const file of ['sitemap.xml','index.xml','index.html','sports/index.html'])assert(!fs.readFileSync(path.join(root,file),'utf8').includes('gavinwarner.digital/real'),`discovery in ${file}`);
    const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(base+'/real/');assert.equal(await nojs.locator('[data-candidate]').count(),6);await nojs.close();
    console.log('PASS: filters, budget, reset, empty/stale states, disabled unverified links, noindex/discovery, no-JS fallback and 320/390/768/1440 widths');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
