import { z } from "zod";
import {
  APIGatewayEvent,
  awsLambdaRequestHandler,
  CreateAWSLambdaContextOptions,
} from "@trpc/server/adapters/aws-lambda";
import { initTRPC } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: `postgresql://postgres.fhlbapsbkuzuwufzsbue:GUFdPNh2lp.uC4Yb@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
});

pool.connect();

const t = initTRPC
  .context<CreateAWSLambdaContextOptions<APIGatewayEvent>>()
  .create();

async function removeInactiveNodes() {
  // Check for nodes with is_active true and last_heartbeat more than 1 minute ago
  const checkNodesQuery = `
        UPDATE nodes
        SET is_active = false
        WHERE is_active = true AND (now() - last_heartbeat) > INTERVAL '1 minute'
      `;
  const res = await pool.query(checkNodesQuery);
}

const router = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return `Hello ${input.name}!`;
    }),
  startRun: t.procedure.mutation(async () => {
    const id = uuidv4();

    removeInactiveNodes();

    const query = `INSERT INTO runs (id, type)
        VALUES ($1, $2)`;
    await pool.query(query, [id, `incremental`]);
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

      const query = `INSERT INTO nodes (id, is_active, last_heartbeat, client_count, region)
        VALUES ($1, $2, $3, $4, $5)`;
      await pool.query(query, [
        id,
        true,
        new Date(),
        input.client_count,
        input.region,
      ]);

      return id;
    }),
  nodeHeartbeat: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      removeInactiveNodes();

      const updateHeartbeatQuery = `
        UPDATE nodes
        SET is_active = true, last_heartbeat = $1
        WHERE id = $2
      `;
      const res = await pool.query(updateHeartbeatQuery, [
        new Date(),
        input.id,
      ]);
      return { ok: true };
    }),
  updateNodeState: t.procedure
    .input(z.object({ id: z.string().uuid(), client_count: z.number().min(0) }))
    .mutation(async ({ input }) => {
      removeInactiveNodes();
      console.log(`updateNodeState`, { id: input.id });

      const updateNodeState = `
        UPDATE nodes
        SET client_count = $1, last_heartbeat = $2
        WHERE id = $3
      `;
      const res = await pool.query(updateNodeState, [
        input.client_count,
        new Date(),
        input.id,
      ]);
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
      console.log(`inserting run_results`)
      const query = `INSERT INTO run_results (id, node_id, run_id, batch_size, average_time)
        VALUES ($1, $2, $3, $4, $5)`;
      try {
        await pool.query(query, [
          uuidv4(),
          input.node_id,
          input.run_id,
          input.batch_size,
          input.average_time,
        ]);
      } catch (e) {
        console.log(`error inserting run results`, e);
      }
      return { ok: true };
    }),
});

export type Router = typeof router;

export const handler = awsLambdaRequestHandler({
  router: router,
  createContext: (opts) => opts,
});
