import app from "../../../src/server";

export const POST = (request: Request) => app.fetch(request);
