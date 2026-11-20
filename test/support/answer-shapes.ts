// Slack's MCP answers as the host's executor hands them to the plugin (test/fixtures/answer-shapes.json), and an
// executor result in that shape: `output` is the structured answer, `content` its text as one line of JSON.
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const ROOT = join(import.meta.dir, "..", "..")

export const SHAPES = JSON.parse(readFileSync(join(ROOT, "test", "fixtures", "answer-shapes.json"), "utf8")) as {
  readonly profile: { readonly result: string }
  readonly userChannels: { readonly result: string }
  readonly readChannel: { readonly messages: string; readonly pagination_info: string }
}

/** What the host's executor returns for a tool that answered `output`. */
export const executed = (output: Record<string, unknown>) => ({ output, content: [{ type: "text", text: JSON.stringify(output) }] })
