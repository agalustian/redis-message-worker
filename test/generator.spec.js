const chai = require('chai');
const spies = require('chai-spies');

const createGenerator = require('../src/generator');
const config = require('../src/config');

const { expect } = chai;
const { generatorLifeTime } = config;

chai.use(spies);

describe('generator tests', () => {
  const workerId = '123';

  const EventClient = {
    emit: () => {},
  };

  it('should create generator', () => {
    const generator = createGenerator(
      {
        redisPusher: {},
      },
      config,
      EventClient,
      workerId,
    );

    expect(generator).to.be.an('object');
    expect(generator.start).to.exist;
    expect(generator.start).to.be.a('function');
    expect(generator.clearTimers).to.exist;
    expect(generator.clearTimers).to.be.a('function');
  });
  it('should start generator and correctly clean timers', async () => {
    const redisPusher = {
      lpush: chai.spy((channel, messageString) => {
        expect(channel).to.eql(config.redis.channels.messagesChannel);
        expect(messageString).to.be.a('string');
        expect(JSON.parse(messageString)).to.be.an('object');
        return Promise.resolve();
      }),
      psetex: chai.spy((key, expireTime, id) => {
        expect(key).to.eql('generator');
        expect(expireTime).to.eql(generatorLifeTime);
        expect(id).to.eql(workerId);
        return Promise.resolve();
      }),
      pexpire: chai.spy((key, expireTime) => {
        expect(key).to.eql('generator');
        expect(expireTime).to.eql(generatorLifeTime);
        return Promise.resolve();
      }),
    };
    const generator = createGenerator(
      {
        redisPusher,
      },
      config,
      EventClient,
      workerId,
    );

    await generator.start();
    await generator.clearTimers();

    expect(redisPusher.psetex).to.have.been.called.exactly(1);
    expect(redisPusher.pexpire).to.have.been.called.exactly(1);
    expect(redisPusher.lpush).to.have.been.called.exactly(1);
  });
  it('should start generator and check that timers are correctly created', async () => {
    const redisPusher = {
      psetex: () => Promise.resolve(),
      pexpire: chai.spy(() => Promise.resolve()),
      lpush: chai.spy(() => Promise.resolve()),
    };
    const generator = createGenerator(
      {
        redisPusher,
      },
      config,
      EventClient,
      workerId,
    );

    await generator.start();
    await new Promise(resolve => setTimeout(() => generator.clearTimers().then(resolve), 1100));

    expect(redisPusher.pexpire).to.have.been.called.min(2);
    expect(redisPusher.lpush).to.have.been.called.min(2);
  });
});
