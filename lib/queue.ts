import { Queue } from "bullmq"

import { redis } from "./redis"

export const scoringQueue = new Queue("scoring", { connection: redis })
