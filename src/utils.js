module.exports = function createUtils(Redis, redis) {
  const isMessageWithError = () => Math.random() <= 0.05;
  const redisClientMaker = clientNames =>
    clientNames.reduce((acc, clientName) => ({ ...acc, [clientName]: new Redis(redis) }), {});
  return { isMessageWithError, redisClientMaker };
};
