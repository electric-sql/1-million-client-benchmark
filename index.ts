import { z } from "zod";
import {
  APIGatewayEvent,
  awsLambdaRequestHandler,
  CreateAWSLambdaContextOptions,
} from "@trpc/server/adapters/aws-lambda";
import { initTRPC } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import sql from "./db.js";

const t = initTRPC
  .context<CreateAWSLambdaContextOptions<APIGatewayEvent>>()
  .create();

async function removeInactiveNodes() {
  // Check for nodes with is_active true and last_heartbeat more than 1 minute ago
  try {
    await sql`
        UPDATE nodes
        SET is_active = false
        WHERE is_active = true AND (now() - last_heartbeat) > INTERVAL '1 minute'
      `;
  } catch (e) {
    console.error(`disable nodes query failed`, e);
  }
}

const router = t.router({
  startRun: t.procedure.mutation(async () => {
    const id = uuidv4();

    removeInactiveNodes();

    await sql`INSERT INTO runs (id, type)
        VALUES (${id}, 'incremental')`;

    return id;
  }),
  createNode: t.procedure
    .input(
      z.object({ region: z.string().min(3), client_count: z.number().min(0) })
    )
    .mutation(async ({ input }) => {
      const id = uuidv4();
      console.log({ input, id });

      removeInactiveNodes();

      await sql`INSERT INTO nodes (id, is_active, last_heartbeat, client_count, region)
        VALUES (${id}, true, ${new Date()}, ${input.client_count}, ${
        input.region
      })`;

      return id;
    }),
  nodeHeartbeat: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      removeInactiveNodes();

      try {
        await sql`
        UPDATE nodes
        SET is_active = true, last_heartbeat = ${new Date()}
        WHERE id = ${input.id}
      `;
      } catch (e) {
        console.error(`failed to record heartbeat`, e);
      }
      return { ok: true };
    }),
  updateNodeState: t.procedure
    .input(z.object({ id: z.string().uuid(), client_count: z.number().min(0) }))
    .mutation(async ({ input }) => {
      removeInactiveNodes();
      console.log(`updateNodeState`, {
        id: input.id,
        client_count: input.client_count,
      });

      let res;
      try {
        res = await sql`
        UPDATE nodes
        SET client_count = ${input.client_count}, last_heartbeat = ${new Date()}
        WHERE id = ${input.id}
      `;
      } catch (e) {
        console.error(`failed to update node state`, e);
      }
      console.log(`res`, res);
      return { ok: true };
    }),
  createRunResults: t.procedure
    .input(
      z.object({
        node_id: z.string().uuid(),
        run_id: z.string().uuid(),
        batch_size: z.number().min(1),
        average_time: z.number().min(10),
      })
    )
    .mutation(async ({ input }) => {
      console.log(`inserting run_results`);
      try {
        await sql`INSERT INTO run_results (id, node_id, run_id, batch_size, average_time)
        VALUES (${uuidv4()}, ${input.node_id}, ${input.run_id}, ${
          input.batch_size
        }, ${input.average_time})`;
      } catch (e) {
        console.error(`error inserting run results`, e);
      }
      return { ok: true };
    }),
});

export type Router = typeof router;

export const handler = awsLambdaRequestHandler({
  router: router,
  createContext: (opts) => opts,
});
