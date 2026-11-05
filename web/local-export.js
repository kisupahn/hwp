'use strict';
window.LocalDocumentExporter=(()=>{
 let worker=null,sequence=0;
 const pending=new Map();
 function getWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('python-worker.js',document.currentScript?.src || new URL('assets/local-export.js',document.baseURI)));
  worker.onmessage=event=>{
   const m=event.data;
   if(m.type==='progress'){for(const p of pending.values())p.progress(m.text);return;}
   const p=pending.get(m.id);if(!p)return;
   pending.delete(m.id);
   if(m.type==='result')p.resolve(new Blob([m.data],{type:'application/octet-stream'}));
   else p.reject(Error(m.message));
  };
  worker.onerror=()=>{for(const p of pending.values())p.reject(Error('문서 엔진을 실행하지 못했어. 네트워크 연결과 최신 브라우저 사용 여부를 확인해 줘.'));pending.clear();worker.terminate();worker=null;};
  return worker;
 }
 async function chartPng(b,font){
  await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=660;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,660);
  ctx.fillStyle='#172b4d';ctx.font=`bold 32px "${font}",sans-serif`;ctx.fillText(b.title,45,52,1100);
  ctx.font=`24px "${font}",sans-serif`;
  const ceiling=Math.max(1,...b.points.map(p=>p.value));
  for(let tick=0;tick<5;tick++){
   const y=520-tick*100;ctx.strokeStyle='#e2e8f0';ctx.beginPath();ctx.moveTo(110,y);ctx.lineTo(1160,y);ctx.stroke();ctx.fillStyle='#64748b';ctx.fillText(String(Math.round(ceiling*tick/4*100)/100),10,y+8,95);
  }
  const width=Math.min(100,950/b.points.length*.65);
  b.points.forEach((p,i)=>{
   const x=135+i*1000/b.points.length,h=p.value/ceiling*400;
   ctx.fillStyle='#237b71';ctx.fillRect(x,520-h,width,h);
   ctx.fillStyle='#172b4d';ctx.fillText(String(p.value),x,Math.max(80,500-h),95);
   ctx.fillText(p.label,x,560,Math.min(150,1000/b.points.length-12));
  });
  ctx.fillStyle='#64748b';ctx.fillText(b.unit||'',45,635,1100);
  return canvas.toDataURL('image/png').split(',')[1];
 }
 async function exportDocument(doc,format,onProgress){
  if(pending.size)throw Error('앞 문서를 만드는 중이야. 잠시만 기다려 줘.');
  if(!['hwp','hwpx'].includes(format))throw Error('지원하지 않는 파일 형식이야.');
  const copy=JSON.parse(JSON.stringify(doc));
  for(const b of copy.blocks)if(b.type==='chart')b._chart_png=await chartPng(b,copy.settings.font_note);
  return new Promise((resolve,reject)=>{
   const id=++sequence;
   pending.set(id,{resolve,reject,progress:onProgress||(()=>{})});
   try{getWorker().postMessage({id,document:copy,format});}catch(error){pending.delete(id);reject(error);}
  });
 }
 return {exportDocument};
})();
