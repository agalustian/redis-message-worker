module.exports = function createGenerator({
  redisPusher
}, config, EventClient, workerId) {
  const timers = [];
  const {
    generatorLifeTime,
    generatorReExpireMs,
    messageLength,
    redis: {
      channels: {
        messagesChannel
      }
    },
    alphabet,
    sendMessageInterval,
  } = config;

  function expireGenerator() {
    return redisPusher.pexpire('generator', generatorLifeTime).catch(error => {
      console.error(error.message || error);
      EventClient.emit('start-as-listener');
    });
  }

  async function generatorHealthReporter() {
    await redisPusher.psetex('generator', generatorLifeTime, workerId);
    await expireGenerator();
    timers.push(setInterval(expireGenerator, generatorReExpireMs));
  }

  function generateMessage() {
    let message = '';

    for (let i = 0; i < messageLength; i += 1) {
      const randomCharIndex = Math.floor(Math.random() * alphabet.length);
      message += alphabet[randomCharIndex];
    }

    return message;
  }

  function sendMessage() {
    return redisPusher
      .lpush(messagesChannel, JSON.stringify({
        message: generateMessage()
      }))
      .catch(console.error);
  }

  async function start() {
    console.log('start as generator');
    await generatorHealthReporter();
    await sendMessage();
    timers.push(setInterval(sendMessage, sendMessageInterval));
  }

  async function clearTimers() {
    timers.forEach(timer => clearInterval(timer));
  }

  return {
    start,
    clearTimers
  };
};