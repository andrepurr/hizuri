import { loadConfig } from "./config.js";
import { createRelay } from "./server.js";

const config = loadConfig();
const relay = createRelay({ config });
await relay.listen();
process.stdout.write(
  `${JSON.stringify({ event: "start", url: relay.url(), upstream: config.upstream, model: config.model, limits: config.limits })}\n`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void relay.close().then(() => process.exit(0));
  });
}
