const assert=require('node:assert/strict'),{snapPosition,validatePosition,proposeMove}=require('./dist/manual-geometry.js');const sheet={w:200,h:120,pieces:[{id:'moving',x:0,y:80,w:20,h:20},{id:'neighbor',x:60,y:10,w:30,h:30}]},k=.4;
let r=snapPosition(sheet,0,38,11,k,4,true);assert.equal(r.x,39.6);assert.equal(r.y,10);assert(r.snapped);assert.equal(validatePosition(sheet,0,r.x,r.y,k),'');assert(!proposeMove(sheet,0,r.x,r.y,k).error);
r=snapPosition(sheet,0,89,11,k,4,true);assert.equal(r.x,90.4);assert.equal(r.y,10);
r=snapPosition(sheet,0,61,39,k,4,true);assert.equal(r.x,60);assert.equal(r.y,40.4);
r=snapPosition(sheet,0,-1,65,k,4,true);assert.equal(r.x,0);assert.equal(r.y,65);
r=snapPosition(sheet,0,100,70,k,4,true);assert.equal(r.x,100);assert.equal(r.y,70);assert(!r.snapped);
const far={w:200,h:160,pieces:[sheet.pieces[0],{x:60,y:120,w:30,h:30}]};r=snapPosition(far,0,90,40,k,4);assert.equal(r.x,90,'Distant parts must not attract the moving part');assert.equal(r.y,40);
for(let x=-5;x<=195;x+=5)for(let y=-5;y<=115;y+=10){r=snapPosition(sheet,0,x,y,k,5);if(r.snapped)assert.equal(validatePosition(sheet,0,r.x,r.y,k),'');}
assert.equal(sheet.pieces[0].x,0);console.log('Snapping passed: left/right/bottom docking, corner alignment, kerf, edges, free movement, distant-part exclusion and 504 candidate positions.');
