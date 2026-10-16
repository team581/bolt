import { defineJuniorPlugin, definePluginTool } from "@sentry/junior-plugin-api";
import { z } from "zod";
import {
	addStudentMembership,
	getStudentMembership,
	getStudentsGroup,
	listStudentMemberships,
	membershipSchema,
	removeStudentMembership,
	STUDENTS_GROUP,
} from "../../src/google-groups.ts";

const inputSchema = z.strictObject({ email: z.email() });

export function createListStudentsTool() {
	return definePluginTool({
		description: "List all direct memberships in students@team581.com, including group owners and managers.",
		annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true, readOnlyHint: true },
		inputSchema: z.strictObject({}),
		outputSchema: z.object({ group: z.literal(STUDENTS_GROUP), memberships: z.array(membershipSchema) }),
		async execute(_input, { signal }) {
			const group = await getStudentsGroup(signal);
			return { group: STUDENTS_GROUP, memberships: await listStudentMemberships(group, signal) } as const;
		},
	});
}

export function createAddStudentTool() {
	return definePluginTool({
		description: "Add a student's personal Google account to students@team581.com as a regular member.",
		approvalMode: "review",
		annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true, readOnlyHint: false },
		inputSchema,
		outputSchema: z.object({
			email: z.string(),
			state: z.enum(["added", "already_member", "pending"]),
		}),
		async execute({ email }, { signal }) {
			const group = await getStudentsGroup(signal);
			const membership = await getStudentMembership(group, email, signal);
			if (membership) return { email, state: "already_member" as const };
			const done = await addStudentMembership(group, email, signal);
			return { email, state: done ? ("added" as const) : ("pending" as const) };
		},
	});
}

export function createRemoveStudentTool() {
	return definePluginTool({
		description: "Remove a graduating or departing student's regular membership from students@team581.com.",
		approvalMode: "review",
		annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true, readOnlyHint: false },
		inputSchema,
		outputSchema: z.object({
			email: z.string(),
			state: z.enum(["removed", "not_member", "pending"]),
		}),
		async execute({ email }, { signal }) {
			const group = await getStudentsGroup(signal);
			const membership = await getStudentMembership(group, email, signal);
			if (!membership) return { email, state: "not_member" as const };
			// Protect group administrators, nested groups, and the service account.
			if (membership.type !== "USER" || membership.roles.length !== 1 || membership.roles[0]?.name !== "MEMBER") {
				throw new Error(
					"Only regular user memberships can be removed; ask a group owner to handle this membership manually",
				);
			}
			const done = await removeStudentMembership(membership.name, signal);
			return { email, state: done ? ("removed" as const) : ("pending" as const) };
		},
	});
}

export function googleGroupsPlugin() {
	return defineJuniorPlugin({
		manifest: {
			name: "google-groups",
			displayName: "Google Student Membership",
			description: "Manages student membership of students@team581.com. Coach membership changes are manual.",
		},
		hooks: {
			tools: () => ({
				list_students: createListStudentsTool(),
				add_student: createAddStudentTool(),
				remove_student: createRemoveStudentTool(),
			}),
		},
	});
}
