module.exports = async function getErrors(redisListener, errorsChannel) {
  if (!await redisListener.llen(errorsChannel)) {
    return false;
  }

  try {
    const { message } = JSON.parse(await redisListener.rpop(errorsChannel));
    console.log(message);
  } catch (error) {
    console.error(error);
  }

  return getErrors(redisListener, errorsChannel);
};
