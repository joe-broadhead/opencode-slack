// Fails when a shared module's copy in this plugin differs from the one every plugin carries.
//   node scripts/check-copies.mjs          check the copies this plugin has
//   node scripts/check-copies.mjs --print  print each copy's hash, after a change made in every plugin at once
// Each plugin keeps its own copy, because each bundle and each test suite stands alone. The hashes below name the one
// version all plugins carry: the tools RPC outside its PLUGIN-SPECIFIC block, the declaration test kit whole (Memory's
// published `plugin-kit/` files, vendored), and the events_list source contract whole (only source plugins carry it).
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

const BEGIN = "// >>> PLUGIN-SPECIFIC >>>"
const END = "// <<< PLUGIN-SPECIFIC <<<"

const COPIES = [
  { path: "src/host/tools-rpc.ts", optional: true, sha256: "9210d0a531788d1f0d70d44a13a032816ef240b04aa5303f6ba4b2e2a52b6c94", part: sharedPart },
  { path: "test/support/jelly-kit.ts", optional: false, sha256: "ab599abcf041044c77e7938c3d9a081e00072487a7ec20b654d86c8230951190", part: (text) => text },
  { path: "test/support/memory-kit.mjs", optional: true, sha256: "9c0c26f8bfd6218454955804219da48100804b31e6554a05a3e71efa2ffac0b2", part: (text) => text },
  { path: "test/support/conformance.mjs", optional: true, sha256: "816fb4411a3c4e7077c6a8f25c16d07e533b0f7ebb4ce0849a5e4dcd93ce07a5", part: (text) => text },
  { path: "test/support/schema-check.mjs", optional: true, sha256: "4e53cd3e0c792d79bd1ad04be64ffacac5776fde5d3164964027619141260a3c", part: (text) => text },
  { path: "test/support/memory-plugin.v2.json", optional: true, sha256: "8bc5d6df7b75c0451e9ba53c967a2d3fbc3adcd419498f02581dbd15e0b0f87b", part: (text) => text },
  { path: "src/host/events-list.ts", optional: true, sha256: "9aa00fdabe67a59712979203f10e86c13bb8ab4fb0a72baadb602b77857f1d80", part: (text) => text },
]

function sharedPart(text, path) {
  const begin = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  if (begin === -1 || end === -1 || end < begin) throw new Error(`${path}: the PLUGIN-SPECIFIC markers are missing or out of order`)
  return text.slice(0, begin) + text.slice(end + END.length)
}

const print = process.argv.includes("--print")
let failed = 0
for (const copy of COPIES) {
  if (!existsSync(copy.path)) {
    if (copy.optional) continue
    console.error(`MISSING: ${copy.path}`)
    failed++
    continue
  }
  const hash = createHash("sha256").update(copy.part(readFileSync(copy.path, "utf8").replaceAll("\r\n", "\n"), copy.path)).digest("hex")
  if (print) console.log(`${copy.path}: ${hash}`)
  else if (hash === copy.sha256) console.log(`same: ${copy.path}`)
  else {
    console.error(`DRIFT: ${copy.path} differs from the copy every plugin carries. Change it in every plugin at once, then update its hash here.`)
    failed++
  }
}
process.exit(failed === 0 ? 0 : 1)
