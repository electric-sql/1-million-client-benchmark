import { useRef, useEffect } from "react";
import { useShape } from "@electric-sql/react";
import type { Router } from "../../index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import * as Plot from "@observablehq/plot";
import _ from "lodash";

const client = createTRPCClient<Router>({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_TRPC_URL,
    }),
  ],
});

function ResultsPlot({ data }) {
  const containerRef = useRef();

  useEffect(() => {
    console.log({ data });
    if (data === undefined || data.length === 0) return;
    const plot = Plot.plot({
      height: 150,
      y: { grid: true },
      color: { scheme: "YlGnBu" },
      marks: [
        Plot.rectY(
          data,
          Plot.binX(
            { y: "count" },
            { x: (datum) => parseInt(datum.average_time, 10) }
          )
        ),
        Plot.ruleY([0]),
      ],
    });
    containerRef.current.append(plot);
    return () => plot.remove();
  }, [data]);

  return <div ref={containerRef} />;
}

const baseUrl = `https://api-stage-kylemathews.global.ssl.fastly.net`;

function App() {
  const { data: nodes } = useShape({
    url: `${baseUrl}/v1/shape/nodes`,
  });
  const { data: runs } = useShape({
    url: `${baseUrl}/v1/shape/runs`,
  });
  const { data: runResults } = useShape({
    url: `${baseUrl}/v1/shape/run_results`,
  });
  const activeNodes = nodes.filter((n) => n.is_active);
  console.log({
    nodes,
    activeNodes,
    runs,
    runResults,
  });
  return (
    <div>
      <h2>Nodes ({activeNodes.length})</h2>
      {activeNodes.map((node) => {
        return (
          <div>
            {node.id.split(`-`)[0]} | {node.region} | clients:{" "}
            {node.client_count} |{` `}
            last heartbeat —{" "}
            {Math.round(
              (new Date().getTime() - new Date(node.last_heartbeat).getTime()) /
                1000
            )}{" "}
            seconds ago |{` `}
            created at —{" "}
            {Math.round(
              (new Date().getTime() - new Date(node.created_at).getTime()) /
                1000
            )}{" "}
            seconds ago
          </div>
        );
      })}
      <h2>Runs</h2>
      {_.takeRight(runs, 15).map((run) => {
        const filteredRunResults = runResults.filter(
          (r) => run.id === r.run_id
        );
        return (
          <div>
            {run.id.split(`-`)[0]} | | {run.timestamp} |{" "}
            {filteredRunResults.reduce((acc, curr) => acc + curr.batch_size, 0)}{" "}
            results
            <ResultsPlot data={filteredRunResults} />
          </div>
        );
      })}
      <button onClick={() => client.startRun.mutate()}>Start run</button>
    </div>
  );
}

export default App;
