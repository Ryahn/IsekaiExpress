const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createStream } = require('rotating-file-stream');
const logger = require('silly-logger');

function startProcess(name, scriptPath, logDir) {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logStream = createStream('bot.log', {
    path: logDir,
    size: '20M',
    interval: '1d',
    maxFiles: 10
  });

  const child = spawn('node', [scriptPath], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true
  });

  logger.startup(`Started ${name} (PID: ${child.pid})`);

  let errorOutput = '';

  child.stdout.on('error', (error) => {
    logger.error(`${name} stdout error:`, error);
  });

  child.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  child.stderr.on('error', (error) => {
    logger.error(`${name} stderr error:`, error);
  });

  logStream.on('error', (error) => {
    logger.error(`${name} log stream error:`, error);
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  child.on('close', (code) => {
    if (code !== 0) {
      logger.error(`${name} process error output:\n${errorOutput}`);
    }
    logger.success(`${name} process exited with code ${code}`);
    logStream.end();
  });

  child.on('error', (error) => {
    logger.error(`${name} process error:`, error);
  });

  return child;
}

const logDir = path.join(__dirname, 'logs');

const botProcess = startProcess('Bot', path.join(__dirname, 'src', 'bot', 'bot.js'), logDir);

process.on('SIGINT', () => {
  logger.info('Stopping all processes...');
  botProcess.kill();
  process.exit();
});
