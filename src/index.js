const Redis = require('ioredis');
const { EventEmitter } = require('events');
const uuidv4 = require('uuid/v4');
const config = require('./config');
const createListener = require('./listener');
const createGenerator = require('./generator');
const getErrors = require('./getErrors');
const createWatcher = require('./watcher');
const createUtils = require('./utils');

const { redis, redis: { channels }, getErrors: isGetError, workerRestartTimeout } = config;
const EventClient = new EventEmitter();
const workerId = uuidv4();
const { isMessageWithError, redisClientMaker } = createUtils(Redis, redis);
const redisClients = redisClientMaker([
  'redisListener',
  'redisPusher',
  'redisPubClient',
  'redisSubClient',
  'redisWatcherClient',
]);
const {
  redisListener,
  redisPusher,
  redisPubClient,
  redisSubClient,
  redisWatcherClient,
} = redisClients;
const listener = createListener(
  redisClients,
  EventEmitter,
  EventClient,
  channels,
  workerId,
  isMessageWithError,
);
const generator = createGenerator(redisClients, config, EventClient, workerId);
const watcher = createWatcher(EventClient, redisClients, config);

async function chooseModeAndStart() {
  console.log(`Start worker with id: ${workerId}`);
  try {
    if (isGetError) {
      await getErrors(redisListener, channels.errorsChannel);
      return process.exit(0);
    }
    const generatorId = await redisPusher.get('generator');

    if (generatorId) return listener.start();

    const isFirstCandidate = await redisPusher.setnx('generator', workerId);
    return isFirstCandidate ? generator.start() : listener.start();
  } catch (error) {
    console.error(error.message || error);
    await generator.clearTimers();
    await listener.killYourself();
    return setTimeout(chooseModeAndStart, workerRestartTimeout);
  }
}

function handleNewRedisMessage(channel, messageJsonString) {
  try {
    const message = JSON.parse(messageJsonString);
    if (message.workerId !== workerId) return false;
    if (message.eventType === 'health-check') {
      return listener.healthStatusSender(message.replyChannel).catch(error => {
        console.log(error);
        EventClient.emit('start-as-listener');
      });
    }
    return EventClient.emit(message.eventType);
  } catch (error) {
    return console.error(error);
  }
}

function initApp() {
  EventClient.on('start-as-listener', () => generator.clearTimers().then(chooseModeAndStart));
  EventClient.on('start-as-generator', () => listener.killYourself().then(chooseModeAndStart));

  [redisListener, redisPubClient, redisSubClient, redisWatcherClient].forEach(client =>
    client.on('error', () => {}),
  );

  redisPusher.once('error', error => console.error(error.message || error));
  redisPusher.on('error', () =>
    generator
      .clearTimers()
      .then(watcher.clearTimers)
      .then(listener.killYourself),
  );
  redisSubClient.subscribe(channels.eventsChannel);
  redisSubClient.on('message', handleNewRedisMessage);
  // start app after redis successfully connetion event
  redisPusher.on('connect', () => watcher.watch().then(chooseModeAndStart));
}

initApp();
