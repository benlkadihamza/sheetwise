// Maximal free rectangles can overlap during search; exported remnants never do.
function splitPackingFree(free,block){const next=[],eps=1e-8;for(const f of free){if(block.x>=f.x+f.w-eps||block.x+block.w<=f.x+eps||block.y>=f.y+f.h-eps||block.y+block.h<=f.y+eps){next.push(f);continue;}if(block.x>f.x+eps)next.push({x:f.x,y:f.y,w:block.x-f.x,h:f.h});if(block.x+block.w<f.x+f.w-eps)next.push({x:block.x+block.w,y:f.y,w:f.x+f.w-block.x-block.w,h:f.h});if(block.y>f.y+eps)next.push({x:f.x,y:f.y,w:f.w,h:block.y-f.y});if(block.y+block.h<f.y+f.h-eps)next.push({x:f.x,y:block.y+block.h,w:f.w,h:f.y+f.h-block.y-block.h});}return next.filter((a,i)=>!next.some((b,j)=>j!==i&&a.x>=b.x-eps&&a.y>=b.y-eps&&a.x+a.w<=b.x+b.w+eps&&a.y+a.h<=b.y+b.h+eps&&(j<i||a.w*a.h<b.w*b.h-eps)));}
function nonOverlappingOffcuts(sheet,kerf){let free=[{x:0,y:0,w:sheet.w,h:sheet.h}];for(const p of sheet.pieces){const next=[];for(const f of free){const l=Math.max(f.x,p.x),t=Math.max(f.y,p.y),r=Math.min(f.x+f.w,p.x+p.w+kerf),b=Math.min(f.y+f.h,p.y+p.h+kerf);if(r<=l+1e-8||b<=t+1e-8){next.push(f);continue;}if(t>f.y+1e-8)next.push({x:f.x,y:f.y,w:f.w,h:t-f.y});if(b<f.y+f.h-1e-8)next.push({x:f.x,y:b,w:f.w,h:f.y+f.h-b});if(l>f.x+1e-8)next.push({x:f.x,y:t,w:l-f.x,h:b-t});if(r<f.x+f.w-1e-8)next.push({x:r,y:t,w:f.x+f.w-r,h:b-t});}free=next;}return free;}
function placeFreeGroup(board,group,kerf,rotate,policy=0){let free=board._packingFree||[{x:0,y:0,w:board.w+kerf,h:board.h+kerf}],pieces=[...board.pieces];const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
for(const p of group){let best;for(const f of free)for(const turn of (rotate&&p.allowRotate&&p.w!==p.h?[false,true]:[false])){const w=turn?p.h:p.w,h=turn?p.w:p.h,pw=w+kerf,ph=h+kerf;if(pw>f.w+1e-8||ph>f.h+1e-8)continue;const corners=policy===3?[[f.x,f.y],[f.x+f.w-pw,f.y],[f.x,f.y+f.h-ph],[f.x+f.w-pw,f.y+f.h-ph]]:[[f.x,f.y]];for(const [x,y]of corners){const dw=f.w-pw,dh=f.h-ph;let contact=0;if(policy===3){if(Math.abs(x)<1e-8||Math.abs(x+w-board.w)<1e-8)contact+=h;if(Math.abs(y)<1e-8||Math.abs(y+h-board.h)<1e-8)contact+=w;for(const q of pieces){if(Math.abs(x+w+kerf-q.x)<1e-8||Math.abs(q.x+q.w+kerf-x)<1e-8)contact+=overlap(y,y+h,q.y,q.y+q.h);if(Math.abs(y+h+kerf-q.y)<1e-8||Math.abs(q.y+q.h+kerf-y)<1e-8)contact+=overlap(x,x+w,q.x,q.x+q.w);}}const score=policy===3?-contact:policy===1?f.w*f.h-pw*ph:policy===2?y*(board.w+1)+x:Math.min(dw,dh),tie=policy===0?Math.max(dw,dh):y*(board.w+1)+x;if(!best||score<best.score-1e-8||(Math.abs(score-best.score)<1e-8&&tie<best.tie))best={x,y,w,h,pw,ph,turn,score,tie};}}if(!best)return null;pieces.push({...p,x:best.x,y:best.y,w:best.w,h:best.h,turn:best.turn});free=splitPackingFree(free,{x:best.x,y:best.y,w:best.pw,h:best.ph});}return {...board,pieces,_packingFree:free};}
function betterLayout(a,b){if(!b)return true;if(a.unplaced.length!==b.unplaced.length)return a.unplaced.length<b.unplaced.length;if(Math.abs(a.used-b.used)>1e-8)return a.used>b.used;if(a.sheets.length!==b.sheets.length)return a.sheets.length<b.sheets.length;if(Math.abs(a.area-b.area)>1e-8)return a.area<b.area;const filled=earlierBoardFillComparison(a,b);if(filled)return filled>0;if(prefersReusableOffcuts(a,b))return true;if(prefersReusableOffcuts(b,a))return false;for(let i=0;i<a.sheets.length;i++){const d=a.sheets[i].pieces.length-b.sheets[i].pieces.length;if(d)return d>0;}return false;}
function searchFreeRotation(groups,stock,kerf,orders,baseline){let best=baseline,evaluated=0;const size=groups.length,budget=size>200?6:24,selected=orders.filter((_,i)=>i<(size>200?4:8)||i>=orders.length-(size>200?2:16)).slice(0,budget),seen=new Set();for(const rotate of (size<=80?[false,true]:[true]))for(const policy of (size>200?[0,1]:size<=80?[0,1,2,3]:[0,1,2]))for(const direction of [1,-1])for(const order of selected){const key=[rotate,policy,direction,order.map(g=>g[0].groupId).join(',')].join(':');if(seen.has(key))continue;seen.add(key);evaluated++;const remaining=[...order],supply=stock.flatMap(s=>s.qty===undefined?[{...s,unlimited:true}]:Array.from({length:s.qty},()=>({...s}))).sort((a,b)=>direction*(a.w*a.h-b.w*b.h)),sheets=[],unplaced=[];while(remaining.length){let placed=false;for(let si=0;si<sheets.length&&!placed;si++)for(let gi=0;gi<remaining.length;gi++){const trial=placeFreeGroup(sheets[si],remaining[gi],kerf,rotate,policy);if(trial){sheets[si]=trial;remaining.splice(gi,1);placed=true;break;}}if(placed)continue;for(let si=0;si<supply.length&&!placed;si++)for(let gi=0;gi<remaining.length;gi++){const raw=supply[si],trial=placeFreeGroup({...raw,pieces:[]},remaining[gi],kerf,rotate,policy);if(trial){sheets.push(trial);if(!raw.unlimited)supply.splice(si,1);remaining.splice(gi,1);placed=true;break;}}if(!placed){unplaced.push(...remaining.flat());break;}}const output=sheets.map(({_packingFree,...sheet})=>({...sheet,free:nonOverlappingOffcuts(sheet,kerf),isGuillotine:false,packingMode:'free-rotation'})),candidate={sheets:output,unplaced,area:output.reduce((sum,s)=>sum+s.w*s.h,0),used:output.reduce((sum,s)=>sum+s.pieces.reduce((a,p)=>a+p.w*p.h,0),0),packingMode:'free-rotation'};if(betterLayout(candidate,best))best=candidate;}return {best,evaluated};}

function earlierBoardFillComparison(a,b){for(let i=0;i<Math.max(a.sheets.length,b.sheets.length);i++){const fill=s=>s?s.pieces.reduce((sum,p)=>sum+p.w*p.h,0)/(s.w*s.h):0,difference=fill(a.sheets[i])-fill(b.sheets[i]);if(Math.abs(difference)>1e-9)return difference>0?1:-1;}return 0;}
// Reward large solid offcuts, then fewer fragments and compact top-left placement.
function reusableOffcutScore(layout){let squares=0,largest=0,fragments=0,compactness=0;for(const sheet of layout.sheets){for(const f of sheet.free){const area=f.w*f.h;squares+=area*area;largest=Math.max(largest,area);fragments++;}for(const p of sheet.pieces)compactness+=(p.x+p.y)*p.w*p.h;}return {squares,largest,fragments,compactness};}
function prefersReusableOffcuts(a,b){const x=reusableOffcutScore(a),y=reusableOffcutScore(b);if(Math.abs(x.squares-y.squares)>1e-6)return x.squares>y.squares;if(Math.abs(x.largest-y.largest)>1e-8)return x.largest>y.largest;if(x.fragments!==y.fragments)return x.fragments<y.fragments;if(Math.abs(x.compactness-y.compactness)>1e-6)return x.compactness<y.compactness;return false;}
// A group is one part-list row. Trials never mutate a board unless every copy fits.
function placeGroup(board,group,kerf,rotate,policy=0){
 let best;const quality=s=>policy===1?s.free.reduce((t,f)=>t+(f.w*f.h)**2,0):policy===2?-s.free.length:Math.max(0,...s.free.map(f=>f.w*f.h));
 for(const split of ['auto','horizontal','vertical'])for(const preferTurn of [false,true]){
  const s={...board,free:board.free.map(f=>({...f})),pieces:[...board.pieces]};let complete=true;
  for(const p of group){let choice;
   s.free.forEach((f,fi)=>{for(const turn of (rotate&&p.allowRotate===true&&p.w!==p.h?(preferTurn?[true,false]:[false,true]):[false])){const w=turn?p.h:p.w,h=turn?p.w:p.h;if(w<=f.w+1e-8&&h<=f.h+1e-8){const dw=f.w-w,dh=f.h-h,score=policy===3?Math.min(dw,dh)+Math.max(dw,dh)*1e-6:policy===4?Math.max(dw,dh)+Math.min(dw,dh)*1e-6:f.w*f.h-w*h;if(!choice||score<choice.score)choice={fi,w,h,turn,score};}}});
   if(!choice){complete=false;break;}
   const {fi,w,h,turn}=choice,f=s.free.splice(fi,1)[0];s.pieces.push({...p,x:f.x,y:f.y,w,h,turn});
   const rw=f.w-w-kerf,rh=f.h-h-kerf;
   if(split==='vertical'||(split==='auto'&&rw>rh)){if(rw>0)s.free.push({x:f.x+w+kerf,y:f.y,w:rw,h:f.h});if(rh>0)s.free.push({x:f.x,y:f.y+h+kerf,w,h:rh});}
   else{if(rh>0)s.free.push({x:f.x,y:f.y+h+kerf,w:f.w,h:rh});if(rw>0)s.free.push({x:f.x+w+kerf,y:f.y,w:rw,h});}
  }
  // Keep every reusable leftover connected to the outside of the board.
  // Saw kerf remains between cuts; it is not a reusable leftover rectangle.
  const edgeWasteOnly=s.free.every(f=>f.x+f.w>=s.w-1e-8||f.y+f.h>=s.h-1e-8);
  if(complete&&edgeWasteOnly&&(!best||quality(s)>quality(best)))best=s;
 }return best;
}
function optimize(parts,stock,kerf,rotate,splitQuantities=false){
 const batches=parts.map((p,i)=>Array.from({length:p.qty},(_,j)=>({...p,groupId:i,id:`${i}-${j}`,color:i%6})));const groups=splitQuantities?batches.flat().map(p=>[p]):batches;let best;
 const orders=[];
 if(groups.length<=5){const permutations=(prefix,left)=>{if(!left.length){orders.push(prefix);return;}left.forEach((g,i)=>permutations([...prefix,g],left.filter((_,j)=>j!==i)));};permutations([],groups);}
 for(const score of [g=>g.length*g[0].w*g[0].h,g=>g[0].w*g[0].h,g=>g.length,g=>g[0].w,g=>g[0].h,g=>Math.max(g[0].w,g[0].h),g=>-g[0].w*g[0].h,g=>-Math.max(g[0].w,g[0].h)])orders.push([...groups].sort((a,b)=>score(b)-score(a)));
 let seed=123456789;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const attempts=groups.flat().length>200?8:32;
 for(let n=0;n<attempts;n++){const order=[...groups];for(let i=order.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}orders.push(order);}
 const seen=new Set();let evaluated=0;
 for(const rotationMode of (rotate&&parts.some(p=>p.allowRotate)?[false,true]:[false]))for(const policy of (splitQuantities&&groups.length<=80?[0,1,2,3,4]:[0,1,2]))for(const stockDirection of [1,-1])for(const order of orders){
  const key=rotationMode+':'+policy+':'+stockDirection+':'+order.map(g=>g[0].groupId).join(',');if(seen.has(key))continue;seen.add(key);evaluated++;
  const remaining=[...order];
  const supply=stock.flatMap(s=>s.qty===undefined?[{...s,unlimited:true}]:Array.from({length:s.qty},()=>({...s}))).sort((a,b)=>stockDirection*(a.w*a.h-b.w*b.h)),sheets=[],unplaced=[];
  while(remaining.length){let placed=false;
   for(let si=0;si<sheets.length&&!placed;si++)for(let gi=0;gi<remaining.length;gi++){let trial=placeGroup(sheets[si],remaining[gi],kerf,rotationMode,policy);if(trial){sheets[si]=trial;remaining.splice(gi,1);placed=true;break;}}
   if(placed)continue;
   for(let si=0;si<supply.length&&!placed;si++)for(let gi=0;gi<remaining.length;gi++){
    const raw=supply[si],trial=placeGroup({...raw,free:[{x:0,y:0,w:raw.w,h:raw.h}],pieces:[]},remaining[gi],kerf,rotationMode,policy);
    if(trial){sheets.push(trial);if(!raw.unlimited)supply.splice(si,1);remaining.splice(gi,1);placed=true;break;}
   }
   if(!placed){unplaced.push(...remaining.flat());break;}
  }
  const area=sheets.reduce((t,s)=>t+s.w*s.h,0),r={sheets,unplaced,area,used:sheets.reduce((t,s)=>t+s.pieces.reduce((a,p)=>a+p.w*p.h,0),0)};
  if(splitQuantities&&sheets.some((board,i)=>[...sheets.slice(i+1).flatMap(b=>b.pieces),...unplaced].some(p=>placeGroup(board,[{...p,w:parts[p.groupId].w,h:parts[p.groupId].h}],kerf,rotate))))continue;

  // First place all parts, then minimize panel count, then consumed stock area.
  if(betterLayout(r,best))best=r;
 }if(splitQuantities&&rotate&&parts.some(p=>p.allowRotate)){const searched=searchFreeRotation(groups,stock,kerf,orders,best);best=searched.best;evaluated+=searched.evaluated;}best.arrangementsEvaluated=evaluated;return best;
}
if(typeof module!=='undefined')module.exports={optimize,placeGroup,reusableOffcutScore,earlierBoardFillComparison,placeFreeGroup,nonOverlappingOffcuts};
