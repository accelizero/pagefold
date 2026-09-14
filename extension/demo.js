const rows=[
 ['CAD benchmark · 研究讨论','https://chatgpt.com/c/cad-benchmark',1],
 ['RoomPlan · CAD reconstruction','https://developer.apple.com/augmented-reality/roomplan/',3],
 ['Blender · CAD reconstruction workflow','https://docs.blender.org/manual/en/latest/',2],
 ['CubiCasa5K · CAD floorplan dataset','https://github.com/CubiCasa/CubiCasa5k',1],
 ['CAD benchmark · point cloud evaluation','https://www.google.com/search?q=CAD+point+cloud+evaluation',3],
 ['CAD reconstruction · Sketchfab models','https://sketchfab.com/tags/architecture',2],
 ['Microduck · Agent RL experiments','https://github.com/example/microduck',1],
 ['Microduck · Agent RL training runs','https://wandb.ai/example/microduck',3],
 ['Microduck · Agent RL discussion','https://chatgpt.com/c/microduck',2],
 ['Microduck · Agent RL paper notes','https://arxiv.org/abs/2401.00001',3],
 ['Microduck · Agent RL experiments','https://github.com/example/microduck',2],
 ['LEGO benchmark · project notes','https://chatgpt.com/c/lego-benchmark',3],
 ['LEGO benchmark · dataset','https://github.com/example/lego-benchmark',1],
 ['LEGO benchmark · building instructions','https://www.lego.com/service/buildinginstructions',2],
 ['LEGO benchmark · model gallery','https://rebrickable.com/mocs/',3],
 ['收件箱 · Gmail','https://mail.google.com/mail/u/0/#inbox',1,true],
 ['飞书 · 工作台','https://www.feishu.cn/',2,true],
 ['设计灵感 · Are.na','https://www.are.na/',1],
 ['RoomPlan · CAD reconstruction','https://developer.apple.com/augmented-reality/roomplan/?utm_source=notes',2],
 ['Blender · CAD reconstruction workflow','https://docs.blender.org/manual/en/latest/',3],
 ['稍后阅读 · A List Apart','https://alistapart.com/',2],
 ['音乐 · YouTube','https://www.youtube.com/watch?v=demo',3]
];
export function demoState() {
 const tabs=rows.map(([title,url,windowId,pinned],i)=>({id:i+1,title,url,windowId,pinned:!!pinned,active:!!pinned || i===21,audible:i===21,index:0,groupId:-1,lastAccessed:Date.now()-i*120000}));
 const windows=[1,2,3].map(id=>({id,focused:id===1,type:'normal',tabs:tabs.filter(t=>t.windowId===id).map((t,i)=>{t.index=i;return t;})}));
 const day=new Date();day.setHours(9,12,0,0); const base=+day;
 const visits=[[0,1],[2,4],[5,3],[7,2],[10,5],[12,6],[14,3],[16,2],[18,4],[34,7],[36,8],[38,9],[41,10],[44,7],[46,8],[49,9],[72,12],[74,13],[77,14],[80,15],[83,12],[85,13]];
 const events=visits.map(([min,id])=>({ts:base+min*60000,type:'activate',sessionId:'demo',tabId:id,url:tabs[id-1].url,title:tabs[id-1].title,windowId:tabs[id-1].windowId}));
 return {tabs,windows,events,paused:false,sessionId:'demo',transaction:null};
}
