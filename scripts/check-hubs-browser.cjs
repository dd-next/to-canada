/* Production-build browser acceptance. Requires Playwright and a Chromium executable.
 * NORTHWARD_BROWSER_BASE defaults to the local npm run preview URL.
 * Evidence is saved in dev/validation/services-immigration/ (never changes product data).
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.NORTHWARD_BROWSER_BASE || 'http://127.0.0.1:4173';
const output = process.env.NORTHWARD_BROWSER_EVIDENCE || 'dev/validation/services-immigration';
const report = {base, startedAt:new Date().toISOString(), checks:[], errors:[], screenshots:[]};
fs.mkdirSync(output,{recursive:true});
const catalogue=JSON.parse(fs.readFileSync('public/data/services/catalogue.json','utf8'));
const lmia=JSON.parse(fs.readFileSync('public/data/lmia/metadata.json','utf8'));
const programs=JSON.parse(fs.readFileSync('public/data/programs.json','utf8'));
const routes=['/services','/services/updates','/services/sources','/immigration/programs','/immigration/express-entry','/immigration/updates','/immigration/lmia'];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
 const context=await browser.newContext();
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 const requests=[];page.on('request',r=>requests.push(r.url()));
 const go=async route=>{const response=await page.goto(base+route);assert.equal(response.status(),200,route);await page.locator('h1').first().waitFor();await page.waitForLoadState('networkidle');};
 for(const width of [1440,768,375]){
  await page.setViewportSize({width,height:960});
  for(const route of routes){
   await go(route);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
   assert.equal(overflow,false,`${route} page overflow at ${width}`);
   const section=route.startsWith('/services')?'Services sections':'Immigration sections';
   assert.equal(await page.getByRole('navigation',{name:section,exact:true}).locator('a[aria-current="page"]').count(),1,route);
   assert.equal(await page.getByRole('navigation',{name:'Program groups',exact:true}).count(),route==='/immigration/programs'?1:0);
   if(width===1440){const active=page.getByRole('navigation',{name:'Primary',exact:true}).locator('a[aria-current="page"]');assert.equal(await active.innerText(),section.startsWith('Services')?'SERVICES':'IMMIGRATION');}
   const filename=`${route.slice(1).replaceAll('/','-')}-${width}.png`;
   await page.screenshot({path:path.join(output,filename)});report.screenshots.push(filename);
   report.checks.push(`${route}: ${width}px, current section and no page overflow`);
  }
 }
 await page.setViewportSize({width:1440,height:960});
 requests.length=0;
 await go('/services');
 assert.equal(requests.some(url=>url.includes('/data/lmia/')),false,'Services must not load LMIA data');
 assert.match(await page.locator('.services__count').innerText(),new RegExp(catalogue.meta.counts.current.toLocaleString('en-CA')));
 await page.getByRole('button',{name:'Next',exact:true}).click();await page.waitForURL(/svcPage=2/);
 await page.goBack();await page.waitForURL(/\/services$/);
 const category=catalogue.meta.categories[0];
 await page.getByLabel('Original category',{exact:true}).selectOption(category);await page.waitForURL(/svcCategory=/);
 assert.equal(await page.locator('.services__grid article').count(),Math.min(24,catalogue.entries.filter(e=>e.category===category&&e.state==='current').length));
 await page.getByLabel('Search services',{exact:true}).fill('zzzznoresultzzzz');await page.getByText('No services match',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear filters',exact:true}).first().click();
 assert.equal(new URL(page.url()).search,'');
 await page.locator('.services__grid a[href*="?service="]').first().click();await page.locator('.services__detail').waitFor();assert.ok(new URL(page.url()).searchParams.get('service'));
 await go('/services/updates');await page.getByRole('link',{name:'Initial catalogue import',exact:true}).click();await page.getByText(/affected entries/).waitFor();
 await go('/immigration?program='+programs[0].id+'#prog-'+programs[0].id);
 assert.equal(new URL(page.url()).pathname.endsWith('/immigration/programs'),true);assert.equal(new URL(page.url()).searchParams.get('program'),programs[0].id);assert.equal(new URL(page.url()).hash,'#prog-'+programs[0].id);
 assert.equal(await page.locator('.prog').count(),1);
 const anchorY=await page.locator('#prog-'+programs[0].id).evaluate(e=>e.getBoundingClientRect().top);assert.ok(anchorY>=100,`program anchor hidden: ${anchorY}`);
 await go('/updates?type=express_entry#main');assert.ok(page.url().includes('/immigration/updates?type=express_entry#main'));
 await go('/express-entry?legacy=1#crs-profile');assert.ok(page.url().includes('/immigration/express-entry?legacy=1#crs-profile'));
 const originalSearch=new URL(page.url()).search;
 const storageBefore=await page.evaluate(()=>JSON.stringify(localStorage));
 await page.getByLabel('Marital status',{exact:true}).selectOption('single');await page.getByLabel('How old are you?',{exact:true}).selectOption('29');
 assert.equal(new URL(page.url()).search,originalSearch);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storageBefore);
 await page.getByRole('navigation',{name:'Immigration sections',exact:true}).getByRole('link',{name:'IRCC Updates',exact:true}).click();
 await page.getByRole('navigation',{name:'Immigration sections',exact:true}).getByRole('link',{name:'EE Calculator',exact:true}).click();assert.equal(await page.getByLabel('How old are you?',{exact:true}).inputValue(),'');
 await page.getByLabel('How old are you?',{exact:true}).selectOption('30');await page.reload();await page.getByLabel('How old are you?',{exact:true}).waitFor();assert.equal(await page.getByLabel('How old are you?',{exact:true}).inputValue(),'');
 report.checks.push('Full Services counts/category/search/reset/page history/stable detail; initial import drilldown; old links preserve query/hash; CRS answers never persist or enter URLs');
 if(lmia.periods.length){await go('/immigration/lmia?period=all');await page.locator('.lmia__results-heading').waitFor();assert.match(await page.locator('.lmia__results-heading').innerText(),new RegExp(lmia.coverage.rowCount.toLocaleString('en-CA')));await page.getByLabel('Employer search',{exact:true}).fill('zzzznoresultzzzz');await page.getByText('No records match these filters',{exact:true}).waitFor();report.checks.push('LMIA all-period exact row count and empty filter');}
 for(const route of ['/','/compare?compare=toronto,vancouver','/budget?place=toronto','/insights','/place/toronto','/place/edmonton/neighbourhoods','/place/calgary/neighbourhoods','/place/toronto/neighbourhoods','/place/vancouver/neighbourhoods']){await go(route);report.checks.push(`${route}: existing page loads`);}
 await page.setViewportSize({width:375,height:812});await go('/services');await page.getByRole('button',{name:'Menu',exact:true}).click();assert.equal(await page.getByRole('navigation',{name:'Primary (mobile)',exact:true}).getByRole('link',{name:'Services',exact:true}).getAttribute('aria-current'),'page');await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded'),'false');
 await page.keyboard.press('Tab');const focused=await page.evaluate(()=>document.activeElement.tagName);assert.notEqual(focused,'BODY');report.checks.push('Mobile menu current page, Escape and keyboard focus');
 const errorPage=await context.newPage();await errorPage.route('**/data/services/catalogue.json',route=>route.fulfill({status:503,body:'unavailable'}));await errorPage.goto(base+'/services');await errorPage.getByText('The Services catalogue could not be loaded',{exact:true}).waitFor();report.checks.push('Services network failure gives readable error state');await errorPage.close();
 assert.deepEqual(report.errors,[],'browser runtime errors');
 report.finishedAt=new Date().toISOString();report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;throw error;}finally{fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,screenshots:report.screenshots.length,output}));
})().catch(error=>{console.error(error);process.exitCode=1;});
