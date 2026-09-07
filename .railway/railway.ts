import { defineRailway, github, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
	const Postgres = postgres("Postgres", { region: "us-west2" });
	Postgres.deploy = { limitOverride: { containers: { cpu: 2, memoryBytes: 2000000000 } } };
	Postgres.networking = { privateNetworkEndpoint: "postgres-msrt", tcpProxies: { "5432": {} } };
	const postgresVolumeXgCw = volume("postgres-volume-XgCw", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "us-west2",
		sizeMB: 5000,
	});
	const juniorPostgres = postgres("Junior Postgres", { region: "us-east4-eqdc4a" });
	juniorPostgres.networking = { tcpProxies: { "5432": {} } };
	const juniorRedis = redis("Junior Redis", { region: "us-east4-eqdc4a" });
	juniorRedis.networking = { tcpProxies: { "6379": {} } };
	const Bolt = service("Bolt", {
		source: github("team581/bolt", { checkSuites: true }),
		healthcheck: "/health",
		healthcheckTimeout: 60,
		replicas: { "us-west2": 1 },
		deploy: { limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } } },
		domains: ["bolt.frc581.com"],
		networking: { privateNetworkEndpoint: "bolt" },
		env: {
			AI_GATEWAY_API_KEY: preserve(),
			DATABASE_URL: preserve(),
			DAYTONA_API_KEY: preserve(),
			DAYTONA_API_URL: preserve(),
			GCS_SERVICE_ACCOUNT_KEY: preserve(),
			GITHUB_APP_PRIVATE_KEY: preserve(),
			MASTRA_API_KEY: preserve(),
			MASTRA_PLATFORM_ACCESS_TOKEN: preserve(),
			MASTRA_PROJECT_ID: preserve(),
			SENTRY_DSN: preserve(),
			SLACK_BOT_TOKEN: preserve(),
			SLACK_SIGNING_SECRET: preserve(),
		},
	});

	return project("bolt", {
		resources: [Bolt, Postgres, postgresVolumeXgCw, juniorPostgres, juniorRedis],
	});
});
