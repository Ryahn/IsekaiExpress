function createNonOverlappingJob(name, logger, fn) {
  let running = false;

  return async (...args) => {
    if (running) {
      logger.warn(`[JOB] Skipping overlapping run: ${name}`);
      return;
    }

    running = true;
    try {
      await fn(...args);
    } finally {
      running = false;
    }
  };
}

module.exports = {
  createNonOverlappingJob,
};
