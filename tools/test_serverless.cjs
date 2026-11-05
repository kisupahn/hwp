/* Run after building and serving the static site. Requires Playwright + Chromium. */
const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
(async()=>{
 const base=process.env.STUDIO_TEST_URL||'http://127.0.0.1:8766/hwp/';
 const output=process.env.STUDIO_TEST_OUTPUT||'/tmp/studio-browser-test';fs.mkdirSync(output,{recursive:true});
 const options={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
 if(process.env.HTTPS_PROXY)options.proxy={server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'};
 const browser=await chromium.launch(options);
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});
  const errors=[],apiRequests=[],postRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());if(r.method()==='POST')postRequests.push(r.url());});
  await page.goto(base);
  if(await page.locator('#access').isVisible())throw Error('Local mode must not ask for an access key');
  await page.getByRole('button',{name:'서식',exact:true}).click();
  await page.getByLabel('줄 간격 · %').fill('150');
  await page.getByLabel('자간 · %').fill('-2');
  await page.getByRole('button',{name:'AI 도우미',exact:true}).click();
  await page.getByLabel('AI가 준 JSON 결과').fill('```json\n'+JSON.stringify({blocks:[{type:'paragraph',bullet:'○',summary:'추가 검토',body:'자동 생성 내용은 {사실 확인} 후 사용 (확인 필요)'}]})+'\n```');
  await page.getByRole('button',{name:'검토한 문단 추가'}).click();
  if(await page.locator('#blocks .block-item').count()!==8)throw Error('AI JSON import failed');
  for(const extension of ['hwp','hwpx']){
   await page.locator('#formatSelect').selectOption(extension);
   const downloading=page.waitForEvent('download',{timeout:180000});
   await page.getByRole('button',{name:extension.toUpperCase()+' 내려받기 ↗'}).click();
   const downloaded=await downloading;
   await downloaded.saveAs(path.join(output,'serverless-demo.'+extension));
   console.log('PASS local '+extension+' export');
  }
  await page.getByRole('button',{name:'설정·내용 저장',exact:true}).click();
  await page.reload();
  if(await page.locator('#blocks .block-item').count()!==8)throw Error('Persistence failed');
  await page.getByRole('button',{name:'서식',exact:true}).click();
  if(await page.getByLabel('줄 간격 · %').inputValue()!=='150')throw Error('Style persistence failed');
  await page.getByRole('button',{name:'내용',exact:true}).click();
  await page.screenshot({path:path.join(output,'serverless-studio.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
  await page.screenshot({path:path.join(output,'serverless-mobile.png'),fullPage:true});
  if(errors.length||apiRequests.length||postRequests.length)throw Error(JSON.stringify({errors,apiRequests,postRequests}));
  console.log('PASS AI result import, fonts/spacing controls, persistence, mobile layout, zero API requests and zero HTTP POSTs');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
