import { defineRailway, postgres, project, redis } from "railway/iac";

export default defineRailway(() => {
	const juniorPostgres = postgres("Junior Postgres", { region: "us-east4-eqdc4a" });
	juniorPostgres.networking = { tcpProxies: { "5432": {} } };
	const juniorRedis = redis("Junior Redis", { region: "us-east4-eqdc4a" });
	juniorRedis.networking = { tcpProxies: { "6379": {} } };

	return project("bolt", {
		resources: [juniorPostgres, juniorRedis],
	});
});
