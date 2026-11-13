# Memory

Memory (opencode-mem) runs **jobs** that read from OpenCode plugins and curate what they read into memories and linked
pages. This plugin is a **read-only connector**: Memory owns the schedule, the budgets and every write, and this plugin
only lists what happened in Slack. The plugin's declaration is the top-level `memory` key in `package.json`, schema
**v2**; Memory reads it from the installed package on disk, so changing it at runtime changes nothing.

Nothing here is a new credential or a new connection: every read runs through OpenCode's own Slack sign-in and its own
permission rules, with the same tool Slack's server lists.

## What Memory reads

| Read | Permission action | What it is for |
| --- | --- | --- |
| `events_list` | `slack_events_list` | The source's fast path: the messages posted since a cursor, in the conversations the person confirmed. `limit: 0` is the **owner-only call**: the workspace and the signed-in user, and nothing else, which Memory checks on every run. |
| `slack_read_channel` | `slack_slack_read_channel` | The inner read of `events_list`, one conversation at a time. |
| `slack_read_user_profile` | `slack_slack_read_user_profile` | The owner and the workspace, once per call. |
| `slack_read_thread` | `slack_slack_read_thread` | A **thread job**'s read: a channel read lists only the replies Slack also sent to the channel, so a thread's other replies are read here, in a confirmed channel. |

The source declares `contract: 2`: `limit: 0` answers the owner, `scope` narrows the read and is echoed, and `setup`
names what to change when nothing can be read. The manifest's own line is **`setupHint`** (what to set up before Memory
can read anything, shown on the Available card); `setup` is the answer's runtime sentence, empty when the read is
fine.

## The scope

- **`channels`.** The conversations Memory may read, confirmed once. It is intersected with this plugin's
  `events.channels` option: a scope never widens the option, and with no option set the scope alone decides. The option
  is therefore a **cap**, and whichever is narrower wins. Every result echoes the scope the call named (`{}` when it
  named none, which is the whole source), and reads only what the cap allows.
- **A thread, per unit, not a scope key.** `slack_read_thread`'s `channel_id` and `message_ts` are both per-unit
  inputs — `{ "perUnit": "thread_channel", "bind": "channels" }` and `{ "perUnit": "thread_ts", "bind": "channels" }` —
  filled from the selected event's `thread` field (`slack-thread:<channel>:<ts>`), never from its text. The unit's own
  channel is checked against the confirmed `channels` **before the call**, so a thread in a conversation the person never
  confirmed is refused, and a message with no thread is refused rather than read from the confirmed list. Nothing about
  a thread is offered for confirmation, because a thread timestamp is not something a person picks.
- **Suggestions come from the manifest, at bind only.** The `channels` key declares `suggestBy`
  (`slack_list_user_channels`, its own grant, and the JSONPaths for ids and labels). Memory calls it **before consent, in
  the probe session**; the pairs are shown in the console and never stored, and it is **not** part of a job's grants.

An unknown scope key is `SCOPE_UNKNOWN`, and a bad value `SCOPE_INVALID`.

## Templates

Two job templates come with the connector. Memory lists them at confirm.

| Template | Engine | What it writes |
| --- | --- | --- |
| Threads you took part in | `render` (no model) | One cited line per thread the person posted in, into the journal. |
| Decisions and commitments from your threads | `extract` (the model), off until its eval passes | Proposals for review: a decision, and a commitment opening or closing. Nothing is written directly. |

Both select `unit: "thread"`, `participant: "owner"`, a one-day window. Each step names its `connector`
(`slack.workspace`) and its `source` (`slack`), and a render stage carries `into`, `heading`, `line` and `max` on the
stage itself. The second template reads every reply of the thread with `slack_read_thread` (`"for": "thread"`), which is
why the declaration names that read.

A template carries no grants and no account: those come from the binding when the person instantiates it, so a template
can never widen what was confirmed.

## A restarted window

`events_list` answers an optional `gap` (`{ reason, since, until? }`) when a source restarts its window. **Slack never
does:** a cursor it did not issue, or one from another workspace, is refused as `CURSOR_INVALID` and the caller starts
again from `since`, so Slack answers no gap and Memory has nothing to resync.

## Pausing and removing

- **Pause it in Memory,** in the console's Sources area: collection and the templates skip, and what it wrote stays.
- **Narrow it** by removing ids from `events.channels`, or by confirming fewer channels in Memory. Either one shrinks
  the scope; neither can widen it.
- **Remove what it wrote** from the console, with the preview first.
- **Turn off Memory,** not this plugin: uninstalling the plugin leaves the memories it already wrote.

Reads are allowed under every `access` value; `access` decides what the model may do, and Memory's jobs read under
their own grant sets, never the model's.

## Testing without Slack

`test/fixtures/fake-slack-shaped.ts` is an offline stand-in for Slack's server, with the same tool list and Slack's own
answer shapes. It seeds three conversations, a thread with a reply sent to the channel and one only in the thread, a
decision, an instruction-shaped message and a pasted block. Its environment variables are documented at the top of the
file (`FAKE_SLACK_LOG`, `FAKE_SLACK_NOW`, `FAKE_SLACK_CHANNELS`).

`test/support/memory-kit.mjs` is Memory's published conformance kit: it validates the declaration's frame, runs every declared
read in a session whose rules are **exactly** the declared grants, fails on any action the declaration does not grant,
and runs `events_list` through the shared contract's own conformance check. `test/unit/memory.test.ts` runs it against
the fixture. No test here contacts Slack, Memory or the network.
