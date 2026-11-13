# Live check: the Web API calls

Unofficial plugin. Not affiliated with Slack.

The plugin's status (`auth.test`) and `slack_mark_read` (`conversations.mark`) send the token from Slack's MCP sign-in to Slack's Web API, `https://slack.com/api/`. The unit and host tests use a fake Slack, so only a live run shows that Slack accepts that token for these two methods. `scripts/live-web-api.ts` is that run. It is manual: never part of `npm run check` or CI.

## What it does

- It builds the plugin and runs it in an embedded OpenCode host whose home, config, database and project all live in a scratch folder you name. Your own OpenCode setup is not read or changed.
- OpenCode signs in to Slack's MCP server as usual. The script writes the sign-in URL to the `--url-file` you name (mode 0600, never the log) and opens it in the machine's desktop browser. OpenCode's attempt expires after about ten minutes: sign in within that time, or run the script again for a new URL. The callback goes to a loopback port on this machine, so the browser must run on this machine (with boxd, the console's **Open → Desktop**).
- Signed in, it calls the plugin's own tools RPC methods, as a script would: `status`, whose account comes from `auth.test`, and, only with `--mark`, `mark_read` on exactly that conversation. It never chooses a conversation.
- It watches the plugin's requests to `https://slack.com/api/` and refuses, before it is sent, any method other than `auth.test` and `conversations.mark`, and a `conversations.mark` for any conversation other than `--mark`'s.
- It prints a report holding only, per request, the method, the HTTP status, whether a bearer token was sent, Slack's `ok` and `error`, and the `x-oauth-scopes` and `x-accepted-oauth-scopes` headers; whether status named a workspace, a user and a grid (true or false, not the ids); and `mark_read`'s outcome and plugin error code. Never a token, an id, a user or workspace name, a message or a channel name. It refuses to print a report holding anything shaped like a Slack token.

## Running it

You need a Slack app made from [the app manifest](slack-app-manifest.json), its client ID, and `npm ci --ignore-scripts` in the repository. From the repository root:

```sh
umask 077
bun scripts/live-web-api.ts --home "$TMPDIR/slack-live" --client-id YOUR_SLACK_CLIENT_ID --url-file "$TMPDIR/slack-live-url"
```

It exits 0 when `auth.test` answered `ok: true` (and, with `--mark`, `mark_read` succeeded), and 1 otherwise. The scratch folder keeps the sign-in, so a second run needs no new sign-in; delete the folder when you are done.

To check `conversations.mark` too, name one conversation you are happy to mark read, by its id (a `C…`, `G…` or `D…` id from Slack's "Copy link"), and sign in with the `:write` scope its type needs. The app must have that scope as well. Without `--ts` it marks the conversation read up to now:

```sh
bun scripts/live-web-api.ts --home "$TMPDIR/slack-live-write" --client-id YOUR_SLACK_CLIENT_ID --url-file "$TMPDIR/slack-live-url" \
  --scopes channels:history,channels:read,search:read.public,users:read,im:write --mark D0123ABCD45
```

A scratch folder already signed in with other scopes keeps that sign-in: use a new folder when you change `--scopes`. Without the scope, the report shows `mark_read` refused with `SCOPE_MISSING` and the `conversations.mark` call's `error: "missing_scope"`, which still shows that Slack accepted the token.

Other flags: `--ts <message ts>` marks up to that message; `--out <path>` also writes the report there (mode 0600); `--no-open` does not open the desktop browser; `--keep-browser` leaves it open; `--timeout <minutes>` waits longer than 20 minutes for the sign-in.
