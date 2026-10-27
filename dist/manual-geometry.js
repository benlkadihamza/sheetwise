// Geometry shared by the manual editor and its regression checks. Units: cm.
(function(root){
const EPS=1e-7;
function validatePosition(sheet,index,x,y,kerf){
 if(!Number.isFinite(x)||!Number.isFinite(y))return 'Enter a valid X and Y position.';
 const p=sheet.pieces[index];if(!p)return 'Select a part first.';
 if(x<-EPS||y<-EPS||x+p.w>sheet.w+EPS||y+p.h>sheet.h+EPS)return 'Keep the whole part inside the sheet.';
 for(let i=0;i<sheet.pieces.length;i++){if(i===index)continue;const q=sheet.pieces[i];if(!(x+p.w+kerf<=q.x+EPS||q.x+q.w+kerf<=x+EPS||y+p.h+kerf<=q.y+EPS||q.y+q.h+kerf<=y+EPS))return 'That position overlaps a part or leaves too little saw kerf.';}
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
function proposeMove(sheet,index,x,y,kerf){const error=validatePosition(sheet,index,x,y,kerf);if(error)return {error};const candidate={...sheet,pieces:sheet.pieces.map((p,i)=>i===index?{...p,x,y}:p)};const free=partitionSheet(candidate,kerf);return free===null?{error:'This position blocks straight guillotine cuts. Try aligning the part with a row or an edge.'}:{sheet:{...candidate,free},error:''};}
// Snap distance is supplied in sheet units, converted from screen pixels by the editor.
function snapPosition(sheet,index,x,y,kerf,tolerance=1,checkCuts=false){
 const p=sheet.pieces[index];if(!p||!Number.isFinite(x)||!Number.isFinite(y))return {x,y,snapped:false};
 const round=v=>Math.round(v*100000)/100000,raw={x:round(x),y:round(y)},xs=[],ys=[];
 const add=(list,value,rawValue)=>{if(Number.isFinite(value)&&Math.abs(value-rawValue)<=tolerance+EPS&&!list.some(v=>Math.abs(v-value)<EPS))list.push(round(value));};
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
 for(const c of candidates.slice(0,checkCuts?16:1)){if(checkCuts&&proposeMove(sheet,index,c.x,c.y,kerf).error)continue;return {x:c.x,y:c.y,snapped:c.magnets>0};}
 return {...raw,snapped:false};
}
const api={validatePosition,partitionSheet,proposeMove,snapPosition};if(typeof module!=='undefined')module.exports=api;else root.ManualGeometry=api;
})(typeof window!=='undefined'?window:this);
