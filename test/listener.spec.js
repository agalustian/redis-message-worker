const chai = require('chai');
const spies = require('chai-spies');

const createListener = require('../src/listener');
const config = require('../src/config');

const { expect } = chai;
const { redis: { channels } } = config;
const workerId = '123';

chai.use(spies);

describe('listener tests', () => {
  const message = JSON.stringify({ message: 'test' });
  const redisPusher = {
    sadd: chai.spy((listenersChannel, id) => {
      expect(listenersChannel).to.eql(channels.listenersChannel);
      expect(id).to.eql(workerId);
      return Promise.resolve();
    }),
    lpush: chai.spy((errorsChannel, messageString) => {
      expect(errorsChannel).to.eql(channels.errorsChannel);
      expect(messageString).to.eql(message);
      return Promise.resolve();
    }),
    srem: chai.spy((listenerChannel, id) => {
      expect(listenerChannel).to.eql(channels.listenersChannel);
      expect(id).to.eql(workerId);
    }),
  };
  const redisListener = {
    brpop: chai.spy((messageChannel, timeout) => {
      expect(messageChannel).to.eql(channels.messagesChannel);
      expect(timeout).to.eql(0);
      return Promise.resolve([null, message]);
    }),
  };

  it('should create listener', () => {
    const EventEmitterMock = {};
    const EventClientMock = {};
    const isMessageWithError = () => {};

    const generator = createListener(
      { redisPusher, redisListener },
      EventEmitterMock,
      EventClientMock,
      channels,
      workerId,
      isMessageWithError,
    );

    expect(generator).to.be.an('object');
    expect(generator.start).to.exist;
    expect(generator.start).to.be.a('function');
    expect(generator.killYourself).to.exist;
    expect(generator.killYourself).to.be.a('function');
    expect(generator.healthStatusSender).to.exist;
    expect(generator.healthStatusSender).to.be.a('function');
  });
  it('should start listener ', async () => {
    const EventClientMock = {
      on: chai.spy((eventType, messageHandler) => {
        expect(eventType).to.eql('got-message');
        expect(messageHandler).to.be.a('function');
      }),
      emit: chai.spy(eventType => expect(eventType).to.eql('got-message')),
    };
    const EventEmitterMock = {
      listenerCount: chai.spy((emitter, eventType) => {
        expect(emitter).to.eql(EventClientMock);
        expect(eventType).to.eql('got-message');
        return false;
      }),
      removeListener: () => {},
    };
    const isMessageWithError = () => true;

    const generator = createListener(
      { redisPusher, redisListener },
      EventEmitterMock,
      EventClientMock,
      channels,
      workerId,
      isMessageWithError,
    );

    await generator.start();

    expect(EventEmitterMock.listenerCount).to.have.been.called.exactly(1);
    expect(EventClientMock.on).to.have.been.called.exactly(1);
    expect(redisPusher.sadd).to.have.been.called.exactly(1);
    expect(redisListener.brpop).to.have.been.called.exactly(1);
    expect(redisPusher.lpush).to.have.been.called.exactly(1);
    expect(EventClientMock.emit).to.have.been.called.exactly(1);
  });
  it("should't add event handler on got message", async () => {
    const EventClientMock = {
      on: chai.spy(() => {}),
      emit: () => {},
    };
    const EventEmitterMock = {
      listenerCount: chai.spy((emitter, eventType) => {
        expect(emitter).to.eql(EventClientMock);
        expect(eventType).to.eql('got-message');
        return true;
      }),
    };
    const isMessageWithError = () => true;

    const generator = createListener(
      { redisPusher, redisListener },
      EventEmitterMock,
      EventClientMock,
      channels,
      workerId,
      isMessageWithError,
    );

    await generator.start();

    expect(EventClientMock.on).to.have.not.been.called;
  });
  it("should't push message to errors channel", async () => {
    const EventClientMock = {
      on: chai.spy(() => {}),
      emit: () => {},
    };
    const EventEmitterMock = {
      listenerCount: () => false,
    };
    const isMessageWithError = () => false;

    const generator = createListener(
      { redisPusher, redisListener },
      EventEmitterMock,
      EventClientMock,
      channels,
      workerId,
      isMessageWithError,
    );

    await generator.start();

    expect(redisPusher.lpush).to.have.not.been.called;
  });
  it('should clear listener event handlers and remove workerid from listeners channel', async () => {
    const EventClientMock = {
      on: () => {},
      emit: () => {},
      removeListener: chai.spy((eventType, messageHandler) => {
        expect(eventType).to.eql('got-message');
        expect(messageHandler).to.be.a('function');
      }),
    };
    const EventEmitterMock = {
      listenerCount: () => true,
    };
    const isMessageWithError = () => false;

    const generator = createListener(
      { redisPusher, redisListener },
      EventEmitterMock,
      EventClientMock,
      channels,
      workerId,
      isMessageWithError,
    );

    await generator.killYourself();

    expect(EventClientMock.removeListener).to.have.been.called.exactly(1);
    expect(redisPusher.srem).to.have.been.called.exactly(1);
  });
});
