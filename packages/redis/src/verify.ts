import Redis from 'ioredis';

async function ping() {
  try {
    const redis = new Redis();
    const result = await redis.ping();
    console.log(result);
    redis.disconnect();
  } catch (err) {
    console.error('Failed to ping Redis:', err);
  }
}

ping();
