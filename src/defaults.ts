export const DEFAULT_REDIRECT_URI = "http://localhost:8765/callback"
/** Examples in error next steps for a hosted (`https:`) redirect and its local listener port. */
export const HOSTED_REDIRECT_EXAMPLE = "https://host.example/oauth/return"
export const CALLBACK_PORT_EXAMPLE = 8766
/**
 * The user scopes the sign-in asks for: the public channels Slack's MCP tools read, and since 0.0.3 what the
 * `slack.mentions` and `slack.dms` sources' Web API reads need: the search over private channels, direct and group
 * messages, and the direct and group messages themselves. `NEW_SCOPES` are those 0.0.3 added.
 */
export const NEW_SCOPES: readonly string[] = ["search:read.private", "search:read.im", "search:read.mpim", "im:read", "im:history", "mpim:read", "mpim:history"]
export const DEFAULT_SCOPES: readonly string[] = ["channels:history", "channels:read", "search:read.public", "users:read", ...NEW_SCOPES]
/** The MCP server's name: the prefix of every Slack tool name and permission action, and the Code Mode namespace. */
export const SERVER = "slack"
export const APP_MANIFEST_URL = "https://github.com/joe-broadhead/opencode-slack/blob/HEAD/docs/slack-app-manifest.json"
export const SLACK_MCP_URL = "https://mcp.slack.com/mcp"
/** The OpenCode versions the plugin sets itself up on, as `opencode.host` in package.json states. */
export const SUPPORTED_HOST_RANGE = ">=2.2.3 <2.4.0"
/** The OpenCode releases every check runs on. Status calls only these "tested"; the host tests and CI use this list. */
export const TESTED_HOSTS: readonly string[] = ["2.2.3", "2.2.4", "2.2.5", "2.2.6", "2.2.7", "2.3.0"]
