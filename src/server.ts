import type { Plugin } from "@opencode/plugin"
import { SERVER, SLACK_MCP_URL } from "./defaults.js"
import type { Client } from "./connect.js"
import type { Options } from "./options.js"

type McpEditor = Parameters<Parameters<Plugin.Context["mcp"]["transform"]>[0]>[0]
type ServerConfig = Parameters<McpEditor["set"]>[1]

/**
 * Slack's hosted MCP server with the Slack app's OAuth client. `redirect_uri` is always explicit: without it
 * OpenCode uses `http://127.0.0.1:<port>/callback`, which does not match an app registered with `localhost`.
 * An `https:` redirect also sets `callback_port`, the port OpenCode's listener takes on 127.0.0.1; a loopback
 * redirect leaves it out, so OpenCode listens on the redirect's own port. `auth_server_metadata_url`, when set, is
 * passed unchanged: OpenCode then reads that document instead of discovering Slack's, and sends every token exchange
 * and refresh to its `token_endpoint`. Every supported host (2.2.3 on) reads the key. Protocol, timeouts, headers and Code
 * Mode keep the host defaults.
 */
export function serverConfig(options: Options, client: Client): ServerConfig {
  return {
    type: "remote",
    url: SLACK_MCP_URL,
    oauth: {
      client_id: client.id,
      redirect_uri: options.redirectUri,
      ...(options.callbackPort === undefined ? {} : { callback_port: options.callbackPort }),
      scope: options.scopes.join(" "),
      ...(client.secret === undefined ? {} : { client_secret: client.secret }),
      ...(options.authServerMetadataUrl === undefined ? {} : { auth_server_metadata_url: options.authServerMetadataUrl }),
    },
  }
}

/**
 * Registers the server when there is a client. Returns false, and changes nothing, when the name is already
 * taken, for example by the user's own config.
 */
export function registerServer(editor: McpEditor, options: Options, client: Client | undefined): boolean {
  if (editor.get(SERVER) !== undefined) return false
  if (client !== undefined) editor.set(SERVER, serverConfig(options, client))
  return true
}
