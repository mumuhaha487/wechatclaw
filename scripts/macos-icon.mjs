import { deflateSync } from "node:zlib";

// Original code mark, generated at build time without an image dependency.
export function iconPNG(size) {
  const crc = (bytes) => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const label = Buffer.from(type), n = Buffer.alloc(4), checksum = Buffer.alloc(4); n.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([label, data]))); return Buffer.concat([n, label, data, checksum]); };
  const lines = [[20,21,10,32],[10,32,20,43],[44,21,54,32],[54,32,44,43],[36,16,28,48]];
  const distance = (x,y,[a,b,c,d]) => { const t = Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2))); return Math.hypot(x-a-t*(c-a),y-b-t*(d-b)); };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const px=(x+.5)*64/size, py=(y+.5)*64/size, i=y*(size*4+1)+1+x*4;
    const inside=Math.hypot(Math.max(13-px,px-51,0),Math.max(13-py,py-51,0))<=11 && px>=2 && px<=62 && py>=2 && py<=62;
    const tone=lines.some(l=>distance(px,py,l)<=2.15)?252:34;
    raw[i]=raw[i+1]=raw[i+2]=tone; raw[i+3]=inside?255:0;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
}
