const { Worker } = require("bullmq")
const { createClient } = require("@supabase/supabase-js")

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for worker")
}

createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const worker = new Worker(
  "scoring",
  async (job) => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "scoring_job_received",
        jobId: job.id,
        ticker: job?.data?.ticker ?? null,
      }),
    )
  },
  {
    connection: {
      url: REDIS_URL,
      maxRetriesPerRequest: null,
    },
  },
)

worker.on("ready", () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "worker_ready",
      queue: "scoring",
      redisUrl: REDIS_URL,
    }),
  )
})

worker.on("failed", (job, err) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "worker_job_failed",
      jobId: job?.id ?? null,
      error: err.message,
    }),
  )
})
