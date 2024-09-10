import {
  ShapeStream,
  isControlMessage,
  isChangeMessage,
} from "@electric-sql/client";
import { v4 as uuidv4 } from "uuid";

const stream = new ShapeStream({
  url: `https://api-stage-kylemathews.global.ssl.fastly.net/v1/shape/runs`,
});

const id = uuidv4();

let isFirstRun = true
stream.subscribe(
  (messages) => {
    const now = new Date()
    if (messages.some(isControlMessage)) {
      const lastRun = messages.filter(isChangeMessage).slice(-1)[0];
      process.send(
        JSON.stringify({
          id,
          isFirstRun,
          lastRun: lastRun.value.id,
          diff: now.getTime() - new Date(lastRun.value.timestamp).getTime(),
          msg: `up-to-date`,
          time: new Date(),
        })
      );
    }
    isFirstRun = false
  },
  (err) => {
    console.log(err);
    process.send(err);
  }
);
