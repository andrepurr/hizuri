import type { Logger } from "pino";
import { loadOrCreateInstallKey } from "./receipts.js";
import { createNpmInstaller, createSandboxDetector, createToolConnector } from "./runner.js";
import { ToolHub } from "./service.js";
import { ToolHubStore } from "./store.js";

/** The daemon's tool hub: its store under $PASEO_HOME/tool-hub, the install key and the sandbox. */
export async function createToolHub(params: {
  paseoHome: string;
  logger: Logger;
}): Promise<ToolHub> {
  const store = new ToolHubStore(params.paseoHome);
  await store.load();
  const key = await loadOrCreateInstallKey(store.keyFile);
  const sandbox = createSandboxDetector();
  params.logger.info(
    { installKeyId: key.id, sandbox: await sandbox(), installs: store.listInstalls().length },
    "tool_hub.ready",
  );
  return new ToolHub({
    store,
    key,
    sandbox,
    connect: createToolConnector({ store, sandbox, logger: params.logger }),
    installPackage: createNpmInstaller({ store, logger: params.logger }),
    logger: params.logger,
  });
}
