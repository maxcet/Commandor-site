(async()=>{
'use strict';
const status=document.getElementById('status');
const progress=document.getElementById('progress');
const fail=message=>{status.textContent='Не удалось загрузить обновлённую озвучку.';document.getElementById('fallback').hidden=false;console.error(message);};
const fetchChecked=async(url,kind='arrayBuffer')=>{const response=await fetch(url,{cache:url.includes('/parts/')?'force-cache':'no-cache'});if(!response.ok)throw new Error(url+': '+response.status);return response[kind]();};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const utf8=new TextEncoder();
const mapLimit=async(items,limit,run)=>{const result=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;result[i]=await run(items[i],i);}}));return result;};
try{
 const storage=await fetchChecked('audio2-storage.json?v=20261028','json');
 const [base,sections]=await Promise.all([fetchChecked('gallery-base.html','text'),Promise.all(storage.template_sections.map(p=>fetchChecked(p+'?v=20261028','text')))]);
 if(await hash(utf8.encode(base))!==storage.base_sha256)throw new Error('Gallery checksum mismatch');
 const images=base.match(/data:image\/jpeg;base64,[^"\s]+/g)||[];
 if(images.length!==storage.image_count)throw new Error('Gallery image count mismatch');
 let html=sections.join('');
 for(let i=0;i<images.length;i++)html=html.split('__AUDIO2_IMAGE_'+String(i).padStart(3,'0')+'__').join(images[i]);
 for(const [token,url] of Object.entries(storage.recordings))html=html.split(token).join(url);
 if(await hash(utf8.encode(html))!==storage.html_sha256)throw new Error('Updated gallery checksum mismatch');
 const partCache=new Map();
 const part=path=>{if(!partCache.has(path))partCache.set(path,fetchChecked(path));return partCache.get(path);};
 const files=[...new Set(Object.values(storage.recordings).map(url=>url.split('?')[0]))];
 const dataUris=new Map();let completed=0;
 await mapLimit(files,3,async file=>{
  const info=storage.files[file];if(!info)throw new Error('Missing audio metadata');
  const pieces=await mapLimit(info.parts,4,part);
  const bytes=new Uint8Array(info.bytes);let offset=0;
  for(const piece of pieces){bytes.set(new Uint8Array(piece),offset);offset+=piece.byteLength;}
  if(offset!==info.bytes||await hash(bytes)!==info.sha256)throw new Error('Audio checksum mismatch: '+file);
  const uri=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(new Blob([bytes],{type:'audio/mpeg'}));});
  dataUris.set(file,uri);completed++;progress.value=completed/files.length;status.textContent='Загрузка озвучки: '+completed+' из '+files.length;
 });
 for(const url of Object.values(storage.recordings)){
  const needle='src="'+url+'"';if(!html.includes(needle))throw new Error('Missing audio player');
  html=html.split(needle).join('src="'+dataUris.get(url.split('?')[0])+'"');
 }
 document.open();document.write(html);document.close();
}catch(error){fail(error);}
})();
