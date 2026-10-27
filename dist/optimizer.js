// A group is one part-list row. Trials never mutate a board unless every copy fits.
function placeGroup(board,group,kerf,rotate,policy=0){
 let best;const quality=s=>policy===1?s.free.reduce((t,f)=>t+(f.w*f.h)**2,0):policy===2?-s.free.length:Math.max(0,...s.free.map(f=>f.w*f.h));
 for(const split of ['auto','horizontal','vertical'])for(const preferTurn of [false,true]){
  const s={...board,free:board.free.map(f=>({...f})),pieces:[...board.pieces]};let complete=true;
  for(const p of group){let choice;
   s.free.forEach((f,fi)=>{for(const turn of (rotate&&p.allowRotate===true&&p.w!==p.h?(preferTurn?[true,false]:[false,true]):[false])){const w=turn?p.h:p.w,h=turn?p.w:p.h;if(w<=f.w+1e-8&&h<=f.h+1e-8){const score=f.w*f.h-w*h;if(!choice||score<choice.score)choice={fi,w,h,turn,score};}}});
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
 for(const rotationMode of (rotate&&parts.some(p=>p.allowRotate)?[false,true]:[false]))for(const policy of [0,1,2])for(const stockDirection of [1,-1])for(const order of orders){
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
  const earlierSheetsFuller=(a,b)=>{for(let i=0;i<Math.max(a.sheets.length,b.sheets.length);i++){const difference=(a.sheets[i]?.pieces.length||0)-(b.sheets[i]?.pieces.length||0);if(difference)return difference>0;}return false;};
  if(!best||r.unplaced.length<best.unplaced.length||(r.unplaced.length===best.unplaced.length&&(r.used>best.used+1e-8||(Math.abs(r.used-best.used)<1e-8&&(r.area<best.area-1e-8||(Math.abs(r.area-best.area)<1e-8&&(r.sheets.length<best.sheets.length||(r.sheets.length===best.sheets.length&&earlierSheetsFuller(r,best)))))))))best=r;
 }best.arrangementsEvaluated=evaluated;return best;
}
if(typeof module!=='undefined')module.exports={optimize,placeGroup};
