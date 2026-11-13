// Fails when a shared module's copy in this plugin differs from the one every plugin carries.
//   node scripts/check-copies.mjs          check the copies this plugin has
//   node scripts/check-copies.mjs --print  print each copy's hash, after a change made in every plugin at once
// The events_list contract and the tools RPC are no longer copies: they are the vendored source contract's `events`,
// `cursor` and `tools-rpc` modules, whose SHA256SUMS is pinned below. What is still a copy is the declaration test kit
// (Memory's published `plugin-kit/` files, vendored), which each plugin's test suite stands alone with.
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

const COPIES = [
  { path: "test/support/jelly-kit.ts", optional: false, sha256: "ab599abcf041044c77e7938c3d9a081e00072487a7ec20b654d86c8230951190" },
  { path: "vendor/source-contract/SHA256SUMS", optional: true, sha256: "e3f089f190b80628670f8dc776925e6931826216b0fe0c01d98ae37b7bed27a6" },
]

const print = process.argv.includes("--print")
let failed = 0
for (const copy of COPIES) {
  if (!existsSync(copy.path)) {
    if (copy.optional) continue
    console.error(`MISSING: ${copy.path}`)
    failed++
    continue
  }
  const hash = createHash("sha256").update(readFileSync(copy.path, "utf8").replaceAll("\r\n", "\n")).digest("hex")
  if (print) console.log(`${copy.path}: ${hash}`)
  else if (hash === copy.sha256) console.log(`same: ${copy.path}`)
  else {
    console.error(`DRIFT: ${copy.path} differs from the copy every plugin carries. Change it in every plugin at once, then update its hash here.`)
    failed++
  }
}
process.exit(failed === 0 ? 0 : 1)
