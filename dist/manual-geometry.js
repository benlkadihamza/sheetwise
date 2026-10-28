// Geometry shared by the manual editor and its regression checks. Units: cm.
(function(root){
const EPS=1e-7;
function validatePosition(sheet,index,x,y,kerf){
 if(!Number.isFinite(x)||!Number.isFinite(y))return 'Enter a valid X and Y position.';
 const p=sheet.pieces[index];if(!p)return 'Select a part first.';
 if(x<-EPS||y<-EPS||x+p.w>sheet.w+EPS||y+p.h>sheet.h+EPS)return 'Keep the whole part inside the sheet.';
 for(let i=0;i<sheet.pieces.length;i++){if(i===index)continue;const q=sheet.pieces[i];if(!(x+p.w+kerf<=q.x+EPS||q.x+q.w+kerf<=x+EPS||y+p.h+kerf<=q.y+EPS||q.y+q.h+kerf<=y+EPS)){const overlaps=x+p.w>q.x+EPS&&q.x+q.w>x+EPS&&y+p.h>q.y+EPS&&q.y+q.h>y+EPS;return overlaps?'That position overlaps '+(q.label||'another part')+'.':'Leave at least '+Number((kerf*10).toFixed(4))+' mm saw kerf between this part and '+(q.label||'the neighboring part')+'.';}}
 return '';
}
// Recover a guillotine partition, including actual offcuts and blade-width strips.
function partitionSheet(sheet,kerf){
 let budget=12000;
 function carve(r,parts){
  if(--budget<0)return null;if(!parts.length)return r.w>EPS&&r.h>EPS?[r]:[];
  if(parts.length===1){const p=parts[0];if(Math.abs(p.x-r.x)<EPS&&Math.abs(p.y-r.y)<EPS&&Math.abs(p.w-r.w)<EPS&&Math.abs(p.h-r.h)<EPS)return [];}
  for(const axis of ['x','y']){const size=axis==='x'?'w':'h',end=r[axis]+r[size],candidates=new Set(parts.flatMap(p=>[p[axis]-kerf,p[axis]+p[size]]));
   for(const c of candidates){const a=Math.max(r[axis],c),b=Math.min(end,c+kerf);if(a<r[axis]-EPS||b>end+EPS||a>b+EPS||a>=end-EPS||b<=r[axis]+EPS)continue;
    const left=[],right=[];let crossing=false;for(const p of parts){if(p[axis]+p[size]<=a+EPS)left.push(p);else if(p[axis]>=b-EPS)right.push(p);else{crossing=true;break;}}if(crossing)continue;
    const l={...r,[size]:a-r[axis]},rr={...r,[axis]:b,[size]:end-b};const first=carve(l,left);if(first===null)continue;const second=carve(rr,right);if(second!==null)return first.concat(second);
   }
  }return null;
 }
 return carve({x:0,y:0,w:sheet.w,h:sheet.h},sheet.pieces);
}
// Conservative, non-overlapping free rectangles for manually arranged layouts.
// Keep blade-clearance strips out of reusable space even without a guillotine tree.
function freeRectangles(sheet,kerf){let free=[{x:0,y:0,w:sheet.w,h:sheet.h}];for(const p of sheet.pieces){const bx=Math.max(0,p.x-kerf),by=Math.max(0,p.y-kerf),br=Math.min(sheet.w,p.x+p.w+kerf),bb=Math.min(sheet.h,p.y+p.h+kerf),next=[];for(const f of free){const l=Math.max(f.x,bx),t=Math.max(f.y,by),r=Math.min(f.x+f.w,br),b=Math.min(f.y+f.h,bb);if(r<=l+EPS||b<=t+EPS){next.push(f);continue;}if(t>f.y+EPS)next.push({x:f.x,y:f.y,w:f.w,h:t-f.y});if(b<f.y+f.h-EPS)next.push({x:f.x,y:b,w:f.w,h:f.y+f.h-b});if(l>f.x+EPS)next.push({x:f.x,y:t,w:l-f.x,h:b-t});if(r<f.x+f.w-EPS)next.push({x:r,y:t,w:f.x+f.w-r,h:b-t});}free=next;}return free;}
function analyzeManualSheet(sheet,kerf){const partition=partitionSheet(sheet,kerf);return {...sheet,free:partition===null?freeRectangles(sheet,kerf):partition,isGuillotine:partition!==null};}
function proposeMove(sheet,index,x,y,kerf){const error=validatePosition(sheet,index,x,y,kerf);if(error)return {error};const candidate={...sheet,pieces:sheet.pieces.map((p,i)=>i===index?{...p,x,y}:p)};return {sheet:analyzeManualSheet(candidate,kerf),error:''};}
// Snap distance is supplied in sheet units, converted from screen pixels by the editor.
function snapPosition(sheet,index,x,y,kerf,tolerance=1,checkCuts=false){
 const p=sheet.pieces[index];if(!p||!Number.isFinite(x)||!Number.isFinite(y))return {x,y,snapped:false};
 const round=v=>Math.round(v*100000)/100000,raw={x:round(x),y:round(y)},xs=[],ys=[];
 const add=(list,value,rawValue)=>{if(Number.isFinite(value)&&Math.abs(value-rawValue)<=tolerance+EPS&&!list.some(v=>Math.abs(v-value)<EPS))list.push(value);};
 add(xs,0,x);add(xs,sheet.w-p.w,x);add(ys,0,y);add(ys,sheet.h-p.h,y);
 for(let i=0;i<sheet.pieces.length;i++){if(i===index)continue;const q=sheet.pieces[i];
  const nearY=y+p.h>=q.y-tolerance&&y<=q.y+q.h+tolerance,nearX=x+p.w>=q.x-tolerance&&x<=q.x+q.w+tolerance;
  const dockXs=[q.x+q.w+kerf,q.x-p.w-kerf],dockYs=[q.y+q.h+kerf,q.y-p.h-kerf];
  if(nearY)for(const value of dockXs)add(xs,value,x);
  if(nearX)for(const value of dockYs)add(ys,value,y);
  if(nearY&&dockXs.some(v=>Math.abs(v-x)<=tolerance)){add(ys,q.y,y);add(ys,q.y+q.h-p.h,y);}
  if(nearX&&dockYs.some(v=>Math.abs(v-y)<=tolerance)){add(xs,q.x,x);add(xs,q.x+q.w-p.w,x);}
 }
 const limit=(values,value)=>values.sort((a,b)=>Math.abs(a-value)-Math.abs(b-value)).slice(0,8);
 const xOptions=limit(xs,x),yOptions=limit(ys,y);if(!xOptions.some(v=>Math.abs(v-raw.x)<EPS))xOptions.push(raw.x);if(!yOptions.some(v=>Math.abs(v-raw.y)<EPS))yOptions.push(raw.y);
 const candidates=[];for(const xx of xOptions)for(const yy of yOptions){if(validatePosition(sheet,index,xx,yy,kerf))continue;const magnets=(xs.includes(xx)?1:0)+(ys.includes(yy)?1:0);candidates.push({x:xx,y:yy,magnets,distance:Math.hypot(xx-x,yy-y)});}
 candidates.sort((a,b)=>b.magnets-a.magnets||a.distance-b.distance);
 for(const c of candidates.slice(0,checkCuts?32:1)){if(checkCuts&&proposeMove(sheet,index,c.x,c.y,kerf).error)continue;return {x:c.x,y:c.y,snapped:c.magnets>0};}
 if(checkCuts){
  // Keep a safe raw drop available even when many nearby magnets were considered.
  if(!proposeMove(sheet,index,x,y,kerf).error)return {x,y,snapped:false};
  // Find nearby real free rectangles with this piece removed. Clamp into a slot,
  // retaining exact cut coordinates rather than rounding away the kerf clearance.
  const empty={...sheet,pieces:sheet.pieces.filter((_,i)=>i!==index)},free=analyzeManualSheet(empty,kerf).free,nearby=[];
  for(const f of free){if(p.w>f.w+EPS||p.h>f.h+EPS)continue;const xx=Math.min(Math.max(x,f.x),f.x+f.w-p.w),yy=Math.min(Math.max(y,f.y),f.y+f.h-p.h),distance=Math.hypot(xx-x,yy-y);if(distance<=tolerance+EPS)nearby.push({x:xx,y:yy,distance});}
  nearby.sort((a,b)=>a.distance-b.distance);for(const c of nearby){if(!proposeMove(sheet,index,c.x,c.y,kerf).error)return {x:c.x,y:c.y,snapped:true,corrected:true};}
 }
 return {...raw,snapped:false};
}
function layoutWithSheets(result,sheets){return {...result,sheets,area:sheets.reduce((sum,s)=>sum+s.w*s.h,0),used:sheets.reduce((sum,s)=>sum+s.pieces.reduce((a,p)=>a+p.w*p.h,0),0)};}
// Search real geometric gaps, including spaces crossing reported remnant boundaries.
// For each relevant X edge, sweep upward past collisions to the first safe Y.
function findSheetPlacement(target,piece,kerf,allowRotate=false){
 const variants=[{...piece}];if(allowRotate&&piece.w!==piece.h)variants.push({...piece,w:piece.h,h:piece.w,turn:!piece.turn});
 const sorted=[...target.pieces].sort((a,b)=>a.y-b.y);let best;
 for(const variant of variants){if(variant.w>target.w+EPS||variant.h>target.h+EPS)continue;
  const xs=[0,target.w-variant.w,...target.pieces.flatMap(q=>[q.x,q.x+q.w+kerf,q.x-variant.w-kerf])];
  for(const x of new Set(xs)){if(x<-EPS||x+variant.w>target.w+EPS)continue;let y=0;
   for(const q of sorted){if(x+variant.w+kerf<=q.x+EPS||q.x+q.w+kerf<=x+EPS)continue;if(y+variant.h+kerf<=q.y+EPS||q.y+q.h+kerf<=y+EPS)continue;y=q.y+q.h+kerf;}
   if(y+variant.h>target.h+EPS)continue;const draft={...target,pieces:[...target.pieces,{...variant,x,y,done:false}]};if(validatePosition(draft,target.pieces.length,x,y,kerf))continue;
   const score=y*(target.w+1)+x;if(!best||score<best.score-EPS)best={piece:draft.pieces.at(-1),score};
  }
 }return best?best.piece:null;
}
function transferToEarlierSheet(result,from,index,kerf,allowRotate=false){
 const source=result.sheets[from],piece=source?.pieces[index];if(from<=0||!piece)return null;
 for(let targetIndex=0;targetIndex<from;targetIndex++){const target=result.sheets[targetIndex],placed=findSheetPlacement(target,piece,kerf,allowRotate);if(!placed)continue;
  const sheets=[...result.sheets];sheets[targetIndex]=analyzeManualSheet({...target,pieces:[...target.pieces,placed]},kerf);sheets[from]=analyzeManualSheet({...source,pieces:source.pieces.filter((_,i)=>i!==index)},kerf);const removedSource=!sheets[from].pieces.length;if(removedSource)sheets.splice(from,1);
  return {result:layoutWithSheets(result,sheets),targetIndex,pieceIndex:target.pieces.length,removedSource};
 }return null;
}
// Existing parts stay at their chosen coordinates. Only later-board pieces move forward.
function refillEarlierSheets(result,kerf,canRotate=()=>false,skipIds=[]){
 let sheets=[...result.sheets];const transfers=[],skip=new Set(skipIds);
 for(let targetIndex=0;targetIndex<sheets.length-1;targetIndex++){
  while(true){const candidates=[];for(let from=targetIndex+1;from<sheets.length;from++)for(let index=0;index<sheets[from].pieces.length;index++){const piece=sheets[from].pieces[index];if(!skip.has(piece.id))candidates.push({from,index,piece});}
   candidates.sort((a,b)=>b.piece.w*b.piece.h-a.piece.w*a.piece.h||a.from-b.from||a.index-b.index);let choice;
   for(const candidate of candidates){const placed=findSheetPlacement(sheets[targetIndex],candidate.piece,kerf,canRotate(candidate.piece));if(placed){choice={...candidate,placed};break;}}
   if(!choice)break;const {from,index,piece,placed}=choice,target=sheets[targetIndex],source=sheets[from];sheets[targetIndex]={...target,pieces:[...target.pieces,placed]};sheets[from]={...source,pieces:source.pieces.filter((_,i)=>i!==index)};
   transfers.push({id:piece.id,label:piece.label,from:from+1,to:targetIndex+1});if(!sheets[from].pieces.length)sheets.splice(from,1);
  }
 }
 if(!transfers.length)return {result,transfers,removedBoards:0};
 // Analyze once per remaining board, after all transfers, for PDF/offcut accuracy.
 sheets=sheets.map(sheet=>analyzeManualSheet(sheet,kerf));return {result:layoutWithSheets(result,sheets),transfers,removedBoards:result.sheets.length-sheets.length};
}
function restoreLayoutSheets(saved,baseline,parts,kerf,rotate){try{
 if(!Array.isArray(saved?.sheets)||saved.sheets.length>baseline.sheets.length)return null;
 const expected=new Map(baseline.sheets.flatMap(s=>s.pieces).map(p=>[p.id,p])),seen=new Set(),stockCounts=new Map(),key=s=>JSON.stringify([s.label,s.w,s.h]);baseline.sheets.forEach(s=>stockCounts.set(key(s),(stockCounts.get(key(s))||0)+1));const restored=[];
 for(const raw of saved.sheets){const stockKey=key(raw),count=stockCounts.get(stockKey)||0;if(!count||!Array.isArray(raw.pieces)||!raw.pieces.length)return null;stockCounts.set(stockKey,count-1);const sheet={...raw,pieces:[]};
  for(const p of raw.pieces){const original=expected.get(p.id);if(!original||seen.has(p.id))return null;const base=parts[original.groupId];if(!base)return null;const turn=!!p.turn;if(turn!==!!original.turn&&!(rotate&&base.allowRotate===true))return null;const w=turn?base.h:base.w,h=turn?base.w:base.h;if(Math.abs(p.w-w)>EPS||Math.abs(p.h-h)>EPS)return null;sheet.pieces.push({...original,x:p.x,y:p.y,w,h,turn,done:!!p.done});seen.add(p.id);}
  for(let i=0;i<sheet.pieces.length;i++)if(validatePosition(sheet,i,sheet.pieces[i].x,sheet.pieces[i].y,kerf))return null;restored.push(analyzeManualSheet(sheet,kerf));
 }return seen.size===expected.size?restored:null;
 }catch{return null;}}
const api={validatePosition,partitionSheet,freeRectangles,analyzeManualSheet,proposeMove,snapPosition,layoutWithSheets,findSheetPlacement,transferToEarlierSheet,refillEarlierSheets,restoreLayoutSheets};if(typeof module!=='undefined')module.exports=api;else root.ManualGeometry=api;
})(typeof window!=='undefined'?window:this);
