import fs from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

const roots=['public/models']
const extensions=new Set(['.glb','.gltf','.bin','.ktx2'])
const limit=3*1024*1024
const files=[]

function walk(dir){
  if(!fs.existsSync(dir)) return
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory()) walk(full)
    else if(extensions.has(path.extname(entry.name).toLowerCase())){
      const bytes=fs.statSync(full).size
      if(bytes<=0){
        console.error(`Asset is empty: ${full}`)
        process.exit(1)
      }
      files.push({file:full,bytes})
    }
  }
}

function glbJson(file){
  const data=fs.readFileSync(file)
  if(data.readUInt32LE(0)!==0x46546c67) throw new Error(`${file} is not a valid GLB`)
  let offset=12
  while(offset<data.length){
    const length=data.readUInt32LE(offset)
    const type=data.readUInt32LE(offset+4)
    if(type===0x4e4f534a){
      return JSON.parse(data.subarray(offset+8,offset+8+length).toString('utf8').replace(/\0+$/g,''))
    }
    offset+=8+length
  }
  throw new Error(`${file} has no GLB JSON chunk`)
}

function validatePng(file){
  const b=fs.readFileSync(file)
  const pngSignature=Buffer.from([137,80,78,71,13,10,26,10])
  if(b.length<45 || !b.subarray(0,8).equals(pngSignature)) throw new Error(`Invalid PNG signature: ${file}`)
  const width=b.readUInt32BE(16),height=b.readUInt32BE(20)
  if(width<16 || height<16) throw new Error(`Texture must be at least 16x16: ${file}`)
  let offset=8, compressed=[]
  while(offset+12<=b.length){
    const size=b.readUInt32BE(offset),kind=b.toString('ascii',offset+4,offset+8)
    if(offset+12+size>b.length) throw new Error(`Truncated PNG chunk: ${file}`)
    if(kind==='IDAT') compressed.push(b.subarray(offset+8,offset+8+size))
    offset+=size+12
    if(kind==='IEND') break
  }
  if(!compressed.length) throw new Error(`No IDAT data in PNG: ${file}`)
  try{
    const uncompressed=inflateSync(Buffer.concat(compressed))
    if(!uncompressed.length) throw new Error('empty image')
  }catch{
    throw new Error(`Undecodable PNG image data: ${file}`)
  }
}

function requireNames(file,property,names){
  const json=glbJson(file)
  const available=new Set((json[property]??[]).map(item=>item?.name).filter(Boolean))
  const missing=names.filter(name=>!available.has(name))
  if(missing.length) throw new Error(`${file} missing ${property}: ${missing.join(', ')}`)
}

for(const root of roots) walk(root)
const total=files.reduce((sum,item)=>sum+item.bytes,0)

for(const item of files){
  console.log(`${item.file}: ${(item.bytes/1024).toFixed(1)} KiB`)
  // Embedded images and buffer views are self-contained. Relative image URIs
  // inside GLBs silently trigger 404s when deployed under the Pages base path.
  if(path.extname(item.file).toLowerCase()==='.glb'){
    const json=glbJson(item.file)
    for(const kind of ['images','buffers']){
      for(const entry of json[kind]??[]){
        if(entry.uri && !entry.uri.startsWith('data:')){
          const uri=decodeURIComponent(entry.uri)
          const assetRoot=path.resolve(path.dirname(item.file))
          const resolved=path.resolve(assetRoot,uri)
          if(!resolved.startsWith(assetRoot+path.sep) || !fs.existsSync(resolved)){
            throw new Error(`Missing or unsafe ${kind} URI in ${item.file}: ${entry.uri}`)
          }
          if(kind==='images' && path.extname(resolved).toLowerCase()==='.png'){
            validatePng(resolved)
          }
        }
      }
    }
  }
}
console.log(`Self-hosted model payload: ${(total/1024/1024).toFixed(2)} MiB / 3.00 MiB budget`)

if(total>limit){
  console.error('Model asset budget exceeded.')
  process.exit(1)
}

try{
  requireNames('public/models/worker.glb','nodes',['root','hips','Rig_Medium'])
  requireNames('public/models/worker-movement.glb','animations',['Walking_A'])
  requireNames('public/models/worker-general.glb','animations',['Idle_A','Interact'])
  requireNames('public/models/sedan.glb','nodes',['body','wheel-front-left','wheel-front-right','wheel-back-left','wheel-back-right'])
  requireNames('public/models/robot-arm-a.glb','nodes',['element-a','element-b','element-c','element-d','element-e','element-f','claw-a','claw-b'])
}catch(error){
  console.error(error instanceof Error?error.message:String(error))
  process.exit(1)
}

console.log('GLB manifest check passed: required worker clips and model nodes are present.')
