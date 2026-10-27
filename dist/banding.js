function bandingLength(p){const e=p.edges||{};return ((e.top? p.w:0)+(e.bottom?p.w:0)+(e.left?p.h:0)+(e.right?p.h:0));}
function bandingTotal(parts){return parts.reduce((sum,p)=>sum+bandingLength(p)*p.qty,0);}
if(typeof module!=='undefined')module.exports={bandingLength,bandingTotal};
