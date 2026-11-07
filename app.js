const rounds=['FIRST ROUND','ROUND OF 16','QUARTER FINAL','SEMI FINAL','THE FINAL'];
const artistId='554929525';
const excludedCollectionNames=[
  'チャットモンチーbest20052011',
  'bestmonchy1listening',
  '表情couplingcollection'
];
let tracks=[], pool=[], next=[], history=[], match=0;
let quarterfinalists=[], rankedTracks=[], rankStep=2, posterBlob=null, posterUrl='';
const a=document.querySelector('#song-a'),b=document.querySelector('#song-b'),undo=document.querySelector('#undo');
const status=document.querySelector('#library-status');

function shuffle(items){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}
  return result;
}
function sampleTracks(){return shuffle(tracks).slice(0,32)}
function buildBracket(selection){
  const shuffled=shuffle(selection), bracket=[];
  while(shuffled.length){
    const first=shuffled.shift();
    const alternatives=shuffled.map((track,index)=>track.album!==first.album?index:-1).filter(index=>index>=0);
    const choices=alternatives.length?alternatives:shuffled.map((_,index)=>index);
    const secondIndex=choices[Math.floor(Math.random()*choices.length)];
    bracket.push(first,shuffled.splice(secondIndex,1)[0]);
  }
  return bracket;
}
function appleJsonp(url){
  return new Promise((resolve,reject)=>{
    const callback=`songCupApple${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    const timer=setTimeout(()=>finish(new Error('Apple lookup timed out')),10000);
    function finish(error,data){clearTimeout(timer);delete window[callback];script.remove();error?reject(error):resolve(data)}
    window[callback]=data=>finish(null,data);
    script.onerror=()=>finish(new Error('Apple lookup unavailable'));
    script.src=`${url}&callback=${callback}`;
    document.head.appendChild(script);
  });
}
function loadBundledCatalog(){
  if(window.chatmonchyCatalogData)return Promise.resolve(window.chatmonchyCatalogData);
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('./chatmonchy-catalog.js',location.href).href;
    script.onload=()=>window.chatmonchyCatalogData?resolve(window.chatmonchyCatalogData):reject(new Error('内置曲库数据缺失'));
    script.onerror=()=>reject(new Error('内置曲库脚本无法读取'));
    document.head.appendChild(script);
  });
}
function normalize(value){return (value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')}
function getCanonicalTitle(rawTitle){
  if(/karaoke|カラオケ|remix|リミックス|同期ver|\blive\b|ライブ|glider mix/i.test(rawTitle))return null;
  const title=rawTitle.replace(/[（(]\s*(?:ALBUM\s*MIX|ALBUM\s*VER\.?|FOREVER\s*EDITION)\s*[）)]/ig,'').trim();
  return title||null;
}
function isExcludedCollection(name){
  const normalized=normalize(name);
  return excludedCollectionNames.some(excluded=>normalized.includes(excluded))||normalized.includes('foreveredition');
}
function getLibrary(data){
  const seen=new Set(), library=[];
  for(const item of data.results||[]){
    if(item.wrapperType!=='track'||String(item.artistId)!==artistId||!item.trackName||!item.collectionName||!item.previewUrl||!item.artworkUrl100)continue;
    if(!['チャットモンチー','chatmonchy'].includes(normalize(item.artistName)))continue;
    if(isExcludedCollection(item.collectionName))continue;
    const title=getCanonicalTitle(item.trackName);
    if(!title)continue;
    const key=normalize(title);
    if(!key||seen.has(key))continue;
    seen.add(key);
    library.push({
      id:item.trackId,
      title,
      romaji:'CHATMONCHY ORIGINAL TRACK',
      album:item.collectionName,
      artwork:item.artworkUrl100||item.artworkUrl60||'',
      preview:item.previewUrl||'',
      storeUrl:item.trackViewUrl||item.collectionViewUrl||''
    });
  }
  return library;
}
function roundIndex(){return Math.min(5,6-Math.ceil(Math.log2(pool.length||1)))}
function setStatus(message,visible=true){status.textContent=message;status.classList.toggle('hidden',!visible)}
function render(){
  if(!pool.length)return;
  if(pool.length===8&&!quarterfinalists.length)quarterfinalists=[...pool];
  if(pool.length===1){document.querySelector('#matchup').classList.add('hidden');document.querySelector('.cup-bottom').classList.add('hidden');document.querySelector('.section-head').classList.add('hidden');const winner=document.querySelector('#winner');winner.classList.remove('hidden');document.querySelector('#winner-title').textContent=pool[0].title;document.querySelector('#winner-meta').textContent=`${pool[0].album} · CHATMONCHY`;const backdrop=document.querySelector('#winner-backdrop');if(pool[0].artwork)backdrop.src=pool[0].artwork.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg');else backdrop.removeAttribute('src');document.querySelector('#ranking-stage').classList.remove('hidden');document.querySelector('#poster-stage').classList.add('hidden');if(!rankedTracks.length){rankedTracks=[pool[0]];rankStep=2;renderRankOptions()}return}
  document.querySelector('#matchup').classList.remove('hidden');document.querySelector('.cup-bottom').classList.remove('hidden');document.querySelector('.section-head').classList.remove('hidden');document.querySelector('#winner').classList.add('hidden');document.querySelector('#ranking-stage').classList.add('hidden');document.querySelector('#poster-stage').classList.add('hidden');setStatus('',false);
  const index=roundIndex(), x=pool[match*2], y=pool[match*2+1];
  if(!y){next.push(x);finishRound();return}
  fill(a,x,match*2+1);fill(b,y,match*2+2);
  document.querySelector('#round-number').textContent=String(index).padStart(2,'0');document.querySelector('#round-total').textContent='05';document.querySelector('#round-title').innerHTML=`${rounds[index-1]} <span>${['一回戦','十六強','準々決勝','準決勝','決勝'][index-1]}</span>`;
  const done=history.length,pct=Math.min(100,done/31*100);document.querySelector('#progress-count').textContent=`${String(done+1).padStart(2,'0')} / 31`;document.querySelector('#progress-bar').style.width=`${pct}%`;document.querySelector('#remaining').textContent=31-done;undo.disabled=!history.length;
}
function fill(element,track,number){
  document.querySelectorAll('audio').forEach(player=>{player.pause();player.currentTime=0});
  const image=element.querySelector('.cover'),audio=element.querySelector('audio'),preview=element.querySelector('.preview'),storeLink=preview.querySelector('.preview-label');
  element.querySelector('.card-index').textContent=`${String(number).padStart(2,'0')} / 32`;element.querySelector('.album-chip').textContent=track.album;element.querySelector('.song-title').textContent=track.title;element.querySelector('.song-romaji').textContent=track.romaji;
  image.alt=`${track.album} 专辑封面`;image.removeAttribute('src');if(track.artwork)image.src=track.artwork.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg');
  audio.pause();audio.removeAttribute('src');audio.load();preview.classList.remove('unavailable','loading');storeLink.removeAttribute('href');
  if(track.storeUrl){storeLink.href=track.storeUrl;storeLink.textContent='30 SEC PREVIEW · APPLE MUSIC ↗'}
  if(track.preview){audio.src=track.preview.replace(/^http:/,'https:');audio.load()}else{preview.classList.add('unavailable');storeLink.textContent='Apple Music 暂无试听'}
}
function choose(winner){
  if(!pool.length)return;
  history.push({pool:[...pool],next:[...next],match});next.push(winner);match++;
  if(match>=Math.floor(pool.length/2))finishRound();else render();
}
function finishRound(){
  if(pool.length===2){pool=[...next];next=[];match=0;render();return}
  if(pool.length%2)next.push(pool[pool.length-1]);pool=[...next];next=[];match=0;render();
}
function renderRankOptions(){
  const heading=document.querySelector('#rank-heading'),options=document.querySelector('#rank-options');
  heading.textContent=`选择第 ${rankStep} 名`;
  renderRankedList();
  options.replaceChildren();
  quarterfinalists.filter(track=>!rankedTracks.some(chosen=>chosen.id===track.id)).forEach(track=>{
    const button=document.createElement('button');button.type='button';button.className='rank-card';
    const image=document.createElement('img');image.alt=`${track.album} 专辑封面`;if(track.artwork)image.src=track.artwork.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg');
    const details=document.createElement('span');details.className='rank-card-details';
    const title=document.createElement('strong');title.textContent=track.title;
    const album=document.createElement('small');album.textContent=track.album;
    details.append(title,album);button.append(image,details);button.addEventListener('click',()=>chooseRank(track));options.append(button);
  });
}
function renderRankedList(){
  const list=document.querySelector('#ranked-list');
  list.replaceChildren();
  list.classList.toggle('hidden',rankedTracks.length<2);
  rankedTracks.slice(1).forEach((track,offset)=>{
    const index=offset+1;
    const item=document.createElement('div');item.className='ranked-item';
    const cover=document.createElement('img');cover.alt='';if(track.artwork)cover.src=track.artwork.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg');
    const rank=document.createElement('span');rank.className='ranked-number';rank.textContent=`${index+1}位`;
    const info=document.createElement('span');info.className='ranked-info';
    const title=document.createElement('strong');title.textContent=track.title;
    const album=document.createElement('small');album.textContent=track.album;
    info.append(title,album);item.append(cover,rank,info);list.append(item);
  });
}
function chooseRank(track){
  rankedTracks.push(track);
  renderRankedList();
  if(rankedTracks.length<5){rankStep=rankedTracks.length+1;renderRankOptions();return}
  document.querySelector('#ranking-stage').classList.add('hidden');document.querySelector('#poster-stage').classList.remove('hidden');
  createPoster().catch(error=>{document.querySelector('#poster-status').textContent='海报生成失败，请刷新页面后重试。';console.error(error)});
}
function loadPosterImage(url){
  return new Promise(resolve=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=url.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg')});
}
async function createPoster(){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f4f0e7';ctx.fillRect(0,0,1080,1920);ctx.fillStyle='#ed442f';ctx.fillRect(0,0,1080,22);
  ctx.fillStyle='#1c1b19';ctx.font='700 34px "DM Mono", monospace';ctx.fillText('CHATMONCHY  /  SONG CUP',78,102);
  ctx.fillStyle='#ed442f';ctx.font='900 82px "Noto Sans JP", sans-serif';ctx.fillText('MY TOP FIVE',76,208);
  ctx.fillStyle='#77736a';ctx.font='22px "DM Mono", monospace';ctx.fillText('あなたが選んだ、5つの大切な曲。',80,254);
  ctx.strokeStyle='#292721';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(78,292);ctx.lineTo(1002,292);ctx.stroke();
  const rowTop=328,rowHeight=292;
  for(let index=0;index<rankedTracks.length;index++){
    const track=rankedTracks[index],y=rowTop+index*rowHeight;
    ctx.fillStyle=index===0?'#f4cf48':'#ebe7de';ctx.fillRect(78,y,924,258);
    ctx.fillStyle='#1c1b19';ctx.fillRect(78,y,12,258);
    ctx.fillStyle='#ed442f';ctx.font='700 42px "DM Mono", monospace';ctx.fillText(`#${index+1}`,112,y+58);
    const cover=track.artwork?await loadPosterImage(track.artwork):null;
    if(cover)ctx.drawImage(cover,112,y+78,158,158);else{ctx.fillStyle='#304ca1';ctx.fillRect(112,y+78,158,158);ctx.fillStyle='#f4f0e7';ctx.font='700 24px "DM Mono", monospace';ctx.fillText('CHAT',143,y+151);ctx.fillText('MONCHY',127,y+184)}
    ctx.fillStyle='#1c1b19';ctx.font='900 38px "Noto Sans JP", sans-serif';wrapCanvasText(ctx,track.title,306,y+124,640,48,2);
    ctx.fillStyle='#77736a';ctx.font='22px "Noto Sans JP", sans-serif';wrapCanvasText(ctx,track.album,306,y+199,640,30,1);
    ctx.strokeStyle='#c6c0b4';ctx.beginPath();ctx.moveTo(78,y+276);ctx.lineTo(1002,y+276);ctx.stroke();
  }
  ctx.fillStyle='#1c1b19';ctx.font='700 19px "DM Mono", monospace';ctx.fillText('UNOFFICIAL FAN PROJECT  ·  CHATMONCHY IS FOREVER.',80,1824);
  ctx.fillStyle='#ed442f';ctx.beginPath();ctx.arc(958,1817,23,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='700 22px sans-serif';ctx.fillText('C',950,1825);
  posterBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!posterBlob)throw new Error('PNG encoding failed');
  if(posterUrl)URL.revokeObjectURL(posterUrl);posterUrl=URL.createObjectURL(posterBlob);
  document.querySelector('#poster-image').src=posterUrl;document.querySelector('#download-poster').href=posterUrl;document.querySelector('#poster-status').textContent='海报已生成。';
}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
  let line='',lineNumber=0;
  for(const character of text){const candidate=line+character;if(ctx.measureText(candidate).width>maxWidth&&line){ctx.fillText(line,x,y+lineNumber*lineHeight);line=character;lineNumber++;if(lineNumber>=maxLines)return} else line=candidate}
  if(line&&lineNumber<maxLines)ctx.fillText(line,x,y+lineNumber*lineHeight);
}
async function sharePoster(){
  const title='我的 Chatmonchy Song Cup TOP 5';
  try{
    if(posterBlob&&navigator.share){const file=new File([posterBlob],'chatmonchy-song-cup-top-five.png',{type:'image/png'});if(!navigator.canShare||navigator.canShare({files:[file]})){await navigator.share({title,text:title,files:[file]});return}await navigator.share({title,text:title,url:location.href});return}
    if(navigator.clipboard){await navigator.clipboard.writeText(`${title}\n${location.href}`);document.querySelector('#poster-status').textContent='此设备暂不支持直接分享图片，分享文字和页面链接已复制；也可以保存 PNG 后手动上传。';return}
    document.querySelector('#poster-status').textContent='此设备不支持分享菜单，请保存 PNG 后手动分享。';
  }catch(error){if(error.name!=='AbortError')document.querySelector('#poster-status').textContent='分享未能完成；你仍可以保存 PNG 后手动分享。'}
}
function reset(){
  quarterfinalists=[];rankedTracks=[];rankStep=2;posterBlob=null;if(posterUrl){URL.revokeObjectURL(posterUrl);posterUrl=''}
  document.querySelector('#ranking-stage').classList.add('hidden');document.querySelector('#poster-stage').classList.add('hidden');
  pool=buildBracket(sampleTracks());next=[];match=0;history=[];
  document.querySelector('#matchup').classList.remove('hidden');document.querySelector('.cup-bottom').classList.remove('hidden');document.querySelector('.section-head').classList.remove('hidden');render();
}
async function initialize(){
  setStatus('正在载入 Chatmonchy 曲库…');
  document.querySelector('#matchup').classList.add('hidden');document.querySelector('.cup-bottom').classList.add('hidden');
  const endpoint=`https://itunes.apple.com/lookup?${new URLSearchParams({id:artistId,entity:'song',country:'JP',limit:'200'})}`;
  let usingFallback=false;
  try{
    try{
      const data=await appleJsonp(endpoint);tracks=getLibrary(data);
      if(tracks.length<32)throw new Error('曲库条目不足 32 首');
    }catch(remoteError){
      console.warn('Apple Music catalog unavailable; trying bundled catalog.',remoteError);
      let fallbackData;
      try{fallbackData=await loadBundledCatalog()}catch(fallbackError){throw new Error('Apple Music 不可访问，且内置曲库无法读取')}
      tracks=getLibrary(fallbackData);
      if(tracks.length<32)throw new Error('内置曲库条目不足 32 首');
      usingFallback=true;
    }
    pool=buildBracket(sampleTracks());next=[];match=0;history=[];render();
    if(usingFallback)setStatus('Apple Music 暂时无法连接，已使用内置曲库；歌曲仍会随机抽取。',true);
  }catch(error){
    console.error('Chatmonchy catalog load failed:',error);
    const reason=error.message==='Apple Music 不可访问，且内置曲库无法读取'?'Apple Music 不可访问，内置曲库也无法读取':error.message==='内置曲库条目不足 32 首'?'内置曲库可用曲目不足 32 首':error.message==='Apple lookup timed out'?'Apple Music 请求超时，内置曲库无法读取':error.message==='Apple lookup unavailable'?'无法连接 Apple Music，内置曲库无法读取':'Apple Music 返回的数据无法读取，内置曲库也无法读取';
    setStatus(`曲库载入失败：${reason}。请确认 chatmonchy-catalog.js 与页面文件位于同一目录。`);
  }
}

a.querySelector('.pick').addEventListener('click',()=>choose(pool[match*2]));
b.querySelector('.pick').addEventListener('click',()=>choose(pool[match*2+1]));
document.querySelectorAll('audio').forEach(player=>{
  player.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==player)other.pause()}));
  player.addEventListener('timeupdate',()=>{if(player.currentTime>=30){player.pause();player.currentTime=0}});
});
undo.addEventListener('click',()=>{const state=history.pop();if(state){pool=state.pool;next=state.next;match=state.match;render()}});
document.querySelector('#restart').addEventListener('click',reset);document.querySelector('#restart-poster').addEventListener('click',reset);document.querySelector('#share-poster').addEventListener('click',sharePoster);
initialize();
