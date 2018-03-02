module.exports = function createWatcher(EventClient, redisClients, config) {
  const timers = [];
  const { redisPusher, redisWatcherClient, redisPubClient } = redisClients;
  const {
    redis: { channels },
    cleanCrashedGeneratorTimeout,
    watchInterval,
    deadWorkersInterval,
    waitForHealthResponseTimeoutSec,
  } = config;
  let lastGeneratorId = '';

  async function checkListenerHealthStatus(workerId) {
    await redisPubClient.publish(
      channels.eventsChannel,
      JSON.stringify({
        workerId,
        eventType: 'health-check',
        replyChannel: workerId,
      }),
    );
    const healthResponse = await redisWatcherClient.brpop(
      workerId,
      waitForHealthResponseTimeoutSec,
    );
    return healthResponse && JSON.parse(healthResponse[1]);
  }

  async function removeDeadWorkers() {
    try {
      const workers = await redisPusher.smembers(channels.listenersChannel);
      workers.forEach(async workerId => {
        const healthResponse = await checkListenerHealthStatus(workerId);
        if (!healthResponse) {
          await redisPusher.srem(channels.listenersChannel, workerId);
        }
      });
    } catch (error) {
      console.log(error);
    }
  }

  async function chooseNewGenerator(workersCount) {
    for (let i = 0; i < workersCount; i += 1) {
      const workerId = await redisPusher.spop(channels.listenersChannel); // eslint-disable-line
      const healthResponse = await checkListenerHealthStatus(workerId); // eslint-disable-line

      if (healthResponse) return workerId;
    }
    return false;
  }

  async function generatorManager() {
    try {
      const generator = await redisPusher.get('generator');

      if (generator) {
        lastGeneratorId = generator;
        return;
      }

      const isAdd = await redisPusher.sadd(channels.crashedGenerators, lastGeneratorId);

      if (!isAdd) return;
      console.log(`Crashed generator: ${lastGeneratorId}. Try to find new candidate`);
      const workersCount = await redisPusher.scard(channels.listenersChannel);
      const newGeneratorId = await chooseNewGenerator(workersCount);

      if (!newGeneratorId) {
        console.error('Cant choose new generator. Try to clean generator timers and restart app');
        EventClient.emit('start-as-listener');
      } else {
        await redisPubClient.publish(
          channels.eventsChannel,
          JSON.stringify({
            workerId: newGeneratorId,
            eventType: 'start-as-generator',
          }),
        );
      }
    } catch (error) {
      console.error(error.message || error);
    }
    setTimeout(
      () => redisPusher.srem(channels.crashedGenerators, lastGeneratorId),
      cleanCrashedGeneratorTimeout,
    );
  }

  function checkOnDeadWorkers() {
    timers.push(setInterval(removeDeadWorkers, deadWorkersInterval));
  }

  async function watch() {
    checkOnDeadWorkers();
    timers.push(setInterval(generatorManager, watchInterval));
  }

  async function clearTimers() {
    timers.forEach(timer => clearInterval(timer));
  }

  return {
    watch,
    clearTimers,
  };
};
