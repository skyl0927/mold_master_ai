const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

const retryAsync = async (operation, options = {}) => {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) await sleep(delayMs);
    }
  }

  throw lastError;
};

module.exports = {
  retryAsync
};
