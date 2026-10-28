const assert=require('node:assert/strict');
const {optimize,batchOrder,cuttingBatchKey}=require('./dist/optimizer.js');
const a={label:'Door',w:30,h:20,allowRotate:true},b={label:'Shelf',w:50,h:40,allowRotate:true},c={label:'One-off',w:10,h:10};
const groups=[[c],[b],[a],[{...a,label:'Duplicate row'}],[b]];
assert.deepEqual(batchOrder({pieces:[]},groups),[1,4,2,3,0]);
assert.deepEqual(batchOrder({pieces:[a]},groups),[1,4,2,3,0]);
assert.equal(cuttingBatchKey(a),cuttingBatchKey({...a,label:'Another label'}));
assert.notEqual(cuttingBatchKey(a),cuttingBatchKey({...a,edges:{top:true}}));
assert.notEqual(cuttingBatchKey(a),cuttingBatchKey({...a,allowRotate:false}));
assert.equal(cuttingBatchKey({...a,w:20,h:30}),cuttingBatchKey({...a,w:20,h:30}));
for(const rotate of [false,true]){
 const ps=[{label:'Main',w:60,h:100,qty:3,allowRotate:rotate},{label:'Fill',w:40,h:50,qty:5,allowRotate:rotate}];
 const r=optimize(ps,[{w:100,h:100}],0,rotate,true);
 assert.equal(r.unplaced.length,0);assert.equal(r.sheets.length,3);
 assert.deepEqual(r.sheets.map(s=>s.pieces.map(p=>p.groupId)),[[0,1,1],[0,1,1],[0,1]]);
 assert.deepEqual(r.sheets.map(s=>s.pieces.reduce((n,p)=>n+p.w*p.h,0)),[10000,10000,8000]);
}
const dup=optimize([{label:'A',w:50,h:50,qty:2},{label:'B',w:50,h:50,qty:2}],[{w:100,h:100}],0,false,true);
assert.equal(dup.sheets.length,1);assert.equal(new Set(dup.sheets[0].pieces.map(p=>p.id)).size,4);assert.equal(new Set(dup.sheets[0].pieces.map(p=>p.label)).size,2);
const limited=optimize([{w:50,h:50,qty:9}],[{w:100,h:100,qty:1}],0,false,true);assert.equal(limited.sheets[0].pieces.length,4);assert.equal(limited.unplaced.length,5);
console.log('Batch-first passed: large-first priority with identical-batch continuation, duplicate rows, edge/orientation distinctions, restarted batches and gap fillers on every board, stock limits and original labels/IDs.');

const strips=optimize([{w:60,h:20,qty:10},{w:40,h:25,qty:7}],[{w:100,h:100}],0,false,true);assert.equal(strips.sheets.length,2);assert.deepEqual(strips.sheets.map(s=>s.pieces.reduce((n,p)=>n+p.w*p.h,0)),[10000,9000]);for(const sheet of strips.sheets){const main=sheet.pieces.filter(p=>p.groupId===0);assert.equal(main.length,5);assert.equal(new Set(main.map(p=>p.x)).size,1);assert.equal(new Set(main.map(p=>p.y)).size,5);}console.log('Shared-strip batches passed: 5 identical pieces aligned per board; fillers use the remaining strip; first board 100%, second 90%.');

for(const rotate of [false,true]){const parts=[{label:'Small',w:20,h:20,qty:12,allowRotate:rotate},{label:'Large',w:60,h:100,qty:3,allowRotate:rotate}],r=optimize(parts,[{w:100,h:100}],0,rotate,true);assert.equal(r.unplaced.length,0);assert.equal(r.sheets.length,3);for(const board of r.sheets)assert.equal(board.pieces[0].label,'Large','Each board must start large, even when small parts are listed first');}console.log('Large-first passed on every board, with rotation on/off and small parts entered first.');
