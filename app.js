const rounds=['FIRST ROUND','ROUND OF 16','QUARTER FINAL','SEMI FINAL','THE FINAL'];
const artistId='554929525';
const isWeChatBrowser=/MicroMessenger/i.test(navigator.userAgent);
const excludedCollectionNames=[
  'チャットモンチーbest20052011',
  'bestmonchy1listening',
  '表情couplingcollection'
];
let tracks=[], pool=[], next=[], history=[], match=0, groupChoices=[], manualAlbums=[], manualAlbumCatalog=[], selectedAlbumKey='', manualSelection=new Map();
const totalPicks=23;
let quarterfinalists=[], rankedTracks=[], rankStep=2, posterBlob=null, posterUrl='';
const a=document.querySelector('#song-a'),b=document.querySelector('#song-b'),undo=document.querySelector('#undo');
const status=document.querySelector('#library-status');
let songCupStarted=false;

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

function getAlbums(){
  if(manualAlbumCatalog.length){
    const cached=new Map();tracks.forEach(track=>{if(track.collectionId)cached.set(String(track.collectionId),track)});
    return manualAlbumCatalog.map(item=>{
      const id=String(item.collectionId),track=cached.get(id),year=(item.releaseDate||'').slice(0,4);
      return {key:id,collectionId:id,title:item.collectionName,year:year||'—',sortYear:Number(year)||9999,artwork:item.artworkUrl100||track?.artwork||'',tracks:tracks.filter(song=>String(song.collectionId)===id),loaded:false,loading:false};
    }).sort((left,right)=>left.sortYear-right.sortYear||left.title.localeCompare(right.title,'ja'));
  }
  const groups=new Map();
  tracks.forEach(track=>{
    const key=String(track.collectionId||`${track.album}::${track.year||''}`);
    if(!groups.has(key))groups.set(key,{key,collectionId:track.collectionId||null,title:track.album,year:track.year||'—',sortYear:Number(track.year)||9999,artwork:track.artwork,tracks:[],loaded:false,loading:false});
    groups.get(key).tracks.push(track);
  });
  return [...groups.values()].map(album=>({...album,tracks:album.tracks.sort((left,right)=>left.discNumber-right.discNumber||left.trackNumber-right.trackNumber),loaded:!album.collectionId})).sort((left,right)=>left.sortYear-right.sortYear||left.title.localeCompare(right.title,'ja'));
}
function renderManualAlbums(){
  const list=document.querySelector('#manual-albums');list.replaceChildren();
  manualAlbums.forEach(album=>{
    const button=document.createElement('button');button.type='button';button.className='manual-album-option';button.classList.toggle('active',album.key===selectedAlbumKey);button.setAttribute('aria-pressed',String(album.key===selectedAlbumKey));button.dataset.albumKey=album.key;
    const image=document.createElement('img');image.alt='';if(album.artwork)image.src=album.artwork.replace(/\d+x\d+bb/,'300x300bb').replace(/\d+x\d+-\d+\.jpg$/,'300x300bb.jpg');
    const details=document.createElement('span');details.className='manual-album-meta';const title=document.createElement('strong');title.textContent=album.title;const year=document.createElement('small');year.textContent=album.year;details.append(title,year);button.append(image,details);
    button.addEventListener('click',()=>{selectedAlbumKey=album.key;list.querySelectorAll('.manual-album-option').forEach(option=>{const active=option.dataset.albumKey===selectedAlbumKey;option.classList.toggle('active',active);option.setAttribute('aria-pressed',String(active))});renderManualTracks();loadManualAlbumTracks(album).catch(error=>{console.warn('Could not load full album track list.',error);if(selectedAlbumKey===album.key)renderManualTracks('该专辑完整曲目暂时无法载入，当前显示已缓存的曲目。')})});list.append(button);
  });
}
async function loadManualAlbumTracks(album){
  if(album.loaded||!album.collectionId)return;
  album.loading=true;if(selectedAlbumKey===album.key)renderManualTracks('正在载入完整曲目…');
  try{
    const endpoint=`https://itunes.apple.com/lookup?${new URLSearchParams({id:String(album.collectionId),entity:'song',country:'JP',limit:'200'})}`;
    const data=await appleJsonp(endpoint), fetched=getLibrary({results:data.results||[]},{requireMedia:false,deduplicate:false}).filter(track=>String(track.collectionId)===String(album.collectionId));
    if(!fetched.length)throw new Error('该专辑没有可读取的曲目');
    const byId=new Map(album.tracks.map(track=>[String(track.id),track]));
    fetched.forEach(track=>byId.set(String(track.id),track));
    album.tracks=[...byId.values()].sort((left,right)=>left.discNumber-right.discNumber||left.trackNumber-right.trackNumber);
    album.loaded=true;
  }finally{album.loading=false;if(selectedAlbumKey===album.key)renderManualTracks()}
}
function renderManualTracks(message=''){
  const album=manualAlbums.find(item=>item.key===selectedAlbumKey);if(!album)return;
  const image=document.querySelector('#manual-album-art');image.alt=`${album.title} 专辑封面`;image.removeAttribute('src');if(album.artwork)image.src=album.artwork.replace(/\d+x\d+bb/,'300x300bb').replace(/\d+x\d+-\d+\.jpg$/,'300x300bb.jpg');
  document.querySelector('#manual-album-title').textContent=album.title;document.querySelector('#manual-album-year').textContent=album.year;
  const list=document.querySelector('#manual-tracks');list.replaceChildren();
  if(message){const statusMessage=document.createElement('p');statusMessage.className='manual-track-status';statusMessage.textContent=message;list.append(statusMessage)}
  album.tracks.forEach(track=>{
    const chosen=manualSelection.has(String(track.id)),button=document.createElement('button');button.type='button';button.className='manual-track';button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));
    const details=document.createElement('span');details.className='manual-track-meta';const title=document.createElement('strong');title.textContent=track.title;details.append(title);
    const mark=document.createElement('span');mark.className='manual-track-check';mark.setAttribute('aria-hidden','true');mark.textContent=chosen?'✓':'';button.append(details,mark);
    button.addEventListener('click',()=>{const key=String(track.id);if(manualSelection.has(key))manualSelection.delete(key);else if(manualSelection.size<32)manualSelection.set(key,track);updateManualCount();renderManualTracks()});list.append(button);
  });
  updateManualCount();
}
function updateManualCount(){
  const count=manualSelection.size;document.querySelector('#manual-count').textContent=`已选 ${count} / 32 首`;
  const button=document.querySelector('#manual-enter');button.disabled=count!==32;button.textContent=count===32?'进入淘汰赛 →':`已选 ${count} / 32`;
}
function enterStartedView(manual=false){
  songCupStarted=true;document.body.classList.add('song-cup-started');document.body.classList.toggle('manual-selection',manual);
  const section=document.querySelector('.cup-section'),topbar=document.querySelector('.topbar');
  const oldBehavior=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';
  window.scrollTo(0,Math.max(0,section.getBoundingClientRect().top+window.scrollY-topbar.getBoundingClientRect().height));
  requestAnimationFrame(()=>{document.documentElement.style.scrollBehavior=oldBehavior});
}
function showManualPicker(){
  if(tracks.length<32)return;manualSelection.clear();manualAlbums=getAlbums();selectedAlbumKey=manualAlbums[0]?.key||'';
  document.querySelector('#manual-picker').classList.remove('hidden');enterStartedView(true);renderManualAlbums();renderManualTracks();
}
function startTournament(selection){
  if(selection.length!==32)return;document.querySelector('#manual-picker').classList.add('hidden');
  enterStartedView(false);pool=buildBracket(selection);next=[];match=0;groupChoices=[];history=[];quarterfinalists=[];rankedTracks=[];rankStep=2;
  document.querySelector('#matchup').classList.remove('hidden');document.querySelector('.cup-bottom').classList.remove('hidden');document.querySelector('.section-head').classList.remove('hidden');render();
}
function startRandomTournament(){if(tracks.length>=32)startTournament(sampleTracks())}

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
function getLibrary(data,{requireMedia=true,deduplicate=true}={}){
  const seen=new Set(), library=[];
  for(const item of data.results||[]){
    if(item.wrapperType!=='track'||String(item.artistId)!==artistId||!item.trackName||!item.collectionName||(requireMedia&&(!item.previewUrl||!item.artworkUrl100)))continue;
    if(!['チャットモンチー','chatmonchy'].includes(normalize(item.artistName)))continue;
    if(isExcludedCollection(item.collectionName))continue;
    const title=getCanonicalTitle(item.trackName);
    if(!title)continue;
    const key=normalize(title);
    if(!key||(deduplicate&&seen.has(key)))continue;
    seen.add(key);
    library.push({
      id:item.trackId,
      collectionId:item.collectionId||null,
      title,
      romaji:'CHATMONCHY ORIGINAL TRACK',
      album:item.collectionName,
      year:(item.releaseDate||'').slice(0,4),
      discNumber:item.discNumber||1,
      trackNumber:item.trackNumber||0,
      artwork:item.artworkUrl100||item.artworkUrl60||'',
      preview:item.previewUrl||'',
      storeUrl:item.trackViewUrl||item.collectionViewUrl||''
    });
  }
  return library;
}
function getAlbumCatalog(data){
  return (data.results||[]).filter(item=>item.wrapperType==='collection'&&item.collectionId&&item.collectionName&&String(item.artistId)===artistId&&isExcludedCollection(item.collectionName)===false&&['チャットモンチー','chatmonchy'].includes(normalize(item.artistName))).map(item=>({collectionId:item.collectionId,collectionName:item.collectionName,releaseDate:item.releaseDate||'',artworkUrl100:item.artworkUrl100||''}));
}
function roundIndex(){return Math.min(5,6-Math.ceil(Math.log2(pool.length||1)))}
function setStatus(message,visible=true){status.textContent=message;status.classList.toggle('hidden',!visible)}
function stopAllPreviews(){document.querySelectorAll('audio').forEach(player=>player.pause());syncPreviewButtons()}
function render(){
  if(!pool.length)return;
  stopAllPreviews();
  if(pool.length===8&&!quarterfinalists.length)quarterfinalists=[...pool];
  if(pool.length===1){document.querySelector('#matchup').classList.add('hidden');document.querySelector('.cup-bottom').classList.add('hidden');document.querySelector('.section-head').classList.add('hidden');const winner=document.querySelector('#winner');winner.classList.remove('hidden');document.querySelector('#winner-title').textContent=pool[0].title;document.querySelector('#winner-meta').textContent=`${pool[0].album} · CHATMONCHY`;const backdrop=document.querySelector('#winner-backdrop');if(pool[0].artwork)backdrop.src=pool[0].artwork.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg');else backdrop.removeAttribute('src');document.querySelector('#ranking-stage').classList.remove('hidden');document.querySelector('#poster-stage').classList.add('hidden');if(!rankedTracks.length){rankedTracks=[pool[0]];rankStep=2;renderRankOptions()}return}
  const matchup=document.querySelector('#matchup');
  const firstRound=pool.length===32,index=roundIndex();
  matchup.classList.remove('hidden');matchup.classList.toggle('first-round-grid',firstRound);
  matchup.querySelector('.versus').classList.toggle('hidden',firstRound);
  matchup.querySelectorAll('#song-c,#song-d').forEach(card=>card.classList.toggle('hidden',!firstRound));
  document.querySelector('.cup-bottom').classList.remove('hidden');document.querySelector('.section-head').classList.remove('hidden');document.querySelector('#winner').classList.add('hidden');document.querySelector('#ranking-stage').classList.add('hidden');document.querySelector('#poster-stage').classList.add('hidden');setStatus('',false);
  if(firstRound)renderFirstGroup();
  else {fill(a,pool[match*2],match*2+1);fill(b,pool[match*2+1],match*2+2);a.dataset.poolIndex=String(match*2);b.dataset.poolIndex=String(match*2+1);a.classList.remove('chosen');b.classList.remove('chosen');a.setAttribute('aria-label',`选择歌曲：${pool[match*2].title}`);b.setAttribute('aria-label',`选择歌曲：${pool[match*2+1].title}`)}
  document.querySelector('#round-number').textContent=String(index).padStart(2,'0');document.querySelector('#round-total').textContent='05';document.querySelector('#round-title').innerHTML=`${rounds[index-1]} <span>${['8组各选2首','十六强','準々決勝','準決勝','決勝'][index-1]}</span>`;
  document.querySelector('#first-round-actions').classList.toggle('hidden',!firstRound);
  const done=history.length,pct=Math.min(100,done/totalPicks*100);document.querySelector('#progress-count').textContent=`${String(Math.min(done+1,totalPicks)).padStart(2,'0')} / ${totalPicks}`;document.querySelector('#progress-bar').style.width=`${pct}%`;document.querySelector('#remaining').textContent=totalPicks-done;undo.disabled=!history.length;
}
function renderFirstGroup(){
  const cards=['a','b','c','d'].map(letter=>document.querySelector(`#song-${letter}`));
  const start=match*4;
  cards.forEach((card,index)=>{const track=pool[start+index],selected=groupChoices.includes(index);fill(card,track,start+index+1);card.dataset.poolIndex=String(start+index);card.classList.toggle('chosen',selected);card.classList.toggle('alt',index%2===1);card.setAttribute('aria-label',`第 ${index+1} 首：${track.title}${selected?'，已选中':''}`)});
  document.querySelector('#group-choice-count').textContent=`已选 ${groupChoices.length} / 2 首`;
  document.querySelector('#confirm-first-group').disabled=groupChoices.length!==2;
}
function toggleGroupChoice(index){if(groupChoices.includes(index))groupChoices=groupChoices.filter(item=>item!==index);else if(groupChoices.length<2)groupChoices.push(index);renderFirstGroup()}
function confirmFirstGroup(){if(pool.length!==32||groupChoices.length!==2)return;history.push({pool:[...pool],next:[...next],match,groupChoices:[]});next.push(...groupChoices.map(index=>pool[match*4+index]));groupChoices=[];match++;if(match===8)finishRound();else render()}
function fill(element,track,number){
  document.querySelectorAll('audio').forEach(player=>{player.pause();player.currentTime=0});syncPreviewButtons();
  const image=element.querySelector('.cover'),audio=element.querySelector('audio'),preview=element.querySelector('.preview'),storeLink=preview.querySelector('.preview-label');
  element.querySelector('.card-index').textContent=`${String(number).padStart(2,'0')} / 32`;element.querySelector('.album-chip').textContent=track.year?`${track.album} · ${track.year}`:track.album;element.querySelector('.song-title').textContent=track.title;element.querySelector('.song-romaji').textContent=track.romaji;
  image.alt=`${track.album} 专辑封面`;image.removeAttribute('src');if(track.artwork)image.src=track.artwork.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg');
  audio.pause();audio.removeAttribute('src');audio.load();preview.classList.remove('unavailable','loading');storeLink.removeAttribute('href');
  if(track.storeUrl){storeLink.href=track.storeUrl;storeLink.textContent='30 SEC PREVIEW · APPLE MUSIC ↗'}
  const playButton=preview.querySelector('.preview-toggle');
  if(track.preview){audio.src=track.preview.replace(/^http:/,'https:');audio.load();playButton.disabled=false;playButton.setAttribute('aria-label',`播放 ${track.title} 的30秒试听`)}else{preview.classList.add('unavailable');storeLink.textContent='Apple Music 暂无试听';playButton.disabled=true;playButton.setAttribute('aria-label','暂无试听')}
}
function choose(winner){
  if(!pool.length||pool.length===32)return;
  history.push({pool:[...pool],next:[...next],match,groupChoices:[...groupChoices]});next.push(winner);match++;
  if(match>=Math.floor(pool.length/2))finishRound();else render();
}
function finishRound(){
  groupChoices=[];
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
function loadPosterImage(url,local=false){
  if(typeof url!=='string'||!url)return Promise.resolve(null);
  return new Promise(resolve=>{const image=new Image();if(!local)image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=url.replace(/\d+x\d+bb/,'600x600bb').replace(/\d+x\d+-\d+\.jpg$/,'600x600bb.jpg')});
}
async function createPoster(){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f4f0e7';ctx.fillRect(0,0,1080,1920);ctx.fillStyle='#ed442f';ctx.fillRect(0,0,1080,22);
  const bandPhoto=await loadPosterImage(window.chatmonchyPosterPhoto,true);
  if(bandPhoto){const size=176,cx=914,cy=166,scale=Math.max(size/bandPhoto.width,size/bandPhoto.height),sw=size/scale,sh=size/scale,sx=(bandPhoto.width-sw)/2,sy=(bandPhoto.height-sh)/2;ctx.save();ctx.beginPath();ctx.arc(cx,cy,size/2,0,Math.PI*2);ctx.clip();ctx.drawImage(bandPhoto,sx,sy,sw,sh,cx-size/2,cy-size/2,size,size);ctx.restore()}
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
  const posterDataUrl=canvas.toDataURL('image/png');
  posterBlob=await new Promise(resolve=>{if(canvas.toBlob)canvas.toBlob(blob=>resolve(blob||dataUrlToBlob(posterDataUrl)),'image/png');else resolve(dataUrlToBlob(posterDataUrl))});
  if(!posterBlob)throw new Error('PNG encoding failed');
  if(posterUrl)URL.revokeObjectURL(posterUrl);posterUrl=URL.createObjectURL(posterBlob);
  document.querySelector('#poster-image').src=isWeChatBrowser?posterDataUrl:posterUrl;document.querySelector('#download-poster').href=posterUrl;document.querySelector('#poster-status').textContent=isWeChatBrowser?'海报已生成。长按海报图片，选择“保存图片”即可保存到相册。':'海报已生成。';
}
function dataUrlToBlob(dataUrl){const [header,data]=dataUrl.split(',');const bytes=atob(data);const buffer=new Uint8Array(bytes.length);for(let index=0;index<bytes.length;index++)buffer[index]=bytes.charCodeAt(index);return new Blob([buffer],{type:header.match(/data:(.*?);base64/)[1]})}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
  let line='',lineNumber=0;
  for(const character of text){const candidate=line+character;if(ctx.measureText(candidate).width>maxWidth&&line){ctx.fillText(line,x,y+lineNumber*lineHeight);line=character;lineNumber++;if(lineNumber>=maxLines)return} else line=candidate}
  if(line&&lineNumber<maxLines)ctx.fillText(line,x,y+lineNumber*lineHeight);
}
function showWeChatPosterHelp(){
  const message='微信内不能直接下载或调用图片分享。请长按上方海报，选择“保存图片”；保存后可在聊天窗口点“+”→“相册”发送。分享活动页面请使用右上角“…”菜单。';
  const status=document.querySelector('#poster-status');status.textContent=message;status.scrollIntoView({behavior:'smooth',block:'center'});
}
async function sharePoster(){
  const title='我的 Chatmonchy Song Cup TOP 5';
  if(isWeChatBrowser){showWeChatPosterHelp();return}
  try{
    if(posterBlob&&navigator.share){const file=new File([posterBlob],'chatmonchy-song-cup-top-five.png',{type:'image/png'});if(!navigator.canShare||navigator.canShare({files:[file]})){await navigator.share({title,text:title,files:[file]});return}await navigator.share({title,text:title,url:location.href});return}
    if(navigator.clipboard){await navigator.clipboard.writeText(`${title}\n${location.href}`);document.querySelector('#poster-status').textContent='此设备暂不支持直接分享图片，分享文字和页面链接已复制；也可以保存 PNG 后手动上传。';return}
    document.querySelector('#poster-status').textContent='此设备不支持分享菜单，请保存 PNG 后手动分享。';
  }catch(error){if(error.name!=='AbortError')document.querySelector('#poster-status').textContent='分享未能完成；你仍可以保存 PNG 后手动分享。'}
}
function scrollPageTop(){const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior='auto';window.scrollTo(0,0);requestAnimationFrame(()=>{root.style.scrollBehavior=previous})}
function reset(){
  quarterfinalists=[];rankedTracks=[];rankStep=2;posterBlob=null;manualSelection.clear();selectedAlbumKey='';manualAlbums=[];
  if(posterUrl){URL.revokeObjectURL(posterUrl);posterUrl=''}
  document.querySelector('#ranking-stage').classList.add('hidden');document.querySelector('#poster-stage').classList.add('hidden');
  document.querySelector('#manual-picker').classList.add('hidden');document.querySelector('#matchup').classList.add('hidden');document.querySelector('.cup-bottom').classList.add('hidden');document.querySelector('.section-head').classList.add('hidden');document.querySelector('#first-round-actions').classList.add('hidden');document.querySelector('#winner').classList.add('hidden');
  const rankedList=document.querySelector('#ranked-list');rankedList.replaceChildren();rankedList.classList.add('hidden');
  pool=[];next=[];match=0;groupChoices=[];history=[];songCupStarted=false;document.body.classList.remove('song-cup-started','manual-selection');scrollPageTop();
}
async function initialize(){
  const modeStatus=document.querySelector('#mode-status');modeStatus.textContent='正在载入 Chatmonchy 曲库…';
  document.querySelector('#choose-random').disabled=true;document.querySelector('#choose-manual').disabled=true;
  const endpoint=`https://itunes.apple.com/lookup?${new URLSearchParams({id:artistId,entity:'song',country:'JP',limit:'200'})}`;
  let usingFallback=false;
  try{
    if(location.protocol==='file:'){
      if(!window.chatmonchyCatalogData)throw new Error('内置曲库脚本无法读取');
      tracks=getLibrary(window.chatmonchyCatalogData);usingFallback=true;
    }else{
      try{const data=await appleJsonp(endpoint);tracks=getLibrary(data);if(tracks.length<32)throw new Error('曲库条目不足 32 首');try{const albums=await appleJsonp(`https://itunes.apple.com/lookup?${new URLSearchParams({id:artistId,entity:'album',country:'JP',limit:'200'})}`);manualAlbumCatalog=getAlbumCatalog(albums)}catch(albumError){console.warn('Apple album list unavailable; using album records from the track catalog.',albumError)}}
      catch(remoteError){console.warn('Apple Music catalog unavailable; trying bundled catalog.',remoteError);let fallbackData;try{fallbackData=await loadBundledCatalog()}catch(fallbackError){throw new Error('Apple Music 不可访问，且内置曲库无法读取')}tracks=getLibrary(fallbackData);if(tracks.length<32)throw new Error('内置曲库条目不足 32 首');usingFallback=true}
    }
    if(tracks.length<32)throw new Error('内置曲库条目不足 32 首');
    document.querySelector('#choose-random').disabled=false;document.querySelector('#choose-manual').disabled=false;
    modeStatus.textContent=usingFallback?'Apple Music 暂时无法连接，已载入内置曲库；封面和试听仍从 Apple CDN 加载。':'曲库已载入。';
  }catch(error){
    console.error('Chatmonchy catalog load failed:',error);
    const reason=error.message==='Apple Music 不可访问，且内置曲库无法读取'?'Apple Music 与内置曲库均无法读取':error.message==='内置曲库条目不足 32 首'?'曲库可用曲目不足 32 首':error.message==='Apple lookup timed out'?'Apple Music 请求超时，内置曲库无法读取':error.message==='Apple lookup unavailable'?'无法连接 Apple Music，内置曲库无法读取':'Apple Music 返回的数据无法读取，内置曲库也无法读取';
    modeStatus.textContent=`曲库载入失败：${reason}。请联网后刷新页面。`;
  }
}

const matchup=document.querySelector('#matchup');
matchup.addEventListener('click',event=>{
  if(event.target.closest('.preview, audio, a, button'))return;
  const card=event.target.closest('.song-card');if(!card||card.classList.contains('hidden'))return;
  const index=Number(card.dataset.poolIndex);if(!Number.isInteger(index))return;
  if(pool.length===32)toggleGroupChoice(index-match*4);else choose(pool[index]);
});
matchup.addEventListener('keydown',event=>{
  if(!['Enter',' '].includes(event.key)||event.target.closest('.preview'))return;
  const card=event.target.closest('.song-card');if(!card||card.classList.contains('hidden'))return;
  event.preventDefault();const index=Number(card.dataset.poolIndex);if(!Number.isInteger(index))return;
  if(pool.length===32)toggleGroupChoice(index-match*4);else choose(pool[index]);
});
document.querySelector('#confirm-first-group').addEventListener('click',confirmFirstGroup);
function syncPreviewButtons(){document.querySelectorAll('.preview-toggle').forEach(button=>{const player=button.closest('.preview').querySelector('audio'),playing=!player.paused&&!player.ended;button.classList.toggle('playing',playing);button.setAttribute('aria-label',player.disabled?'暂无试听':playing?'暂停试听':'播放30秒试听')})}
document.querySelectorAll('.preview-toggle').forEach(button=>{
  const player=button.closest('.preview').querySelector('audio');
  button.addEventListener('click',event=>{event.stopPropagation();if(player.paused)player.play().catch(()=>{button.setAttribute('aria-label','试听无法播放')});else player.pause()});
  player.addEventListener('play',syncPreviewButtons);
  player.addEventListener('pause',syncPreviewButtons);
});
document.querySelectorAll('audio').forEach(player=>{
  player.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==player)other.pause()}));
  player.addEventListener('timeupdate',()=>{if(player.currentTime>=30){player.pause();player.currentTime=0}});
});
undo.addEventListener('click',()=>{const state=history.pop();if(state){pool=state.pool;next=state.next;match=state.match;groupChoices=state.groupChoices||[];render()}scrollPageTop()});
document.querySelector('#restart').addEventListener('click',reset);document.querySelector('#restart-poster').addEventListener('click',reset);document.querySelector('#share-poster').addEventListener('click',sharePoster);
document.querySelector('#download-poster').addEventListener('click',event=>{if(isWeChatBrowser){event.preventDefault();showWeChatPosterHelp()}});
document.querySelector('#choose-random').addEventListener('click',startRandomTournament);
document.querySelector('#choose-manual').addEventListener('click',showManualPicker);
document.querySelector('#manual-enter').addEventListener('click',()=>{if(manualSelection.size===32)startTournament([...manualSelection.values()])});
document.querySelector('#manual-random').addEventListener('click',startRandomTournament);
initialize();
