const chai = require('chai');
const spies = require('chai-spies');

const createWatcher = require('../src/watcher');
const config = require('../src/config');

const { expect } = chai;
const { redis: { channels }, waitForHealthResponseTimeoutSec } = config;
const workerId = '123';

chai.use(spies);

describe('watcher tests', () => {
  const EventClientMock = {
    emit: chai.spy(eventType => expect(eventType).to.eql('start-as-listener')),
  };

  it('should create watcher', () => {
    const redisClients = {};
    const generator = createWatcher(EventClientMock, redisClients, config);

    expect(generator).to.be.an('object');
    expect(generator.watch).to.exist;
    expect(generator.watch).to.be.a('function');
    expect(generator.clearTimers).to.exist;
    expect(generator.clearTimers).to.be.a('function');
  });
  it('should start watcher and check on dead workers', async () => {
    const listeners = [workerId, workerId, workerId];
    const redisClients = {
      redisPusher: {
        smembers: chai.spy(listenersChannel => {
          expect(listenersChannel).to.eql(channels.listenersChannel);
          return Promise.resolve(listeners);
        }),
        srem: chai.spy((listenersChannel, id) => {
          expect(listenersChannel).to.eql(channels.listenersChannel);
          expect(id).to.eql(workerId);
          return Promise.resolve();
        }),
      },
      redisWatcherClient: {
        brpop: chai.spy((channelForResponse, timeout) => {
          expect(channelForResponse).to.eql(workerId);
          expect(timeout).to.eql(waitForHealthResponseTimeoutSec);
          return Promise.resolve(null);
        }),
      },
      redisPubClient: {
        publish: chai.spy((eventsChannel, messageString) => {
          const message = JSON.parse(messageString);
          expect(eventsChannel).to.eql(channels.eventsChannel);
          expect(messageString).to.be.a('string');
          expect(message.workerId).to.eql(workerId);
          expect(message.eventType).to.eql('health-check');
          expect(message.replyChannel).to.eql(workerId);
          return Promise.resolve();
        }),
      },
    };

    const watcher = createWatcher(EventClientMock, redisClients, {
      ...config,
      watchInterval: 30000,
      deadWorkersInterval: 100,
      waitForHealthResponseTimeoutSec: 1,
    });

    return watcher
      .watch()
      .then(
        () => new Promise(resolve => setTimeout(() => watcher.clearTimers().then(resolve), 150)),
      )
      .then(() => {
        expect(redisClients.redisPusher.smembers).to.have.been.called.once;
        expect(redisClients.redisPubClient.publish).to.have.been.called.exactly(listeners.length);
        expect(redisClients.redisWatcherClient.brpop).to.have.been.called.exactly(listeners.length);
        expect(redisClients.redisPusher.srem).to.have.been.called.exactly(listeners.length);
      });
  });
  it('should start watcher and handle if generator is dead', async () => {
    const redisClients = {
      redisPusher: {
        get: chai.spy(key => {
          expect(key).to.eql('generator');
          return null;
        }),
        srem: chai.spy((crashedGenerators, id) => {
          expect(crashedGenerators).to.eql(channels.crashedGenerators);
          expect(id).to.eql('');
          return Promise.resolve();
        }),
        sadd: chai.spy((crashedGeneratorsChannel, generatorId) => {
          expect(crashedGeneratorsChannel).to.eql(channels.crashedGenerators);
          expect(generatorId).to.eql('');
          return Promise.resolve(true);
        }),
        scard: chai.spy(listenersChannel => {
          expect(listenersChannel).to.eql(channels.listenersChannel);
          return 2;
        }),
        spop: chai.spy(listenersChannel => {
          expect(listenersChannel).to.eql(channels.listenersChannel);
          return Promise.resolve(workerId);
        }),
      },
      redisWatcherClient: {
        brpop: chai.spy((channelForResponse, timeout) => {
          expect(channelForResponse).to.eql(workerId);
          expect(timeout).to.eql(waitForHealthResponseTimeoutSec);
          return Promise.resolve([null, JSON.stringify({ status: 'ok' })]);
        }),
      },
      redisPubClient: {
        publish: chai.spy(() => Promise.resolve()),
      },
    };
    const pubslishString = JSON.stringify({ workerId, eventType: 'start-as-generator' });

    const watcher = createWatcher(EventClientMock, redisClients, {
      ...config,
      watchInterval: 100,
      deadWorkersInterval: 30000,
      waitForHealthResponseTimeoutSec: 1,
      cleanCrashedGeneratorTimeout: 1,
    });

    return watcher
      .watch()
      .then(
        () => new Promise(resolve => setTimeout(() => watcher.clearTimers().then(resolve), 190)),
      )
      .then(() => {
        expect(redisClients.redisPusher.get).to.have.been.called.once;
        expect(redisClients.redisPusher.sadd).to.have.been.called.once;
        expect(redisClients.redisPusher.scard).to.have.been.called.once;
        expect(redisClients.redisPusher.spop).to.have.been.called.once;
        expect(redisClients.redisWatcherClient.brpop).to.have.been.called.once;
        expect(EventClientMock.emit).to.have.not.been.called;
        expect(redisClients.redisPubClient.publish).to.have.been.called.twice;
        expect(redisClients.redisPubClient.publish).to.have.been.called.with(
          channels.eventsChannel,
          pubslishString,
        );
        expect(redisClients.redisPusher.srem).to.have.been.called.once;
      });
  });
});
