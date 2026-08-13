import { GCSFilesystem } from "@mastra/gcs";
import { config } from "../../../config.ts";

const FETCH_GCS_BUCKET = "fetch_storage";
export const FETCH_GCS_MOUNT_PATH = "/workspace/fetch";

export function createFetchFilesystem(): GCSFilesystem {
	return new GCSFilesystem({
		id: "fetch-gcs",
		bucket: FETCH_GCS_BUCKET,
		credentials: config.GCS_SERVICE_ACCOUNT_KEY,
		readOnly: true,
	});
}
