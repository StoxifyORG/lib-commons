import { getRedisClient, RedisKeys } from '@stoxifyorg/redis';

export async function checkAndMarkNonce(
  deviceId: string,
  nonce: string,
): Promise<boolean> {
  const redis = getRedisClient();
  const date = new Date().toISOString().slice(0, 10);
  const key = RedisKeys.nonce(deviceId, nonce, date);

  const result = await redis.set(key, '1', 'EX', 86400, 'NX');
  return result === 'OK';
}
