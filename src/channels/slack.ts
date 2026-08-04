// flue-blueprint: channel/slack@1

import { createSlackChannel, type SlackChannel } from "@flue/slack";
import { defineTool, dispatch } from "@flue/runtime";
import { WebClient } from "@slack/web-api";
import * as v from "valibot";
import { Bolt } from "../agents/bolt.ts";

export const client = new WebClient(process.env.SLACK_BOT_TOKEN);

export const channel: SlackChannel = createSlackChannel({
	signingSecret: process.env.SLACK_SIGNING_SECRET!,
	async events({ payload }) {
		if (payload.type !== "event_callback" || payload.event.type !== "app_mention") return;

		const event = payload.event;
		const thread = {
			teamId: payload.team_id,
			channelId: event.channel,
			threadTs: event.thread_ts ?? event.ts,
		};

		await dispatch(Bolt, {
			id: channel.instanceId(thread),
			initialData: {
				channelId: thread.channelId,
				threadTs: thread.threadTs,
				startedBy: event.user,
				startedAt: new Date(Number(event.ts) * 1000).toISOString(),
			},
			message: {
				kind: "signal",
				type: "slack.app_mention",
				body: event.text,
				attributes: { eventId: payload.event_id },
			},
			idempotencyKey: payload.event_id,
		});
	},
});

export function replyInThread(ref: { channelId: string; threadTs: string }) {
	return defineTool({
		name: "reply_in_slack_thread",
		description: "Send the user-facing response to the Slack thread bound to this conversation.",
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ data }) {
			const result = await client.chat.postMessage({
				channel: ref.channelId,
				thread_ts: ref.threadTs,
				text: data.text,
			});
			return {
				output: {
					...(result.channel === undefined ? {} : { channel: result.channel }),
					...(result.ts === undefined ? {} : { ts: result.ts }),
				},
			};
		},
	});
}
