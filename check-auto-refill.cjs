const assert=require('node:assert/strict'),G=require('./dist/manual-geometry.js');
const piece=(id,w,h,x=0,y=0,groupId=0)=>({id,label:id,w,h,x,y,groupId,turn:false});
const sheet=pieces=>({label:'Board',w:100,h:100,pieces,free:[]});
const layout=sheets=>G.layoutWithSheets({unplaced:[],arrangementsEvaluated:1},sheets);
function verify(r,k){const ids=new Set();for(const s of r.sheets)for(let i=0;i<s.pieces.length;i++){const p=s.pieces[i];assert(!ids.has(p.id));ids.add(p.id);assert.equal(G.validatePosition(s,i,p.x,p.y,k),'');}return [...ids].sort();}
// User example: only moving the blocker on board 3 makes a 40x60 gap for board 4.
const original=layout([sheet([piece('Full 1',100,100)]),sheet([piece('Full 2',100,100,0,0,1)]),sheet([piece('Shift',60,100,20,0,2)]),sheet([piece('Incoming',40,60,0,0,3)])]);
assert.equal(G.refillEarlierSheets(original,0).transfers.length,0);
const moved=G.proposeMove(original.sheets[2],0,0,0,0);assert(!moved.error);
const draft=layout([...original.sheets.slice(0,2),moved.sheet,original.sheets[3]]),before=JSON.stringify(draft);
let fill=G.refillEarlierSheets(draft,0,()=>false,['Shift']);assert.equal(fill.transfers.length,1);assert.equal(fill.transfers[0].to,3);assert.equal(fill.removedBoards,1);assert.equal(fill.result.sheets.length,3);assert.equal(fill.result.used,original.used);assert.equal(fill.result.area,30000);assert.deepEqual(verify(fill.result,0),verify(original,0));assert.equal(JSON.stringify(draft),before,'Undo snapshot must stay intact');assert.equal(fill.result.sheets[2].pieces.find(p=>p.id==='Shift').x,0);assert(G.restoreLayoutSheets(fill.result,original,[{w:100,h:100},{w:100,h:100},{w:60,h:100},{w:40,h:60}],0,false),'Automatically consolidated layout must restore from storage');
// Kerf and permitted orientation: 20cm strip needs a rotation, with exact 4mm clearance.
const tight=layout([sheet([piece('Block',79.6,100)]),sheet([piece('Rotate me',60,20)])]);assert.equal(G.refillEarlierSheets(tight,.4,()=>false).transfers.length,0);fill=G.refillEarlierSheets(tight,.4,()=>true);assert.equal(fill.result.sheets.length,1);assert(fill.result.sheets[0].pieces[1].turn);verify(fill.result,.4);
// Cascading fill, large candidates first, no duplicate/lost pieces or stale stock totals.
const cascade=layout([sheet([piece('Anchor',60,100)]),sheet([piece('Small',20,30)]),sheet([piece('Large',40,60)])]);fill=G.refillEarlierSheets(cascade,0);assert.equal(fill.transfers[0].id,'Large');assert.equal(fill.result.sheets.length,1);assert.deepEqual(verify(fill.result,0),verify(cascade,0));assert.equal(fill.result.used,cascade.used);
// True geometric gaps can cross conservative free-rectangle subdivision boundaries.
const crossing=sheet([piece('Top',30,20,40,0),piece('Bottom',30,20,40,80)]);assert(G.findSheetPlacement(crossing,piece('Across',100,50),0));
assert.equal(G.refillEarlierSheets(fill.result,0).transfers.length,0,'Second refill should be stable');
for(let n=0;n<20;n++){const boards=Array.from({length:7},(_,i)=>sheet([piece('P'+i,10+(i*13+n*7)%70,10+(i*29+n*11)%70)]));const r=layout(boards),f=G.refillEarlierSheets(r,.4,()=>n%2===0);assert.deepEqual(verify(f.result,.4),verify(r,.4));assert.equal(f.result.used,r.used);assert(f.result.sheets.length<=r.sheets.length);}
console.log('Automatic refill passed: board 4 moves into newly opened board 3, large-first cascading transfers, rotation locks, precise kerf, real gaps, stable second pass, conservation and immutable Undo snapshots.');
