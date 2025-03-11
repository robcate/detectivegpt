// lib/redisClient.ts
import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,

  // Upstash requires TLS
  tls: {
    // Some providers also need `servername` to match the 'host'
    servername: process.env.REDIS_HOST,
  },

  // Optionally disable the 20-retry limit 
  maxRetriesPerRequest: null,
});