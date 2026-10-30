import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('dist')
const bannedHosts = [
  'raw.githack.com',
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'esm.sh',
  'cdn.skypack.dev',
]

const runtimeAsset = /https?:\/\/[^"'\`\s)]+\.(?:hdr|exr|glb|gltf|ktx2|png|jpe?g|webp)(?:\?[^"'\`\s)]*)?/gi
const hits = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(?:js|css|html)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8')
      for (const host of bannedHosts) {
        if (text.includes(host)) hits.push(`${path.relative(root, full)} -> ${host}`)
      }
      for (const match of text.matchAll(runtimeAsset)) hits.push(`${path.relative(root, full)} -> ${match[0]}`)
    }
  }
}

walk(root)

if (hits.length) {
  console.error('Runtime CDN / external asset references detected:')
  for (const hit of [...new Set(hits)]) console.error(`- ${hit}`)
  process.exit(1)
}

console.log('Runtime asset check passed: no external asset CDN references found.')
