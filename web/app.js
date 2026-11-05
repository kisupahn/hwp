'use strict';
const $ = id => document.getElementById(id);
const apiBase=(window.STUDIO_API_BASE||'').replace(/\/$/,'');
const localMode=window.STUDIO_LOCAL_EXPORT!==false;
const defaults={font_main:'나눔명조',font_note:'나눔고딕',font_size:16,note_size:14,line_spacing:160,letter_spacing:0,margin_x:20,margin_y:10,gap_scale:1};
const seed=()=>({title:'업무 자동화 시범 운영계획',settings:{...defaults},blocks:[
 {type:'paragraph',bullet:'□',summary:'추진목적',body:'반복 보고서의 {작성 시간을 줄이고} 내용 검토에 집중할 수 있는 업무 환경 마련'},
 {type:'paragraph',bullet:'○',summary:'운영방향',body:'공통 서식을 기준으로 문단·표·차트를 구성하고, 작성자가 최종 내용을 확인한 뒤 한글 파일로 저장'},
 {type:'paragraph',bullet:'*',summary:'',body:'아래 수치와 일정은 기능 시연을 위한 {가상 예시}이며 실제 사업 실적이 아님'},
 {type:'table',headers:['단계','주요 업무','확인 사항'],rows:[['준비','표준 서식과 필수 항목 정의','담당자 검토'],['시범 운영','보고서 생성 및 내용 대조','누락·오류 점검'],['평가','사용성 확인 및 개선','확대 여부 결정']]},
 {type:'paragraph',bullet:'□',summary:'기대효과',body:'반복 업무 시간을 줄이는 것을 목표로 시범 운영 후 실제 효과 측정 (수치는 가정)'},
 {type:'chart',title:'단계별 목표 처리 건수',unit:'단위: 건 / 시연용 가상 목표',points:[{label:'1단계',value:20},{label:'2단계',value:35},{label:'3단계',value:50}]},
 {type:'paragraph',bullet:'○',summary:'검수기준',body:'{사실·수치·표현}을 검토하고 최종 한글 파일에서 줄바꿈과 페이지 구성을 확인'}]});
function validateDocument(doc){
 if(!doc||typeof doc.title!=='string'||!doc.title.length||doc.title.length>100||!Array.isArray(doc.blocks)||!doc.blocks.length||doc.blocks.length>40)throw Error('문서 이름과 1~40개 블록이 필요해.');
 const s=doc.settings;
 if(!s)throw Error('서식 설정이 필요해.');
 for(const key of ['font_main','font_note'])if(typeof s[key]!=='string'||!s[key]||s[key].length>60)throw Error('글꼴 이름을 확인해 줘.');
 for(const [key,min,max] of [['font_size',10,24],['note_size',8,20],['line_spacing',100,220],['letter_spacing',-5,5],['margin_x',10,35],['margin_y',10,35],['gap_scale',.25,2]]){
  if(typeof s[key]!=='number'||!Number.isFinite(s[key])||s[key]<min||s[key]>max||(key!=='gap_scale'&&!Number.isInteger(s[key])))throw Error('서식 값이 허용 범위를 벗어났어: '+key);
 }
 const string=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);
 for(const b of doc.blocks){
  if(!b||!['paragraph','table','chart'].includes(b.type))throw Error('블록 종류를 확인해 줘.');
  if(b.page_break_before!==undefined&&typeof b.page_break_before!=='boolean')throw Error('페이지 나눔 설정을 확인해 줘.');
  if(b.type==='paragraph'){
   if(!['□','○','-','*'].includes(b.bullet)||!string(b.body,2500)||!string(b.summary||'',150)||b.body.includes('{{')||(b.summary||'').includes('{{'))throw Error('문단 내용이나 항목 기호를 확인해 줘.');
  }else if(b.type==='table'){
   if(!Array.isArray(b.headers)||!b.headers.length||b.headers.length>6||!b.headers.every(v=>string(v,100))||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>12||!b.rows.every(r=>Array.isArray(r)&&r.length===b.headers.length&&r.every(v=>string(v,300))))throw Error('표는 1~6열, 1~12개 데이터 행으로 작성해 줘.');
  }else if(!string(b.title||'',100)||!string(b.unit||'',60)||!Array.isArray(b.points)||!b.points.length||b.points.length>10||!b.points.every(p=>p&&string(p.label,12)&&p.label.length&&typeof p.value==='number'&&Number.isFinite(p.value)&&p.value>=0&&p.value<=1e9))throw Error('차트의 항목 이름과 0 이상의 값을 확인해 줘.');
 }
 if(JSON.stringify(doc).length>250000)throw Error('문서가 너무 커. 내용은 250KB 이내로 줄여 줘.');
 return doc;
}
let state=seed(),selected=0,noticeTimer;
try{const saved=JSON.parse(localStorage.getItem('hwp-studio-v1'));if(saved?.blocks?.length)state=validateDocument(saved);}catch{}
function toast(text,persistent=false){$('status').textContent=text;clearTimeout(noticeTimer);if(!persistent)noticeTimer=setTimeout(()=>$('status').textContent='',7000);}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function persist(){try{localStorage.setItem('hwp-studio-v1',JSON.stringify(state));}catch{toast('브라우저 저장 공간이 부족해. JSON 파일로 저장해 줘.');}}
function changed(){persist();preview();}
function btn(text,fn,cls){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
function field(container,label,value,change,{type='text',rows=4,min,max,step}={}){const l=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;else input.rows=rows;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;input.value=value;input.oninput=()=>change(type==='number'?Number(input.value):input.value);l.append(input);container.append(l);return input;}
function plainBody(s){return s.replace(/[{}]/g,'');}
function formatted(node,text){let bold=0,depth=0;for(const c of text){if(c==='{'){bold++;continue;}if(c==='}'){bold=Math.max(0,bold-1);continue;}if(c==='(')depth++;const span=el(bold?'strong':'span',c);if(depth)span.classList.add('small');node.append(span);if(c===')')depth=Math.max(0,depth-1);}}
function preview(){const host=$('preview');host.replaceChildren();let page;const settings=state.settings;const newPage=()=>{page=el('div',undefined,'sheet');page.style.fontFamily=`"${settings.font_main}",serif`;page.style.fontSize=settings.font_size+'px';page.style.lineHeight=settings.line_spacing/100;page.style.letterSpacing=settings.letter_spacing/100+'em';page.style.padding=`${settings.margin_y*2.7+15}px ${settings.margin_x*2.7}px`;host.append(page);};newPage();state.blocks.forEach((block,index)=>{if(block.page_break_before&&index)newPage();let node;const gap=({'□':15,'○':10,'-':6,'*':4}[block.bullet]??10)*settings.gap_scale;if(block.type==='table'){node=el('table');const head=el('thead'),row=el('tr');block.headers.forEach(v=>row.append(el('th',v)));head.append(row);node.append(head);const body=el('tbody');block.rows.forEach(values=>{const r=el('tr');values.forEach(v=>r.append(el('td',v)));body.append(r);});node.append(body);}else if(block.type==='chart'){node=el('div',undefined,'chart');node.append(el('div',block.title,'chart-title'));const ceiling=Math.max(1,...block.points.map(p=>Number(p.value)||0));block.points.forEach(point=>{const row=el('div',undefined,'chart-row'),track=el('div',undefined,'chart-track'),bar=el('div',undefined,'chart-bar');bar.style.width=(Number(point.value)/ceiling*100)+'%';track.append(bar);row.append(el('span',point.label),track,el('span',String(point.value)));node.append(row);});node.append(el('div',block.unit,'chart-unit'));}else{node=el('p');const bullet=block.bullet||'○';node.style.paddingLeft=({'□':0,'○':8,'-':16,'*':24}[bullet])+'px';if(bullet==='*'){node.style.fontFamily=`"${settings.font_note}",sans-serif`;node.style.fontSize=settings.note_size+'px';}node.append(document.createTextNode(bullet+' '));if(block.summary){node.append(document.createTextNode('('),el('mark',block.summary),document.createTextNode(') '));}formatted(node,block.body);}node.style.marginTop=index?gap+'px':'0';node.title='클릭해서 편집';node.onclick=()=>{selected=index;setTab('content');renderBlocks();renderEditor();};page.append(node);});}
function renderBlocks(){const list=$('blocks');list.replaceChildren();$('count').textContent=state.blocks.length+'개 블록';state.blocks.forEach((b,i)=>{const row=el('div',undefined,'block-item'+(selected===i?' selected':''));const label=b.type==='table'?'▦ 표 · '+b.headers.join(' / '):b.type==='chart'?'▥ '+b.title:(b.bullet+' '+(b.summary||plainBody(b.body))).slice(0,25);row.append(btn(label,()=>{selected=i;renderBlocks();renderEditor();}));const move=(delta)=>{const target=i+delta;if(target<0||target>=state.blocks.length)return;[state.blocks[i],state.blocks[target]]=[state.blocks[target],state.blocks[i]];selected=target;renderAll();};const up=btn('↑',()=>move(-1),'move'),down=btn('↓',()=>move(1),'move');up.setAttribute('aria-label','블록 위로 이동');down.setAttribute('aria-label','블록 아래로 이동');up.disabled=i===0;down.disabled=i===state.blocks.length-1;row.append(up,down);list.append(row);});}
function renderEditor(){const container=$('editor');container.replaceChildren();const b=state.blocks[selected];if(!b)return;const head=el('div',undefined,'editor-head');head.append(el('strong',b.type==='table'?'표 편집':b.type==='chart'?'차트 편집':'문단 편집'));const remove=btn('삭제',()=>{if(state.blocks.length===1)return toast('블록은 하나 이상 필요해.');state.blocks.splice(selected,1);selected=Math.max(0,selected-1);renderAll();},'danger');head.append(remove);container.append(head);const check=el('label',undefined,'inline'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=!!b.page_break_before;checkbox.onchange=()=>{b.page_break_before=checkbox.checked;changed();};check.append(checkbox,document.createTextNode('이 블록 앞에서 새 페이지'));container.append(check);
if(b.type==='table'){const rows=[b.headers,...b.rows];const grid=el('div',undefined,'grid-editor');grid.style.gridTemplateColumns=`repeat(${b.headers.length},minmax(0,1fr))`;rows.forEach((row,r)=>row.forEach((v,c)=>{const input=el('input');input.value=v;input.maxLength=r?300:100;input.setAttribute('aria-label',`${r===0?'머리글':r+'행'} ${c+1}열`);input.oninput=()=>{row[c]=input.value;changed();};grid.append(input);}));container.append(grid);const tools=el('div',undefined,'add-row');tools.append(btn('＋ 행',()=>{if(b.rows.length>=12)return toast('표는 최대 12행이야.');b.rows.push(b.headers.map(()=>''));renderAll();}),btn('＋ 열',()=>{if(b.headers.length>=6)return toast('표는 최대 6열이야.');b.headers.push('새 열');b.rows.forEach(r=>r.push(''));renderAll();}),btn('행 삭제',()=>{if(b.rows.length>1){b.rows.pop();renderAll();}}),btn('열 삭제',()=>{if(b.headers.length>1){b.headers.pop();b.rows.forEach(r=>r.pop());renderAll();}}));container.append(tools);container.append(el('p','한글에서 셀 내용을 수정할 수 있는 표로 저장돼요.','hint'));}
else if(b.type==='chart'){field(container,'차트 제목',b.title,v=>{b.title=v;changed();});field(container,'단위·출처',b.unit,v=>{b.unit=v;changed();});b.points.forEach((p,i)=>{const row=el('div',undefined,'chart-entry');field(row,'항목 '+(i+1),p.label,v=>{p.label=v;changed();});field(row,'값',p.value,v=>{p.value=v;changed();},{type:'number',min:0,max:1e9});row.append(btn('×',()=>{if(b.points.length>1){b.points.splice(i,1);renderAll();}}));container.append(row);});container.append(btn('＋ 항목',()=>{if(b.points.length>=10)return toast('차트는 최대 10개 항목이야.');b.points.push({label:'항목',value:10});renderAll();}),el('p','차트는 호환성을 위해 이미지로 저장돼요.','hint'));}
else{const label=el('label','항목 단계'),select=el('select');['□','○','-','*'].forEach(v=>{const option=el('option',v);option.value=v;option.selected=v===b.bullet;select.append(option);});select.onchange=()=>{b.bullet=select.value;renderBlocks();changed();};label.append(select);container.append(label);field(container,'요약 · 노란 표시',b.summary||'',v=>{b.summary=v;renderBlocks();changed();});field(container,'본문',b.body,v=>{b.body=v;renderBlocks();changed();},{type:'textarea',rows:7});container.append(el('p','{강조할 문구}는 굵게, (부연 설명)은 작은 글자로 표시돼요.','hint'));}}
function renderSettings(){const box=$('settings');box.replaceChildren();const options=[['font_main','본문 글꼴'],['font_note','주석 글꼴'],['font_size','본문 크기 · pt',10,24,1],['note_size','주석 크기 · pt',8,20,1],['line_spacing','줄 간격 · %',100,220,5],['letter_spacing','자간 · %',-5,5,1],['gap_scale','항목 사이 간격 배율',.25,2,.05],['margin_x','좌우 여백 · mm',10,35,1],['margin_y','위아래 여백 · mm',10,35,1]];options.forEach(([key,label,min,max,step])=>field(box,label,state.settings[key],value=>{state.settings[key]=value;changed();},{type:min===undefined?'text':'number',min,max,step}));}
function renderAll(){$('title').value=state.title;renderBlocks();renderEditor();renderSettings();changed();}
function setTab(id){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));document.querySelectorAll('.tabbody').forEach(p=>p.hidden=p.id!==id);}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$('title').oninput=()=>{state.title=$('title').value;persist();};
function add(block){if(state.blocks.length>=40)return toast('한 문서는 최대 40개 블록이야.');state.blocks.splice(selected+1,0,block);selected++;renderAll();}
$('addParagraph').onclick=()=>add({type:'paragraph',bullet:'○',summary:'새 항목',body:'여기에 내용을 입력해 주세요.'});
$('addTable').onclick=()=>add({type:'table',headers:['구분','내용','비고'],rows:[['항목 1','입력 내용',''],['항목 2','입력 내용','']]});
$('addChart').onclick=()=>add({type:'chart',title:'새 차트',unit:'단위: 건',points:[{label:'항목 1',value:20},{label:'항목 2',value:30}]});
$('sample').onclick=()=>{if(confirm('현재 내용을 표·차트 예시로 바꿀까? 필요하면 먼저 저장해 줘.')){state=seed();selected=0;renderAll();}};
$('resetStyle').onclick=()=>{state.settings={...defaults};renderAll();};
function download(blob,name){const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function fileTitle(){return state.title.replace(/[\\/:*?"<>|]/g,'_')||'업무 보고서';}
$('save').onclick=()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),fileTitle()+'.json');toast('서식과 내용을 함께 저장했어.');};
$('load').onchange=async()=>{const f=$('load').files[0];if(!f)return;if(f.size>250000)return toast('250KB 이하 파일을 선택해 줘.');try{const value=JSON.parse(await f.text());const next={title:value.title,settings:{...defaults,...value.settings},blocks:value.blocks};validateDocument(next);state=next;selected=0;renderAll();toast('문서를 불러왔어.');}catch(error){toast(error.message||'문서 JSON 형식을 확인해 줘.');}finally{$('load').value='';}};
async function request(path,body){const headers={};const token=sessionStorage.getItem('studio-access');if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';const response=await fetch(apiBase+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});if(!response.ok){let message=response.status===404?'문서 생성 서버가 아직 연결되지 않았어.':'요청을 처리하지 못했어.';if(response.status===401){$('accessDialog').showModal();throw Error('접속 키를 입력해 줘.');}try{const error=await response.json();message=typeof error.detail==='string'?error.detail:'입력값을 확인해 줘: '+(error.detail?.[0]?.msg||'형식 오류');}catch{}throw Error(message);}return response;}
$('export').onclick=async()=>{const button=$('export');button.disabled=true;button.textContent='문서 만드는 중…';try{validateDocument(state);const format=$('formatSelect').value;let blob;if(localMode){blob=await window.LocalDocumentExporter.exportDocument(state,format,text=>toast(text,true));}else{const response=await request('/api/export/'+format,state);blob=await response.blob();}download(blob,fileTitle()+'.'+format);toast(localMode?'브라우저에서 문서를 만들었어. 한글에서 최종 배치를 확인해 줘.':'문서를 만들었어. 한글에서 최종 배치를 확인해 줘.');}catch(error){toast(error.message);}finally{button.disabled=false;updateExport();}};
function updateExport(){$('export').textContent=$('formatSelect').value.toUpperCase()+' 내려받기 ↗';}$('formatSelect').onchange=updateExport;
$('draft').onclick=async()=>{if(localMode)return copyWritingPrompt();const prompt=$('prompt').value.trim();if(prompt.length<5)return toast('작성 목적과 핵심 사실을 조금 더 적어 줘.');$('draft').disabled=true;try{const response=await request('/api/draft',{instruction:prompt}),result=await response.json();if(state.blocks.length+result.blocks.length>40)throw Error('문단 수가 40개를 넘어서 추가할 수 없어. 기존 문단을 줄여 줘.');state.blocks.push(...result.blocks);selected=state.blocks.length-result.blocks.length;renderAll();setTab('content');toast(result.notice);}catch(error){toast(error.message);}finally{$('draft').disabled=false;}};
async function copyWritingPrompt(){
 const instruction=$('prompt').value.trim();if(instruction.length<5)return toast('작성 목적과 핵심 사실을 조금 더 적어 줘.');
 const text=`한국어 업무 보고서 초안을 작성해 줘.\n${instruction}\n\n제공하지 않은 수치·기관명·일정은 추측하지 말고 [확인 필요]로 표시해. 설명 없이 JSON 객체만 반환해.\n형식: {"blocks":[{"type":"paragraph","bullet":"□","summary":"추진목적","body":"내용"}]}\n8~12개 문단, bullet은 □, ○, -, * 중 선택. 중요한 문구는 {굵게}, 부연은 (괄호)로 표시. 중괄호 두 개를 겹친 변수는 쓰지 마. 각 본문은 2500자 이내. 표와 차트는 만들지 마.`;
 try{await navigator.clipboard.writeText(text);toast('작성 요청을 복사했어. 원하는 AI에 붙여 넣고 결과를 가져와 줘.');}catch{download(new Blob([text],{type:'text/plain;charset=utf-8'}),'AI_작성요청.txt');toast('복사 대신 작성 요청 파일을 저장했어.');}
}
$('appendAI').onclick=()=>{
 try{
  let text=$('aiResult').value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  if(text.length>100000)throw Error('AI 결과가 너무 길어.');
  const result=JSON.parse(text);if(!Array.isArray(result.blocks)||result.blocks.length===0)throw Error('blocks 배열이 있는 JSON 결과를 넣어 줘.');
  const blocks=result.blocks.map(b=>({type:'paragraph',bullet:b.bullet,summary:b.summary||'',body:b.body}));
  if(result.blocks.some(b=>b.type&&b.type!=='paragraph'))throw Error('AI 결과는 문단만 추가할 수 있어.');
  const next={...state,blocks:[...state.blocks,...blocks]};validateDocument(next);selected=state.blocks.length;state=next;renderAll();setTab('content');$('aiResult').value='';toast('문단을 추가했어. 사실과 수치를 확인해 줘.');
 }catch(error){toast(error.message||'JSON 형식을 확인해 줘.');}
};
async function checkConfig(){
 if(localMode){$('access').hidden=true;$('aiManual').hidden=false;$('aiStatus').textContent='서버 없는 버전 · 작성 요청을 복사해 AI에 전달하고, 받은 JSON을 아래에 붙여 넣어 주세요.';$('draft').textContent='AI 작성 요청 복사';$('draft').disabled=false;$('aiNotice').textContent='이 앱은 AI를 직접 호출하지 않아요. 복사한 요청을 다른 AI에 전달할지는 직접 선택해 주세요. 문서 생성도 이 브라우저 안에서 처리돼요.';document.querySelector('.topnote').textContent='서버 없이, 문서는 이 브라우저 안에서.';return;}
 try{const response=await request('/api/config'),config=await response.json();$('aiStatus').textContent=config.llm_configured?'연결 준비됨 · '+config.model:'현재 AI 미연결 · 서버에 LLM_API_KEY를 설정하면 활성화됩니다.';$('draft').disabled=!config.llm_configured;}catch(error){$('aiStatus').textContent=error.message;$('draft').disabled=true;}
}
$('access').onclick=()=>$('accessDialog').showModal();$('accessSave').onclick=()=>{sessionStorage.setItem('studio-access',$('accessInput').value);$('accessInput').value='';setTimeout(checkConfig,0);};
$('clear').onclick=()=>{if(confirm('이 브라우저에 저장한 문서를 지우고 초기화할까?')){localStorage.removeItem('hwp-studio-v1');sessionStorage.removeItem('studio-access');state=seed();selected=0;renderBlocks();renderEditor();renderSettings();$('title').value=state.title;preview();toast('저장 내용을 지웠어.');}};
renderAll();checkConfig();
