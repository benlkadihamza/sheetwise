// Projects created before unit metadata was introduced used millimeters.
function projectInCentimeters(project){
 if(project.unit==='cm')return project;
 if(project.unit!==undefined&&project.unit!=='mm')throw Error('Unsupported project unit');
 return {...project,unit:'cm',kerf:project.kerf/10,
 stock:project.stock.map(p=>({...p,w:p.w/10,h:p.h/10})),
 parts:project.parts.map(p=>({...p,w:p.w/10,h:p.h/10}))};
}
if(typeof module!=='undefined')module.exports={projectInCentimeters};
