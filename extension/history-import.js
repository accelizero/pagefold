import {analysisURL} from './core.js';
export async function importHistory(browser,now=Date.now()){
 if(!await browser.permissions.contains({permissions:['history']}))throw Error('请先允许读取 Chrome 历史。');
 const start=now-7*86400000,items=await browser.history.search({text:'',startTime:start,endTime:now,maxResults:200});
 const visits=[];let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<items.length){const item=items[cursor++];if(!/^https?:\/\//.test(item.url))continue;for(const v of await browser.history.getVisits({url:item.url}))if(v.visitTime>=start&&v.visitTime<=now&&v.isLocal!==false)visits.push({visitId:v.visitId,referringVisitId:v.referringVisitId,transition:v.transition,ts:v.visitTime,url:analysisURL(item.url),title:String(item.title||'').slice(0,500).replace(/https?:\/\/[^\s]+/g,analysisURL)});}}));
 visits.sort((a,b)=>a.ts-b.ts);
 return {at:now,start,visits:visits.slice(-1500),urlCount:items.length,limited:items.length===200||visits.length>1500,scope:'最近 7 天、最多 200 个网址 / 1500 次本机访问；不是完整历史。标题取自网址当前的历史条目。'};
}
