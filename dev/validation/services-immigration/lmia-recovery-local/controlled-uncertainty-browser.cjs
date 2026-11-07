const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require('playwright');
const dir='dev/validation/services-immigration/lmia-recovery-local';
const base='http://127.0.0.1:4177';
const meta=JSON.parse(fs.readFileSync('public/data/lmia/metadata.json','utf8'));
const resource=meta.resources.find(r=>r.period?.id==='2016');
const period={...meta.periods.find(p=>p.id==='2016'),rowCount:2};
const columns=['id','employer','address','province','provinceLabel','stream','occupationCode','occupationTitle','nocVersion','approvedLmias','approvedPositions','employerLocationId','incorporation'];
const partition={schemaVersion:1,resourceId:resource.id,periodId:period.id,columns,rows:[
 [resource.id+':fixture-named','Fixture Caf\u00e9\u0090 Inc.','Fixture Street','ON','Ontario','Fixture stream','0631','Fixture occupation','2011',null,3,'loc-fixture-named',null],
 [resource.id+':fixture-unnamed','(blank)','Fixture address','ON','Ontario',null,null,null,null,null,2,'loc-fixture-unnamed',null]
]};
const fixtureMeta={...meta,periods:[period],resources:[{...resource,rows:2}],coverage:{...meta.coverage,rowCount:2,periodCount:1,start:period.start,end:period.end},facets:{provinces:[{code:'ON',label:'Ontario'}],nocVersions:['2011'],streams:['Fixture stream']}};
const report={kind:'Controlled browser responses against the production build; never published as source data',startedAt:new Date().toISOString(),checks:[],errors:[]};
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const p=await b.newPage({viewport:{width:375,height:960}});p.on('pageerror',e=>report.errors.push(e.message));
  await p.route('**/data/lmia/metadata.json',r=>r.fulfill({json:fixtureMeta}));
  await p.route('**/data/lmia/periods/*.json',r=>r.fulfill({json:partition}));
  await p.goto(base+'/immigration/lmia');await p.locator('.lmia__results-heading').waitFor();
  assert.match(await p.locator('.lmia__results-heading').innerText(),/^2 matching records/i);
  assert.equal(await p.locator('.lmia__totals > div').first().locator('dd').innerText(),'1');
  assert.equal(await p.locator('.lmia__totals > div').nth(2).locator('dd').innerText(),'5');
  const unknown=p.locator('.lmia-record').filter({has:p.getByRole('heading',{name:'Employer not published',exact:true})});
  assert.equal(await unknown.getByRole('link',{name:'History for this name and address',exact:true}).count(),0);
  assert.equal(await p.getByRole('link',{name:'History for this name and address',exact:true}).count(),1);
  await unknown.locator('summary').click();await unknown.getByText('Publisher name: (blank)',{exact:true}).waitFor();
  report.checks.push('Unnamed row retains approvals/source label, is counted separately and has no inferred history action');
  const named=p.locator('.lmia-record').filter({has:p.getByRole('heading',{name:'Fixture Caf\u00e9\\x90 Inc.',exact:true})});
  await named.locator('summary').click();await named.getByText(/no character has been guessed/).waitFor();
  assert.equal(/[\u0081\u008d\u008f\u0090\u009d]/.test(await named.innerText()),false);
  await named.scrollIntoViewIfNeeded();await p.screenshot({path:dir+'/controlled-uncertainty-375.png'});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  report.checks.push('Undefined source byte is visible as an explicit escape with its explanation and no mobile overflow');
  await p.goto(base+'/immigration/lmia?period=all&employerLocation=loc-fixture-unnamed');
  await p.getByText('No records match these filters',{exact:true}).waitFor();
  report.checks.push('Crafted unnamed-employer history URL cannot infer an entity');
  const dataError=await b.newPage();
  await dataError.route('**/data/lmia/metadata.json',r=>r.fulfill({json:fixtureMeta}));
  await dataError.route('**/data/lmia/periods/*.json',r=>r.fulfill({status:503,body:'Controlled unavailable source'}));
  await dataError.goto(base+'/immigration/lmia');
  await dataError.getByText('The selected history could not be fully loaded',{exact:true}).waitFor();
  assert.equal(await dataError.locator('.lmia__totals').count(),0);
  report.checks.push('Unavailable period shows a readable failure and no partial totals');
  const metadataError=await b.newPage();
  await metadataError.route('**/data/lmia/metadata.json',r=>r.fulfill({status:503,body:'Controlled unavailable metadata'}));
  await metadataError.goto(base+'/immigration/lmia');
  await metadataError.getByText('LMIA history could not be loaded',{exact:true}).waitFor();
  report.checks.push('Unavailable metadata shows the official-source fallback');
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;throw e;}
 finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(dir+'/controlled-uncertainty-report.json',JSON.stringify(report,null,2)+'\n');await b.close();}
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,kind:report.kind}));
})().catch(e=>{console.error(e);process.exitCode=1});
