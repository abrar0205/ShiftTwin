import fs from 'node:fs'
import path from 'node:path'

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

for(const root of roots) walk(root)
const total=files.reduce((sum,item)=>sum+item.bytes,0)

for(const item of files){
  console.log(`${item.file}: ${(item.bytes/1024).toFixed(1)} KiB`)
}
console.log(`Self-hosted model payload: ${(total/1024/1024).toFixed(2)} MiB / 3.00 MiB budget`)

if(total>limit){
  console.error('Model asset budget exceeded.')
  process.exit(1)
}
