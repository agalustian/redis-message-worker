module.exports = function createListener(
  redisClients,
  EventEmitter,
  EventClient,
  channels,
  workerId,
  isMessageWithError,
) {
  const { redisPusher, redisListener } = redisClients;

  async function messageHandler() {
    const [, message] = await redisListener.brpop(channels.messagesChannel, 0);
    const isError = isMessageWithError();

    if (isError) {
      await redisPusher.lpush(channels.errorsChannel, message);
    }

    EventClient.emit('got-message');
  }

  async function start() {
    console.log('start as listener');
    if (!EventEmitter.listenerCount(EventClient, 'got-message')) {
      EventClient.on('got-message', messageHandler);
    }

    await redisPusher.sadd(channels.listenersChannel, workerId);
    messageHandler();
  }

  function healthStatusSender(replyChannel) {
    return redisPusher.lpush(replyChannel, JSON.stringify({ status: 'ok' }));
  }

  function killYourself() {
    EventClient.removeListener('got-message', messageHandler);
    return redisPusher.srem(channels.listenersChannel, workerId);
  }

  return { start, healthStatusSender, killYourself };
};
