import ky from "ky";

const juniorBaseUrl = process.env.JUNIOR_BASE_URL?.trim();
const schedulerSecret = process.env.JUNIOR_SCHEDULER_SECRET?.trim();

if (!juniorBaseUrl) {
	throw new RangeError("JUNIOR_BASE_URL is required for the scheduler heartbeat.");
}

if (!schedulerSecret) {
	throw new RangeError("JUNIOR_SCHEDULER_SECRET is required for the scheduler heartbeat.");
}

export const http = ky.create({
	baseUrl: juniorBaseUrl,
	headers: {
		Authorization: `Bearer ${schedulerSecret}`,
	},
});
