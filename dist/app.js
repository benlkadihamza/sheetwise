const $=id=>document.getElementById(id),colors=['#c5d4af','#e9d5ae','#b9cfcb','#d8c6bc','#c9c8dc','#dfcba0'];let state={unit:'cm',stock:[{label:'Birch plywood',w:244,h:122}],parts:[],kerf:0.4,rotate:false},result,selected=0,dirty=false;
function valid(s){return s&&s.unit==='cm'&&Array.isArray(s.stock)&&Array.isArray(s.parts)&&s.stock.length<=100&&s.parts.length<=200&&s.stock.length>0&&s.parts.length>0&&Number.isFinite(s.kerf)&&s.kerf>=0&&s.kerf<=10&&[...s.stock,...s.parts].every(p=>typeof p.label==='string'&&(!p.edges||(typeof p.edges==='object'&&['top','bottom','left','right'].every(k=>p.edges[k]===undefined||typeof p.edges[k]==='boolean')))&&Number.isFinite(p.w)&&p.w>0&&p.w<=10000&&Number.isFinite(p.h)&&p.h>0&&p.h<=10000&&((s.stock.includes(p)||((p.qty===''||p.qty===undefined?1:p.qty)>0&&Number.isInteger(p.qty===''||p.qty===undefined?1:p.qty)&&(p.qty===''||p.qty===undefined?1:p.qty)<=500))))&&s.parts.reduce((t,p)=>t+((p.qty===''||p.qty===undefined)?1:p.qty),0)<=1000;}
try{let raw=JSON.parse(localStorage.getItem('sheetwise'));if(raw){let s=projectInCentimeters(raw);s.stock.forEach(p=>delete p.qty);if(valid(s)||Array.isArray(s.parts))state=s;}}catch{}
function el(tag,attrs={},text){let e=document.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
function changed(){updateBanding();try{if(valid(state)||state.parts.length===0)localStorage.setItem('sheetwise',JSON.stringify(state));}catch{}dirty=true;$('status').textContent='Project changed. Optimize again to update the layout.';}
function clearAllParts(){
  if (!state.parts.length || !window.confirm('Delete all parts? This action cannot be undone.')) return;
  state.parts=[];rows('parts','parts');try{localStorage.setItem('sheetwise',JSON.stringify(state));}catch{}dirty=false;count();run();
}
function rows(key,target){$(target).replaceChildren();state[key].forEach((p,i)=>{let row=el('div',{class:key==='stock'?'row stock-row':'row'});for(let field of (key==='stock'?['label','w','h']:['label','w','h','qty'])){let input=el('input',{type:field==='label'?'text':'number','aria-label':`${key} ${i+1} ${field}${['w','h'].includes(field)?' (cm)':''}`});if(field==='qty'){input.placeholder='1';input.value=(p.qty===''||p.qty===1||p.qty===undefined)?'':p.qty;}else{input.value=p[field]!==undefined&&p[field]!==null?p[field]:'';}if(field!=='label'){input.min=field==='qty'?1:0.01;input.addEventListener('wheel',()=>input.blur(),{passive:true});}input.oninput=()=>{p[field]=field==='label'?input.value:(input.value===''? '':Number(input.value));changed();count();};row.append(input);}let del=el('button',{class:'remove','aria-label':`Remove ${p.label}`},'×');del.onclick=()=>{state[key].splice(i,1);rows(key,target);changed();count();};row.append(del);$(target).append(row);if(key==='parts')$(target).append(edgeControls(p,i));});}
function edgeControls(p,i){
 const box=el('div',{class:'edge-controls'}),title=el('span',{},'Band edges');box.append(title);p.edges=p.edges||{};
 for(const [key,label]of [['top','W1'],['bottom','W2'],['left','H1'],['right','H2']]){let l=el('label'),c=el('input',{type:'checkbox','aria-label': 'Part '+(i+1)+' '+label+' edge'});c.checked=!!p.edges[key];c.onchange=()=>{p.edges[key]=c.checked;changed();};l.append(c,document.createTextNode(label));box.append(l);}
 let preset=el('select',{'aria-label':'Edge preset for part '+(i+1)});for(const [v,t]of [['','Choose…'],['none','None'],['width','Both widths'],['height','Both heights'],['mixed','1 width + 1 height'],['all','All 4 edges']])preset.append(el('option',{value:v},t));preset.onchange=()=>{let v=preset.value;if(!v)return;p.edges={top:['width','mixed','all'].includes(v),bottom:['width','all'].includes(v),left:['height','mixed','all'].includes(v),right:['height','all'].includes(v)};rows('parts','parts');changed();};box.append(preset);return box;
}
function updateBanding(){
 let container=$('banding');if(!container)return;container.replaceChildren();let total=bandingTotal(state.parts);container.append(el('h2',{},'Edge banding'),el('p',{class:'band-total'},Number.isFinite(total)?(total / 100).toFixed(2)+' m total':'Check part dimensions'));
 container.append(el('p',{class:'hint'},'W1 / W2 run along the width; H1 / H2 run along the height. Totals include every requested part and quantity, including unplaced parts. Net length only; no trimming allowance.'));
 let table=el('table',{class:'band-table'}),head=el('tr');for(let t of ['Part','Per piece','Qty','Total'])head.append(el('th',{},t));table.append(head);
 for(let p of state.parts){let q=(p.qty===''||p.qty===undefined)?1:(Number(p.qty)||0),tr=el('tr');for(let t of [p.label,(bandingLength(p) / 100).toFixed(2)+' m',q,(bandingLength(p) * q / 100).toFixed(2)+' m'])tr.append(el('td',{},String(t)));table.append(tr);}container.append(table);
}
function count(){updateBanding();$('partcount').textContent=`${state.parts.length} part types · ${state.parts.reduce((t,p)=>t+((p.qty===''||p.qty===undefined)?1:(Number(p.qty)||0)),0)} pieces total`;}
function renderInputs(){$('rotate').checked=state.rotate===true;rows('stock','stocks');rows('parts','parts');$('kerf').value=Number((state.kerf*10).toFixed(6));count();}
const dimension=n=>Number(n.toFixed(2)).toString();
function remnantDetails(f,i){return 'Remnant '+(i+1)+' · '+dimension(f.w)+' × '+dimension(f.h)+' cm · Area '+dimension(f.w*f.h)+' cm²';}
function remnantTooltip(){let tip=$('remnant-tooltip');if(!tip){tip=el('div',{id:'remnant-tooltip',role:'tooltip'});tip.hidden=true;document.body.append(tip);}return tip;}
let selectedPart=null,hasCustomLayout=false;
function saveLayout(){hasCustomLayout=true;dirty=false;try{if(result&&result.sheets)localStorage.setItem('sheetwise_custom_layout',JSON.stringify(result.sheets.map(s=>s.pieces.map(p=>({id:p.id,label:p.label,x:p.x,y:p.y,w:p.w,h:p.h,turn:!!p.turn})))));}catch{}}
function restoreLayout(){try{const raw=localStorage.getItem('sheetwise_custom_layout');if(!raw||!result||!result.sheets)return;const savedSheets=JSON.parse(raw);if(!Array.isArray(savedSheets))return;savedSheets.forEach((savedPieces,i)=>{const sheet=result.sheets[i];if(!sheet||!Array.isArray(savedPieces))return;savedPieces.forEach(sp=>{const p=sheet.pieces.find(pc=>pc.id===sp.id||(pc.label===sp.label&&!pc._restored));if(p&&Number.isFinite(sp.x)&&Number.isFinite(sp.y)){p.x=sp.x;p.y=sp.y;p.w=sp.w;p.h=sp.h;p.turn=!!sp.turn;p._restored=true;}});sheet.pieces.forEach(p=>delete p._restored);updateSheetFree(sheet,state.kerf);});hasCustomLayout=true;}catch{}}
function getSvgPoint(svg,clientX,clientY){const pt=svg.createSVGPoint();pt.x=clientX;pt.y=clientY;const ctm=svg.getScreenCTM();return ctm?pt.matrixTransform(ctm.inverse()):{x:clientX,y:clientY};}
function collides(x,y,w,h,pieces,ignorePiece,kerf){const eps=1e-4;for(const o of pieces){if(o===ignorePiece)continue;const sep=(x+w+kerf<=o.x+eps||o.x+o.w+kerf<=x+eps||y+h+kerf<=o.y+eps||o.y+o.h+kerf<=y+eps);if(!sep)return true;}return false;}
function snapCoords(targetX,targetY,w,h,s,ignorePiece,kerf){const threshold=Math.max(1.2,Math.min(s.w,s.h)*0.02);let bestX=targetX,bestY=targetY,minDx=threshold,minDy=threshold;if(Math.abs(targetX)<minDx){bestX=0;minDx=Math.abs(targetX);}if(Math.abs(targetX+w-s.w)<minDx){bestX=s.w-w;minDx=Math.abs(targetX+w-s.w);}if(Math.abs(targetY)<minDy){bestY=0;minDy=Math.abs(targetY);}if(Math.abs(targetY+h-s.h)<minDy){bestY=s.h-h;minDy=Math.abs(targetY+h-s.h);}for(const o of s.pieces){if(o===ignorePiece)continue;const rOfO=o.x+o.w+kerf;if(Math.abs(targetX-rOfO)<minDx){bestX=rOfO;minDx=Math.abs(targetX-rOfO);}const lOfO=o.x-w-kerf;if(Math.abs(targetX-lOfO)<minDx){bestX=lOfO;minDx=Math.abs(targetX-lOfO);}if(Math.abs(targetX-o.x)<minDx){bestX=o.x;minDx=Math.abs(targetX-o.x);}if(Math.abs(targetX+w-(o.x+o.w))<minDx){bestX=o.x+o.w-w;minDx=Math.abs(targetX+w-(o.x+o.w));}const bOfO=o.y+o.h+kerf;if(Math.abs(targetY-bOfO)<minDy){bestY=bOfO;minDy=Math.abs(targetY-bOfO);}const aOfO=o.y-h-kerf;if(Math.abs(targetY-aOfO)<minDy){bestY=aOfO;minDy=Math.abs(targetY-aOfO);}if(Math.abs(targetY-o.y)<minDy){bestY=o.y;minDy=Math.abs(targetY-o.y);}if(Math.abs(targetY+h-(o.y+o.h))<minDy){bestY=o.y+o.h-h;minDy=Math.abs(targetY+h-(o.y+o.h));}}bestX=Math.max(0,Math.min(s.w-w,bestX));bestY=Math.max(0,Math.min(s.h-h,bestY));return{x:bestX,y:bestY};}
function updateSheetFree(s,kerf){let free=[{x:0,y:0,w:s.w,h:s.h}];for(const p of s.pieces){const px=p.x,py=p.y,pw=p.w+kerf,ph=p.h+kerf,nextFree=[];for(const f of free){const sep=(px>=f.x+f.w-1e-4||px+pw<=f.x+1e-4||py>=f.y+f.h-1e-4||py+ph<=f.y+1e-4);if(sep){nextFree.push(f);continue;}if(py>f.y+1e-4)nextFree.push({x:f.x,y:f.y,w:f.w,h:py-f.y});if(py+ph<f.y+f.h-1e-4)nextFree.push({x:f.x,y:py+ph,w:f.w,h:f.y+f.h-(py+ph)});if(px>f.x+1e-4){const top=Math.max(f.y,py),bot=Math.min(f.y+f.h,py+ph);if(bot>top+1e-4)nextFree.push({x:f.x,y:top,w:px-f.x,h:bot-top});}if(px+pw<f.x+f.w-1e-4){const top=Math.max(f.y,py),bot=Math.min(f.y+f.h,py+ph);if(bot>top+1e-4)nextFree.push({x:px+pw,y:top,w:f.x+f.w-(px+pw),h:bot-top});}}free=nextFree.filter(f=>f.w>0.1&&f.h>0.1);}const filtered=[],edgeOnly=free.filter(f=>(f.x+f.w>=s.w-1e-4||f.y+f.h>=s.h-1e-4));for(let i=0;i<edgeOnly.length;i++){let contained=false;for(let j=0;j<edgeOnly.length;j++){if(i!==j){const a=edgeOnly[i],b=edgeOnly[j];if(a.x>=b.x-1e-4&&a.y>=b.y-1e-4&&a.x+a.w<=b.x+b.w+1e-4&&a.y+a.h<=b.y+b.h+1e-4){contained=true;break;}}}if(!contained)filtered.push(edgeOnly[i]);}s.free=filtered;}
function rotatePiece(p,s){const newW=Number(p.h.toFixed(2)),newH=Number(p.w.toFixed(2));let nx=Math.max(0,Math.min(s.w-newW,p.x)),ny=Math.max(0,Math.min(s.h-newH,p.y));if(collides(nx,ny,newW,newH,s.pieces,p,state.kerf)){if($('status'))$('status').textContent=`Cannot rotate "${p.label}": not enough space at this position.`;return false;}p.x=nx;p.y=ny;p.w=newW;p.h=newH;p.turn=!p.turn;updateSheetFree(s,state.kerf);saveLayout();if($('status'))$('status').textContent=`Rotated "${p.label}" 90° (${p.w} × ${p.h} cm).`;draw();return true;}
function movePiece(p,s,targetX,targetY){targetX=Math.max(0,Math.min(s.w-p.w,targetX));targetY=Math.max(0,Math.min(s.h-p.h,targetY));if(collides(targetX,targetY,p.w,p.h,s.pieces,p,state.kerf)){if($('status'))$('status').textContent=`Cannot move "${p.label}": overlaps with another part or kerf.`;return false;}p.x=Number(targetX.toFixed(2));p.y=Number(targetY.toFixed(2));updateSheetFree(s,state.kerf);saveLayout();if($('status'))$('status').textContent=`Moved "${p.label}" to (${p.x}, ${p.y}) cm.`;draw();return true;}
function selectPiece(p,g){document.querySelectorAll('.cut-piece-group.selected').forEach(el=>el.classList.remove('selected'));if(selectedPart===p){selectedPart=null;if($('remnant-info'))$('remnant-info').textContent='Hover over a part to see dimensions · Drag to move · Double-click or press R to rotate.';return;}selectedPart=p;g.classList.add('selected');if($('remnant-info'))$('remnant-info').textContent=`Selected: "${p.label}" (${dimension(p.w)} × ${dimension(p.h)} cm) · Drag to move · Press 'R' to rotate · Arrow keys to nudge.`;}
function svgSheet(s,isInteractive=true){let ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),pad=Math.max(s.w,s.h)*.065;svg.setAttribute('viewBox',`${-pad} ${-pad} ${s.w+2*pad} ${s.h+2*pad}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`Cutting layout for ${s.label}: ${s.pieces.length} pieces`);function shape(tag,a,txt,parent=svg){let e=document.createElementNS(ns,tag);for(let[k,v]of Object.entries(a))e.setAttribute(k,v);if(txt!==undefined)e.textContent=txt;parent.append(e);return e;}shape('rect',{x:0,y:0,width:s.w,height:s.h,fill:'#e8eadf',stroke:'#a8b29b','stroke-width':s.w/1220});
for(let p of s.pieces){
  let g=document.createElementNS(ns,'g');g.setAttribute('class','cut-piece-group'+(selectedPart===p?' selected':''));g.setAttribute('tabindex','0');
  let r=shape('rect',{x:p.x,y:p.y,width:p.w,height:p.h,fill:colors[p.color],stroke:'#fff','stroke-width':Math.max(s.w/1400,.07),class:'cut-part'},undefined,g);
  let title=document.createElementNS(ns,'title');title.textContent=`${p.label}: ${dimension(p.w)} × ${dimension(p.h)} cm${p.turn?' (rotated)':''}`;r.append(title);
  const details=p.label+' · '+dimension(p.w)+' × '+dimension(p.h)+' cm · Area '+dimension(p.w*p.h)+' cm²'+(p.turn?' · Rotated 90°':'');r.setAttribute('aria-label',details);
  const showPart=event=>{if(g.classList.contains('dragging'))return;const tip=remnantTooltip();tip.textContent=dimension(p.w)+' × '+dimension(p.h)+' cm';tip.hidden=false;const bounds=r.getBoundingClientRect(),x=event.clientX??bounds.x,y=event.clientY??bounds.y;tip.style.left=Math.max(8,Math.min(x+14,window.innerWidth-290))+'px';tip.style.top=Math.max(8,Math.min(y+16,window.innerHeight-70))+'px';};
  for(const event of ['pointerenter','pointermove','focus'])r.addEventListener(event,showPart);for(const event of ['pointerleave','blur'])r.addEventListener(event,()=>remnantTooltip().hidden=true);
  let size=Math.min(s.w/65,p.w/8,p.h/3);
  if(size>.6){shape('text',{x:p.x+p.w/2,y:p.y+p.h/2-size*.2,'text-anchor':'middle',fill:'#344737','pointer-events':'none','font-size':size,'font-family':'sans-serif'},p.label.slice(0,20),g);shape('text',{x:p.x+p.w/2,y:p.y+p.h/2+size*1.3,'text-anchor':'middle',fill:'#53654d','pointer-events':'none','font-size':size*.8,'font-family':'sans-serif'},`${dimension(p.w)} × ${dimension(p.h)} cm${p.turn?' ↻':''}`,g);}
  if(isInteractive&&p.w>=8&&p.h>=8){
    let badgeR=Math.min(s.w/100,Math.min(p.w,p.h)/4,6);
    if(badgeR>=1){
      let rBtn=document.createElementNS(ns,'g');rBtn.setAttribute('class','rotate-badge');
      shape('circle',{cx:p.x+p.w-badgeR-0.6,cy:p.y+badgeR+0.6,r:badgeR,fill:'#ffffff',stroke:'#315b48','stroke-width':Math.max(s.w/2000,0.06)},undefined,rBtn);
      shape('text',{x:p.x+p.w-badgeR-0.6,y:p.y+badgeR+0.6,'text-anchor':'middle','dominant-baseline':'central','font-size':badgeR*1.3,fill:'#315b48','pointer-events':'none','font-family':'sans-serif'},'↻',rBtn);
      let rTitle=document.createElementNS(ns,'title');rTitle.textContent='Rotate 90° (or double-click / press R)';rBtn.append(rTitle);
      rBtn.addEventListener('click',e=>{e.stopPropagation();rotatePiece(p,s);});
      g.append(rBtn);
    }
  }
  if(isInteractive){
    let isDragging=false,startPt={x:0,y:0},origX=p.x,origY=p.y,activePointerId=null;
    g.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      if(e.target.closest&&e.target.closest('.rotate-badge'))return;
      e.stopPropagation();activePointerId=e.pointerId;
      try{g.setPointerCapture(e.pointerId);}catch{}
      startPt=getSvgPoint(svg,e.clientX,e.clientY);origX=p.x;origY=p.y;isDragging=false;
    });
    g.addEventListener('pointermove',e=>{
      if(activePointerId!==e.pointerId)return;
      const pt=getSvgPoint(svg,e.clientX,e.clientY),dx=pt.x-startPt.x,dy=pt.y-startPt.y;
      if(!isDragging){if(Math.hypot(dx,dy)<0.4)return;isDragging=true;g.classList.add('dragging');svg.append(g);if($('remnant-tooltip'))$('remnant-tooltip').hidden=true;}
      const rawX=origX+dx,rawY=origY+dy,snapped=snapCoords(rawX,rawY,p.w,p.h,s,p,state.kerf),hasCollision=collides(snapped.x,snapped.y,p.w,p.h,s.pieces,p,state.kerf);
      g.setAttribute('transform',`translate(${snapped.x-p.x},${snapped.y-p.y})`);
      if(hasCollision){r.classList.add('invalid');if($('remnant-info'))$('remnant-info').textContent=`⚠️ Cannot place "${p.label}" here (overlaps other piece or kerf)`;}
      else{r.classList.remove('invalid');if($('remnant-info'))$('remnant-info').textContent=`Moving "${p.label}" to (${dimension(snapped.x)}, ${dimension(snapped.y)}) cm · Release to place`;}
      g.dataset.snappedX=snapped.x;g.dataset.snappedY=snapped.y;g.dataset.hasCollision=hasCollision?'1':'0';
    });
    const endDrag=e=>{
      if(activePointerId!==e.pointerId)return;
      try{g.releasePointerCapture(e.pointerId);}catch{}
      activePointerId=null;g.classList.remove('dragging');g.removeAttribute('transform');
      if(!isDragging){selectPiece(p,g);return;}
      const snappedX=parseFloat(g.dataset.snappedX),snappedY=parseFloat(g.dataset.snappedY),hasCollision=g.dataset.hasCollision==='1';
      if(!hasCollision&&Number.isFinite(snappedX)&&Number.isFinite(snappedY)){
        p.x=Number(snappedX.toFixed(2));p.y=Number(snappedY.toFixed(2));updateSheetFree(s,state.kerf);saveLayout();
        if($('status'))$('status').textContent=`Placed "${p.label}" at (${p.x}, ${p.y}) cm.`;
      }else{
        p.x=origX;p.y=origY;
        if($('status'))$('status').textContent=`Cannot place "${p.label}": overlaps with another part or kerf. Reverted.`;
      }
      draw();
    };
    g.addEventListener('pointerup',endDrag);g.addEventListener('pointercancel',endDrag);
    g.addEventListener('dblclick',e=>{e.stopPropagation();rotatePiece(p,s);});
    g.addEventListener('keydown',e=>{
      if(e.key==='r'||e.key==='R'){e.preventDefault();rotatePiece(p,s);}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();const step=e.shiftKey?0.1:1.0;let nx=p.x,ny=p.y;
        if(e.key==='ArrowLeft')nx-=step;if(e.key==='ArrowRight')nx+=step;if(e.key==='ArrowUp')ny-=step;if(e.key==='ArrowDown')ny+=step;
        movePiece(p,s,nx,ny);
      }
    });
  }
  svg.append(g);
}
shape('text',{x:s.w/2,y:-pad*.35,'text-anchor':'middle','font-size':s.w/80,fill:'#8b9781'},`${s.w} cm`);shape('text',{x:-pad*.25,y:s.h/2,transform:`rotate(-90 ${-pad*.25} ${s.h/2})`,'text-anchor':'middle','font-size':s.w/80,fill:'#8b9781'},`${s.h} cm`);
function measurement(x1,y1,x2,y2,label,vertical){
 const g=document.createElementNS(ns,'g');g.setAttribute('class','remnant-dimension');g.setAttribute('tabindex','0');g.setAttribute('aria-label',label+' cm remaining');
 const add=(tag,attrs,text)=>{let node=document.createElementNS(ns,tag);for(let [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text)node.textContent=text;g.append(node);return node;};
 const tick=s.w/160,font=s.w/105;add('line',{x1,y1,x2,y2,stroke:'#d85b55','stroke-width':s.w/700});
 for(let [x,y]of [[x1,y1],[x2,y2]])add('line',{x1:vertical?x-tick:x,y1:vertical?y:y-tick,x2:vertical?x+tick:x,y2:vertical?y:y+tick,stroke:'#d85b55','stroke-width':s.w/700});
 const x=(x1+x2)/2+(vertical?-font*.65:0),y=(y1+y2)/2+(vertical?0:font*1.4);
 add('text',{x,y,'text-anchor':'middle','dominant-baseline':'middle','font-family':'sans-serif','font-size':font,fill:'#d85b55',stroke:'#f6f7f2','stroke-width':font*.2,'paint-order':'stroke',...(vertical?{transform:'rotate(-90 '+x+' '+y+')'}:{})},label);
 add('line',{x1,y1,x2,y2,stroke:'transparent','stroke-width':s.w/30,class:'dimension-hit'});let title=document.createElementNS(ns,'title');title.textContent=label+' cm remaining';g.append(title);svg.append(g);
}
// Continue the boundaries of each cut through its unused offcut.
const guideKeys=new Set();
function grayGuide(x1,y1,x2,y2){const key=[x1,y1,x2,y2].map(n=>n.toFixed(5)).join(',');if(guideKeys.has(key))return;guideKeys.add(key);shape('line',{x1,y1,x2,y2,stroke:'#a4a7a0','stroke-width':s.w/900,'pointer-events':'none',class:'cut-guide'});}
for(const f of s.free){grayGuide(f.x,f.y,f.x+f.w,f.y);grayGuide(f.x,f.y+f.h,f.x+f.w,f.y+f.h);grayGuide(f.x,f.y,f.x,f.y+f.h);}
for(const f of s.free){
 const wide=f.w>=f.h;const widthY=f.y+f.h*.35,heightX=f.x+f.w*.72;
 measurement(f.x,widthY,f.x+f.w,widthY,dimension(f.w),false);
 if(f.h>s.h*.025)measurement(heightX,f.y,heightX,f.y+f.h,dimension(f.h),true);
 else measurement(s.w+pad*.45,f.y,s.w+pad*.45,f.y+f.h,dimension(f.h),true);
}
return svg;}
function draw(){if($('remnant-tooltip'))$('remnant-tooltip').hidden=true;if($('remnant-info'))$('remnant-info').textContent='Hover over a part to see dimensions · Drag to move · Double-click or press R to rotate.';if(!state.parts.length){$('diagram').replaceChildren(el('p',{},'Add parts to calculate a cutting plan.'));$('sheetnav').replaceChildren();$('legend').replaceChildren();return;}let s=result&&result.sheets?result.sheets[selected]:null;$('diagram').replaceChildren(...(s?[svgSheet(s)]:[el('p',{},'No pieces fit the available stock.')]));$('sheetnav').replaceChildren();if(result&&result.sheets){result.sheets.forEach((s,i)=>{let b=el('button',{class:i===selected?'active':''},`Sheet ${i+1}`);b.onclick=()=>{selected=i;draw();};$('sheetnav').append(b);});}$('legend').replaceChildren();state.parts.forEach((p,i)=>{let l=el('span'),k=el('i',{class:'key'});k.style.background=colors[i%6];l.append(k,document.createTextNode(p.label));$('legend').append(l);});}
function showUnplaced(){
 const panel=$('unplaced');panel.replaceChildren();panel.hidden=!result||!result.unplaced||!result.unplaced.length;if(panel.hidden)return;
 const groups=new Map();for(const p of result.unplaced){const key=p.groupId??p.id.split('-')[0];if(!groups.has(key))groups.set(key,{...p,count:0});groups.get(key).count++;}
 panel.append(el('h2',{},result.unplaced.length+' pieces left unplaced'),el('p',{class:'hint'},'These pieces could not be placed with the available sheet quantities, dimensions, orientation, saw kerf, and side-remnant constraints.'));
 const table=el('table',{class:'band-table'}),head=el('thead'),headers=el('tr'),body=el('tbody');for(const text of ['Part','Width × height (cm)','Qty','Orientation'])headers.append(el('th',{scope:'col'},text));head.append(headers);
 for(const p of groups.values()){const row=el('tr');for(const text of [p.label,p.w+' × '+p.h,p.count,state.rotate?'90° allowed':'Fixed'])row.append(el('td',{},String(text)));body.append(row);}
 table.append(head,body);const scroll=el('div',{class:'table-scroll'});scroll.append(table);panel.append(scroll);
}
function reportDimension(value, bands) {
  const measurement = el('span', {class:'report-dimension'}, dimension(value));
  if (bands) {
    measurement.setAttribute('aria-label', dimension(value) + ' cm, ' + bands + ' banded ' + (bands === 1 ? 'edge' : 'edges'));
    for (let i = 0; i < bands; i++) {
      measurement.prepend(el('span', {class:'report-band-line', 'aria-hidden':'true'}));
    }
  }
  const cell = el('td');
  cell.append(measurement);
  return cell;
}
function buildReport(){let report=$('print-report');if(!report){report=el('div',{id:'print-report'});document.body.append(report);}report.replaceChildren();result.sheets.forEach((sheet,i)=>{const page=el('section',{class:'report-page'});if(i===0){const summary=el('div',{class:'report-summary'});summary.append(el('div',{class:'eyebrow'},'YOUR CUTTING PLAN'),el('h1',{},'A place for every piece.'),el('p',{class:'report-status'},$('status').textContent));const stats=$('stats').cloneNode(true);stats.removeAttribute('id');stats.className='stats report-stats';const band=el('div',{class:'stat'}),bandValue=el('strong',{},(bandingTotal(state.parts) / 100).toFixed(2)+' ');bandValue.append(el('span',{},'m total'));band.append(el('small',{},'Edge banding'),bandValue);stats.append(band);summary.append(stats);page.append(summary);}page.append(el('h2',{},'Sheet '+(i+1)+' / '+result.sheets.length+' · '+sheet.label+' · '+dimension(sheet.w)+' × '+dimension(sheet.h)+' cm'),el('p',{class:'report-meta'},sheet.pieces.length+' pieces · Saw kerf '+dimension(state.kerf*10)+' mm'));const svg=svgSheet(sheet,false);svg.setAttribute('class','report-diagram');page.append(svg,el('h3',{},'Parts to cut'));const table=el('table',{class:'report-table'}),head=el('thead'),hr=el('tr'),body=el('tbody');for(const t of ['LABEL','WIDTH (cm)','HEIGHT (cm)','QTY'])hr.append(el('th',{scope:'col'},t));head.append(hr);const groups=new Map();
for (const p of sheet.pieces) {
  const {top, bottom, left, right} = p.edges || {};
  const widthEdges = Number(!!top) + Number(!!bottom);
  const heightEdges = Number(!!left) + Number(!!right);
  const [widthBands, heightBands] = p.turn ? [heightEdges, widthEdges] : [widthEdges, heightEdges];
  const key = JSON.stringify([p.label, p.w, p.h, widthBands, heightBands]);
  if (!groups.has(key)) groups.set(key, {...p, widthBands, heightBands, count:0});
  groups.get(key).count++;
}
for (const p of groups.values()) {
  const tr = el('tr');
  tr.append(el('td', {}, p.label), reportDimension(p.w, p.widthBands),
    reportDimension(p.h, p.heightBands), el('td', {}, String(p.count)));
  body.append(tr);
}
table.append(head,body);page.append(table,el('p',{class:'report-meta'},'Dimensions match the orientation shown above.'));report.append(page);});}
function prepareReport(){if(!result||!result.sheets||!result.sheets.length){if(!run())return false;}else if(dirty&&!hasCustomLayout){if(!run())return false;}buildReport();return true;}
window.addEventListener('beforeprint',()=>{prepareReport();});
function run(){hasCustomLayout=false;try{localStorage.removeItem('sheetwise_custom_layout');}catch{}state.rotate=$('rotate').checked;state.parts.forEach(p=>p.allowRotate=state.rotate);state.kerf=Number($('kerf').value)/10;if(!state.parts.length){result={sheets:[],unplaced:[],area:0,used:0,arrangementsEvaluated:0};selected=0;dirty=false;showUnplaced();$('status').textContent='No parts specified. Add a part to begin.';$('stats').replaceChildren();$('error').textContent='';draw();return true;}if(!valid(state)){$('error').textContent='Enter positive dimensions and whole quantities. Maximum: 1,000 parts and kerf 0–100 mm. Enter the available stock sheet quantities.';return false;}$('error').textContent='';const partsToRun=state.parts.map(p=>({...p,qty:(p.qty===''||p.qty===undefined)?1:p.qty}));result=optimize(partsToRun,state.stock,state.kerf,true,true);selected=0;dirty=false;showUnplaced();try{localStorage.setItem('sheetwise',JSON.stringify(state));}catch{}$('status').textContent=result.unplaced.length?`${result.unplaced.length} pieces left unplaced (available sheets or permitted orientation): ${[...new Set(result.unplaced.map(p=>p.label))].join(', ')}`:'Layout ready · '+result.sheets.reduce((t,s)=>t+s.pieces.length,0)+' pieces placed · Best of '+result.arrangementsEvaluated+' arrangements · '+(state.rotate?'Rotation allowed':'Original orientation preserved');let util=result.area?100*result.used/result.area:0;$('stats').replaceChildren();for(let[label,value,unit]of [['Material utilization',util.toFixed(1),'%'],['Sheets required',result.sheets.length,'sheets'],['Unused area',(100-util).toFixed(1),'%']]){let d=el('div',{class:'stat'}),strong=el('strong',{},value+' ');strong.append(el('span',{},unit));d.append(el('small',{},label),strong);$('stats').append(d);}draw();return true;}
$('run').onclick=run;if($('clearparts'))$('clearparts').onclick=clearAllParts;$('rotate').onchange=()=>{state.rotate=$('rotate').checked;state.parts.forEach(p=>p.allowRotate=state.rotate);run();};$('kerf').oninput=changed;$('addpart').onclick=()=>{state.parts.unshift({label:'New part',w:'',h:'',qty:''});rows('parts','parts');changed();count();const firstInput=$('parts').querySelector('input');if(firstInput){firstInput.focus();firstInput.select();}};$('addstock').onclick=()=>{state.stock.push({label:'Stock sheet',w:'',h:''});rows('stock','stocks');changed();};$('print').onclick=()=>{if(!prepareReport())return;window.print();};window.addEventListener('wheel',()=>{if(document.activeElement&&document.activeElement.type==='number')document.activeElement.blur();},{passive:true});if($('kerf'))$('kerf').addEventListener('wheel',()=>$('kerf').blur(),{passive:true});renderInputs();run();restoreLayout();draw();
