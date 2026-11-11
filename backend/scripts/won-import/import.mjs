#!/usr/bin/env node
// WON Drop Points importer: zero database schema or application code changes.
// Usage: node scripts/won-import/import.mjs --validate | --dry-run | --apply
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const file=fileURLToPath(new URL('./points.json',import.meta.url));
const points=JSON.parse(await readFile(file,'utf8'));
const mode=process.argv.includes('--apply')?'apply':process.argv.includes('--dry-run')?'dry-run':'validate';
const PREFIX='[WON-DROP-POINT:';
const TRASH_PREFIX='[TRASH-LUCKY-DROP-POINT:';
const CATEGORY='WON Drop Point';
const TRASH_CATEGORY='Trash Lucky Drop Point';
// Preserve ALL legacy source IDs 1-31, including #8 (Lotus Minburi / Trash Lucky).
const categoryFor=(p)=>p.sourceId>=32?TRASH_CATEGORY:CATEGORY;
const isCoordValid=(p)=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=5.5&&p.latitude<=20.6&&p.longitude>=97&&p.longitude<=106;
const idKey=(p)=>(categoryFor(p)===TRASH_CATEGORY?TRASH_PREFIX:PREFIX)+String(p.sourceId).padStart(2,'0')+']';
const composeDescription=(p)=>{
  const parts=[idKey(p),'จุดรับขยะรีไซเคิล ('+(p.sourceUrl||'WON Drop Points.pdf')+')','โครงการ: '+p.program,'ชนิดวัสดุที่รับ: '+p.acceptedMaterials,'รายละเอียด: '+p.notes];
  if(p.requiresManualReview)parts.push('ข้อควรระวัง: กรุณายืนยันข้อมูลจุดรับและประเภทวัสดุก่อนเดินทาง');
  parts.push('ความแม่นยำพิกัด: '+(p.geoStatus==='approximate'?'ตำแหน่งประมาณการ ไม่ใช่อาคารหรือจุดรับที่ยืนยันแล้ว':'พิกัดอ้างอิงจากแผนที่ ยังไม่ยืนยันตำแหน่งกล่องรับ'));
  if(p.approximateBasis)parts.push('ตำแหน่งอ้างอิง: '+p.approximateBasis);
  parts.push('กรุณาตรวจสอบว่าจุดยังเปิดรับวัสดุก่อนเดินทาง');
  if(p.geoSource)parts.push('แหล่งพิกัด: '+p.geoSource);
  return parts.join('\n');
};
function validate(){
  const errors=[],seen=new Set();
  if(points.length!==51)errors.push('Expected 51 source entries, got '+points.length);
  for(const p of points){
    if(!Number.isInteger(p.sourceId)||p.sourceId<1||p.sourceId>51||seen.has(p.sourceId))errors.push('Invalid/duplicate sourceId: '+p.sourceId);
    seen.add(p.sourceId);
    for(const key of ['name','address','notes','program','acceptedMaterials'])if(typeof p[key]!=='string'||!p[key].trim())errors.push('#'+p.sourceId+' missing '+key);
    if((p.name||'').length>120)errors.push('#'+p.sourceId+' title too long');
    if((p.address||'').length>500)errors.push('#'+p.sourceId+' address too long');
    if(composeDescription(p).length>2000)errors.push('#'+p.sourceId+' description too long');
    if(p.importApproved===true&&!isCoordValid(p))errors.push('#'+p.sourceId+' import approved without valid coordinate');
  }
  for(let i=1;i<=51;i++)if(!seen.has(i))errors.push('Missing source row '+i);
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g,'');
  const names=new Map();
  for(const p of points){const key=norm(p.name);if(names.has(key))errors.push('Duplicate place name: '+p.name+' (source IDs '+names.get(key)+', '+p.sourceId+')');names.set(key,p.sourceId);}
  return errors;
}
const errors=validate();
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
const ready=points.filter(p=>p.importApproved===true&&isCoordValid(p)&&p.publicAccess!==false&&['candidate','approximate','approved'].includes(p.geoStatus));
const excluded=points.filter(p=>!ready.includes(p));
console.log('Source records: '+points.length+' | approved for import: '+ready.length+' | review/blocked: '+excluded.length);
for(const p of excluded)console.log('REVIEW #'+p.sourceId+' '+p.name+' ['+p.geoStatus+(p.requiresManualReview?', flagged':'')+(p.publicAccess===false?', not public':'')+']');
if(mode==='validate'){console.log('VALIDATION PASS; database untouched');process.exit(0);}
if(!process.env.DATABASE_URL){console.error('DATABASE_URL missing');process.exit(1);}
const {PrismaClient}=await import('@prisma/client');
const {PrismaPg}=await import('@prisma/adapter-pg');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
try{
  const serviceEmail='won-import@near-cycle.local';
  const existingOwner=await prisma.user.findUnique({where:{email:serviceEmail},select:{id:true,isActive:true}});
  if(existingOwner&&!existingOwner.isActive)throw Error('Dedicated WON import account is disabled; refusing to import');
  const existing=await prisma.donation.findMany({where:{category:{in:[CATEGORY,TRASH_CATEGORY]}},select:{id:true,description:true,ownerId:true,title:true,category:true,address:true}});
  const existingByKey=new Map();
  for(const e of existing){
    const match=e.description?.match(/\[(?:WON|TRASH-LUCKY)-DROP-POINT:\d{2}\]/);
    if(!match)continue;
    if(existingByKey.has(match[0]))throw Error('Existing duplicate import key '+match[0]+'; abort');
    existingByKey.set(match[0],e);
  }
  const toCreate=[];
  let skipped=0;
  for(const p of ready){
    const prior=existingByKey.get(idKey(p));
    if(prior){skipped++;continue;} // never overwrite existing posts
    const samePlace=existing.find(e=>e.title.trim().toLocaleLowerCase()===p.name.trim().toLocaleLowerCase() && e.address?.trim()===p.address.trim());
    if(samePlace){console.log('SKIP SAME PLACE #'+p.sourceId+' '+p.name);skipped++;continue;}
    toCreate.push(p);
  }
  console.log('Existing import records skipped: '+skipped+' | new records: '+toCreate.length);
  if(mode==='dry-run'){
    for(const p of toCreate)console.log('CREATE #'+p.sourceId+' '+p.name+' '+p.latitude+','+p.longitude);
    console.log('Owner: '+(existingOwner?'existing dedicated service account':'will create dedicated service account on first apply'));
    console.log('DRY RUN complete, zero writes');
  }else{
    if(!process.argv.includes('--confirm'))throw Error('Add --confirm to --apply to acknowledge permanent database writes');
    // Operational placeholder dates are required by existing Donation schema; must be reviewed periodically.
    const startDate=new Date();
    const endDate=new Date(startDate);
    endDate.setUTCFullYear(endDate.getUTCFullYear()+1);
    const result=await prisma.$transaction(async tx=>{
      let ownerId=existingOwner?.id;
      if(toCreate.length && !ownerId){
        const {randomBytes}=await import('node:crypto');
        const {default:bcrypt}=await import('bcryptjs');
        const passwordHash=await bcrypt.hash(randomBytes(48).toString('hex'),12);
        const account=await tx.user.create({data:{email:serviceEmail,name:'WON Drop Points Import',passwordHash,role:'USER',isActive:true}});
        ownerId=account.id;
      }
      // Check again inside transaction to reduce accidental duplicate imports.
      let added=0;
      for(const p of toCreate){
        const key=idKey(p);
        const prior=await tx.donation.findFirst({where:{category:categoryFor(p),description:{contains:key}}});
        if(prior)continue;
        await tx.donation.create({data:{
          ownerId,title:p.name,description:composeDescription(p),
          category:categoryFor(p),quantity:1,latitude:p.latitude,longitude:p.longitude,
          address:p.address,startDate,endDate,status:'AVAILABLE',isHidden:false,
        }});
        added++;
      }
      return added;
    });
    console.log('IMPORT SUCCESS: '+result+' created, '+skipped+' existing skipped.');
  }
}finally{await prisma.$disconnect();}
