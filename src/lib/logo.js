// Logo processing: optional background removal (flood fill from the border colour) and trim.
// Ported unchanged from the TeamHub artifact.
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
function removeBackground(img,tol){
  const {width:w,height:hh,data:d}=img; const N=w*hh;
  let transparent=0, border=[];
  for(let x=0;x<w;x++){border.push(x,(hh-1)*w+x)} for(let y=0;y<hh;y++){border.push(y*w,y*w+w-1)}
  const buckets=new Map();
  border.forEach(p=>{const i=p*4; if(d[i+3]<20){transparent++;return} const k=(d[i]>>4)<<8|(d[i+1]>>4)<<4|(d[i+2]>>4); buckets.set(k,(buckets.get(k)||0)+1)});
  if(transparent>border.length*.5) return false; // already has a transparent background
  let best=-1,bc=0; buckets.forEach((c,k)=>{if(c>bc){bc=c;best=k}});
  let r=0,g=0,b=0,n=0;
  border.forEach(p=>{const i=p*4;const k=(d[i]>>4)<<8|(d[i+1]>>4)<<4|(d[i+2]>>4);if(k===best){r+=d[i];g+=d[i+1];b+=d[i+2];n++}});
  r/=n;g/=n;b/=n;
  const dist=i=>Math.sqrt((d[i]-r)**2+(d[i+1]-g)**2+(d[i+2]-b)**2);
  const seen=new Uint8Array(N), q=new Int32Array(N); let qh=0,qt=0;
  border.forEach(p=>{if(!seen[p]&&dist(p*4)<tol){seen[p]=1;q[qt++]=p}});
  while(qh<qt){const p=q[qh++];const x=p%w,y=(p-x)/w;
    const nb=[x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<hh-1?p+w:-1];
    for(const o of nb){if(o>=0&&!seen[o]&&dist(o*4)<tol){seen[o]=1;q[qt++]=o}}}
  for(let p=0;p<N;p++) if(seen[p]) d[p*4+3]=0;
  // soften the cut edge so it doesn't look jagged
  for(let p=0;p<N;p++){ if(seen[p]) continue; const x=p%w,y=(p-x)/w;
    if((x>0&&seen[p-1])||(x<w-1&&seen[p+1])||(y>0&&seen[p-w])||(y<hh-1&&seen[p+w])){
      const k=Math.min(1,Math.max(0,(dist(p*4)-tol)/(tol*1.2))); d[p*4+3]=Math.round(d[p*4+3]*(.35+.65*k));}}
  return true;
}
function trimCanvas(c){
  const x=c.getContext('2d'), {width:w,height:hh}=c, d=x.getImageData(0,0,w,hh).data;
  let t=hh,l=w,r=-1,b=-1;
  for(let y=0;y<hh;y++)for(let X=0;X<w;X++)if(d[(y*w+X)*4+3]>8){if(X<l)l=X;if(X>r)r=X;if(y<t)t=y;if(y>b)b=y}
  if(r<0) return c;
  const pd=Math.round(Math.max(r-l,b-t)*.03), L=Math.max(0,l-pd),T=Math.max(0,t-pd),W=Math.min(w,r+pd+1)-L,H=Math.min(hh,b+pd+1)-T;
  const o=document.createElement('canvas');o.width=W;o.height=H;o.getContext('2d').drawImage(c,L,T,W,H,0,0,W,H);return o;
}
export async function processImage(file,removeBg,tol){
  const url=URL.createObjectURL(file); const img=await loadImg(url); URL.revokeObjectURL(url);
  const max=1600, sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas'); c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc);
  const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(img,0,0,c.width,c.height);
  let removed=false;
  if(removeBg){const id=x.getImageData(0,0,c.width,c.height); removed=removeBackground(id,tol); if(removed) x.putImageData(id,0,0)}
  return {canvas:removed?trimCanvas(c):c,removed};
}
