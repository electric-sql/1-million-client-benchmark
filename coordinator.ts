import { Resource } from "sst";
import type { Router } from "./index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import PQueue from "p-queue";
import _ from "lodash";
import pLimit from "p-limit";

const limit = pLimit(1);

const client = createTRPCClient<Router>({
  links: [
    httpBatchLink({
      url: Resource.Trpc.url,
    }),
  ],
});

async function main() {
  const id = await client.createNode.mutate({
    client_count: 0,
    region: process.env.AWS_REGION || `laptop`,
  });

  let state = {
    client_count: new Set(),
    id,
  };

  async function relayState() {
    // Add the state relaying logic here
    console.log("Relaying state information");
    try {
      await client.updateNodeState.mutate({
        id: state.id,
        client_count: state.client_count.size,
      });
    } catch (e) {
      console.log(`error updating node state`, e);
    }
  }

  const throttledRelayState = _.throttle(relayState, 1000);

  console.log(`new coordinator`, id);

  setInterval(() => client.nodeHeartbeat.mutate({ id }), 5000);

  const sendBatchedRunResults = (() => {
    let callCount = 0;
    let argsArray = [];
    let timeoutId = null;

    async function send(resultsBatch) {
      const message = resultsBatch[0];
      try {
        await client.createRunResults.mutate({
          run_id: message.lastRun,
          node_id: id,
          batch_size: resultsBatch.length,
          average_time:
            resultsBatch.reduce((acc, curr) => acc + curr.diff, 0) /
            resultsBatch.length,
        });
      } catch (e) {
        console.log(`error writing run results`, e);
      }
    }

    return (args) => {
      argsArray.push(args);
      callCount++;

      if (callCount === 1) {
        timeoutId = setTimeout(() => {
          const resultsBatch = structuredClone(argsArray);
          limit(() => send(resultsBatch));
          argsArray = [];
          callCount = 0;
          clearTimeout(timeoutId);
        }, 500);
      }

      if (callCount === 10) {
        const resultsBatch = structuredClone(argsArray);
        limit(() => send(resultsBatch));
        argsArray = [];
        callCount = 0;
        clearTimeout(timeoutId);
      }
    };
  })();

  // Start clients
  const queue = new PQueue({ concurrency: 5 });

  const spawnChild = () => {
    return new Promise((resolve) => {
      const child = Bun.spawn(["bun", "node-client.ts"], {
        ipc(messageStr) {
          const message = JSON.parse(messageStr);
          if (message.msg === "up-to-date") {
            console.log(`message from child`, { message });
            state.client_count.add(message.id);
            throttledRelayState();
            if (!message.isFirstRun) {
              sendBatchedRunResults(message);
            }
            resolve(child);
          }
        },
      });
    });
  };

  for (let i = 0; i < 100; i++) {
    queue.add(spawnChild);
  }

  await queue.onIdle();
  console.log(`all clients have been created`);
}

main();
