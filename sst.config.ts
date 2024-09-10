/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "1-million-client-benchmark",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const trpc = new sst.aws.Function("Trpc", {
      url: true,
      handler: "index.handler",
    });

    const app = new sst.aws.StaticSite("MyWeb", {
      path: "react-app",
      dev: {
        command: `npm run dev`,
      },
      environment: {
        VITE_TRPC_URL: trpc.url,
      },
    });

    // Create vpc/cluster — need it to run the service locally. Later this will get scaled up
    // to multiple regions.
    const vpc = new sst.aws.Vpc(`1 million clients benchmark vpc`, {
      nat: `managed`,
    });
    const cluster = new sst.aws.Cluster(`1 million clients cluster default`, {
      vpc,
    });
    const coordinatorService = cluster.addService(`Coordinator`, {
      link: [trpc],
      dev: {
        command: `bun coordinator.ts`,
      },
    });

    return {
      app: app.url,
      api: trpc.url,
      // coordinator: coordinatorService.url,
    };
  },
});
