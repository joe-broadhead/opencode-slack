// Fails when a shared module's copy in this plugin differs from the one every plugin carries.
//   node scripts/check-copies.mjs          check the copies this plugin has
//   node scripts/check-copies.mjs --print  print each copy's hash, after a change made in every plugin at once
// Each plugin keeps its own copy of what its bundle and its test suite stand alone with: the declaration test kit,
// Jelly's setting rules restated without zod (the file's header says what it restates and how to update it), and the
// vendored source contract's SHA256SUMS. The events_list contract and the tools RPC are no longer copies: they are the
// vendored package's `events`, `cursor` and `tools-rpc` modules, so the pins master carried for them are gone.
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

const COPIES = [
  { path: "test/support/jelly-kit.ts", optional: false, sha256: "ab599abcf041044c77e7938c3d9a081e00072487a7ec20b654d86c8230951190" },
  // Jelly's setting rules, restated without zod (the file's header says what it restates and how to update it).
  { path: "test/support/jelly-settings.ts", optional: false, sha256: "966aeac7eddce490da51e8e46780f1fbcfaf9b3e892bd62f2c3952c2a6111383" },
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
