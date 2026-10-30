import fs from 'node:fs'
import path from 'node:path'

const root='public/models'
const limit=.5*1024*1024
const extensions=new Set(['.glb','.gltf','.bin','.ktx2'])
const files=[]

function walk(dir){
  if(!fs.existsSync(dir)) return
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory()) walk(full)
    else if(extensions.has(path.extname(entry.name).toLowerCase())) files.push(full)
  }
}

function glbJson(file){
  const data=fs.readFileSync(file)
  if(data.readUInt32LE(0)!==0x46546c67) throw new Error(file+' is not a valid GLB')
  let offset=12
  while(offset<data.length){
    const length=data.readUInt32LE(offset)
    const type=data.readUInt32LE(offset+4)
    if(type===0x4e4f534a) return JSON.parse(data.subarray(offset+8,offset+8+length).toString('utf8').replace(/\\0+$/g,''))
    offset+=8+length
  }
  throw new Error(file+' has no GLB JSON chunk')
}

walk(root)
let total=0
for(const file of files){
  const bytes=fs.statSync(file).size
  total+=bytes
  if(bytes<=0) throw new Error('Asset is empty: '+file)
  const json=path.extname(file)==='.glb'?glbJson(file):JSON.parse(fs.readFileSync(file,'utf8'))
  for(const image of json.images??[]){
    if(image.uri && !image.uri.startsWith('data:')) throw new Error(file+' has external image URI: '+image.uri)
  }
  for(const buffer of json.buffers??[]){
    if(buffer.uri && !buffer.uri.startsWith('data:')) throw new Error(file+' has external buffer URI: '+buffer.uri)
  }
  console.log(file+': '+(bytes/1024).toFixed(1)+' KiB')
}
console.log('Self-hosted model payload: '+(total/1024/1024).toFixed(2)+' MiB / 0.50 MiB budget')
if(total>limit) throw new Error('Model asset budget exceeded.')
console.log('Asset check passed: embedded dependencies only, payload within budget.')
