import { cloudidentity, type cloudidentity_v1 } from "@googleapis/cloudidentity";
import { JWT } from "google-auth-library";
import { z } from "zod";
import { config } from "./config.ts";

export const STUDENTS_GROUP = "students@team581.com";
const groupName = z.string().regex(/^groups\/[\w-]+$/u);
const membershipName = z.string().regex(/^groups\/[\w-]+\/memberships\/[\w-]+$/u);
export const membershipSchema = z.object({
	name: membershipName,
	preferredMemberKey: z.object({ id: z.string() }),
	roles: z.array(z.object({ name: z.enum(["MEMBER", "MANAGER", "OWNER"]) })),
	type: z.string(),
});
let client: cloudidentity_v1.Cloudidentity | undefined;

function getClient(): cloudidentity_v1.Cloudidentity {
	const serviceAccount = config.GOOGLE_SERVICE_ACCOUNT_KEY;
	// Share Bolt's server-side identity, but mint group-write tokens separately
	// from read-only Workspace tokens. Keep the key outside the sandbox.
	client ??= cloudidentity({
		version: "v1",
		auth: new JWT({
			email: String(Reflect.get(serviceAccount, "client_email")),
			key: String(Reflect.get(serviceAccount, "private_key")),
			scopes: ["https://www.googleapis.com/auth/cloud-identity.groups"],
		}),
	});
	return client;
}

export async function getStudentsGroup(signal?: AbortSignal): Promise<string> {
	const { data } = await getClient().groups.lookup({ "groupKey.id": STUDENTS_GROUP }, { signal });
	return groupName.parse(data.name);
}

export async function getStudentMembership(
	group: string,
	email: string,
	signal?: AbortSignal,
): Promise<z.output<typeof membershipSchema> | null> {
	let name: string;
	try {
		const { data } = await getClient().groups.memberships.lookup({ parent: group, "memberKey.id": email }, { signal });
		name = membershipName.parse(data.name);
	} catch (error) {
		if (error instanceof Error && "response" in error && Reflect.get(error.response ?? {}, "status") === 404) {
			return null;
		}
		throw error;
	}
	if (!name.startsWith(`${group}/memberships/`)) throw new Error("Google returned a membership in a different group");
	const { data } = await getClient().groups.memberships.get({ name }, { signal });
	return membershipSchema.parse(data);
}

export async function listStudentMemberships(group: string, signal?: AbortSignal) {
	const members: z.output<typeof membershipSchema>[] = [];
	let pageToken = "";
	do {
		const { data } = await getClient().groups.memberships.list(
			{ parent: group, view: "FULL", pageSize: 500, pageToken },
			{ signal },
		);
		members.push(...z.array(membershipSchema).parse(data.memberships ?? []));
		pageToken = data.nextPageToken ?? "";
	} while (pageToken);
	return members;
}

export async function addStudentMembership(group: string, email: string, signal?: AbortSignal): Promise<boolean> {
	const { data } = await getClient().groups.memberships.create(
		{
			parent: group,
			requestBody: { preferredMemberKey: { id: email }, roles: [{ name: "MEMBER" }] },
		},
		{ signal },
	);
	return operationDone(data);
}

export async function removeStudentMembership(name: string, signal?: AbortSignal): Promise<boolean> {
	const { data } = await getClient().groups.memberships.delete({ name }, { signal });
	return operationDone(data);
}

function operationDone(operation: cloudidentity_v1.Schema$Operation): boolean {
	if (operation.error) throw new Error(`Google group membership operation failed: ${operation.error.message}`);
	return operation.done === true;
}
