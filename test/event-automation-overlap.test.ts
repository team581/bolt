import { Script } from "node:vm";
import { expect, it, vi } from "vitest";
import { bundledSection, juniorBundle } from "./junior-bundle.ts";

const bundle = juniorBundle("turn-session-routing-");
const columnsCode = bundledSection(
	bundle.source,
	"function eventAutomationColumns(",
	"function eventAutomationRowInput(",
);
const createCode = bundledSection(
	bundle.source,
	"async function createEventAutomation(",
	"async function saveEventAutomation(",
);
const saveCode = bundledSection(
	bundle.source,
	"async function saveEventAutomation(",
	"async function deleteEventAutomation(",
);

function fixture() {
	const create: unknown = new Script(
		`${columnsCode}\n${createCode}\n${saveCode}\n({ eventAutomationColumns, createEventAutomation, saveEventAutomation })`,
	).runInNewContext({
		eventAutomationSchema: { parse: (value: unknown) => value },
	});
	return create as {
		eventAutomationColumns: (task: object) => { identifier: string; namespace: string; record: object };
		createEventAutomation: (db: object, task: object) => Promise<unknown>;
		saveEventAutomation: (db: object, task: object) => Promise<unknown>;
	};
}

const task = {
	id: "fixture",
	createdAtMs: 1,
	creatorIdentityId: "fixture-identity",
	createdBy: { slackUserId: "U123" },
	destination: { channelId: "C123", teamId: "T123" },
	task: { text: "Watch this resource" },
	trigger: { namespace: "fixture", resourceType: "issue", identifier: "repo/1" },
};

it("keeps resource-scoped event definitions readable by the previous deployment", () => {
	const columns = fixture().eventAutomationColumns(task);
	expect(columns.identifier).toBe("repo/1");
	expect(columns.namespace).toBe("fixture");
	expect(columns.record).toMatchObject({ trigger: task.trigger });
});

it("rejects any-resource creates and edits before SQL writes", async () => {
	const api = fixture();
	const transaction = vi.fn();
	const broad = { ...task, trigger: { namespace: "fixture" } };
	for (const write of [api.createEventAutomation, api.saveEventAutomation]) {
		await expect(write({ transaction }, broad)).rejects.toThrow("require a resource type and identifier");
	}
	expect(transaction).not.toHaveBeenCalled();
});
