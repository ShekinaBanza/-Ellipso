const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
(async()=>{const b=await chromium.launch(); const p=await b.newPage();
const D=process.cwd()+'/dist', I=D+'/Ellipso/icons';
const jobs=[['../src/logo.svg','icon-512.png',512,true],['../src/logo.svg','icon-192.png',192,true],['maskable.svg','maskable-512.png',512,false],['maskable.svg','maskable-192.png',192,false],['full.svg','apple-touch-icon.png',180,false],['../src/logo.svg','logo-preview.png',512,true]];
for(const [src,out,sz,transp] of jobs){ const svg=fs.readFileSync(path.resolve(D,src),'utf8');
 await p.setViewportSize({width:sz,height:sz});
 await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${sz}px;height:${sz}px">${svg.replace('width="512" height="512"',`width="${sz}" height="${sz}"`)}</div></body></html>`);
 await p.screenshot({path: out==='logo-preview.png'? D+'/'+out : I+'/'+out, omitBackground:transp}); }
await b.close(); console.log('icons ok');})();
