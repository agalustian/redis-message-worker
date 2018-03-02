const { env } = process;
const channel = 'worker';

module.exports = {
  redis: {
    host: env.REDIS_HOST || 'localhost',
    port: parseInt(env.REDIS_POST, 10) || 6379,
    reconnectInterval: () => 5000,
    channels: {
      messagesChannel: `${channel}:messages`,
      errorsChannel: `${channel}:errors`,
      listenersChannel: `${channel}:listeners`,
      eventsChannel: `${channel}:events`,
      crashedGenerators: `${channel}:crashed:generator`,
    },
  },
  alphabet: 'abcdefghijklmnopqrstuvwxyz',
  getErrors: (env.GET_ERRORS && JSON.parse(env.GET_ERRORS)) || false,
  sendMessageInterval: parseInt(env.GENERATOR_INTERVAL, 10) || 500,
  workerRestartTimeout: 10000,
  generatorLifeTime: 10000,
  generatorReExpireMs: 1000,
  messageLength: 20,
  cleanCrashedGeneratorTimeout: 500,
  watchInterval: 5000,
  deadWorkersInterval: 30000,
  waitForHealthResponseTimeoutSec: 1,
};
