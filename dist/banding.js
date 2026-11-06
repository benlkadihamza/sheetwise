function bandingLength(p){const e=p.edges||{},w=Number(p.w)||0,h=Number(p.h)||0;return ((e.top?w:0)+(e.bottom?w:0)+(e.left?h:0)+(e.right?h:0));}
function bandingTotal(parts){return parts.reduce((sum,p)=>sum+bandingLength(p)*((p.qty===''||p.qty===undefined)?1:(Number(p.qty)||0)),0);}
if(typeof module!=='undefined')module.exports={bandingLength,bandingTotal};
