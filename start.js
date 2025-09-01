const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('silly-logger');

function startProcess(name, scriptPath, logPath) {
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const process = spawn('node', [scriptPath], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true
  });

  logger.startup(`Started ${name} (PID: ${process.pid})`);

  // Buffer to store error messages
  let errorOutput = '';
  
  process.stdout.on('error', (error) => {
    logger.error(`${name} stdout error:`, error);
  });

  process.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  process.stderr.on('error', (error) => {
    logger.error(`${name} stderr error:`, error);
  });

  logStream.on('error', (error) => {
    logger.error(`${name} log stream error:`, error);
  });

  process.stdout.pipe(logStream);
  process.stderr.pipe(logStream);
  process.stdout.pipe(process.stdout);
  process.stderr.pipe(process.stderr);

  process.on('close', (code) => {
    if (code !== 0) {
      logger.error(`${name} process error output:\n${errorOutput}`);
    }
    logger.success(`${name} process exited with code ${code}`);
    logStream.end();
  });

  process.on('error', (error) => {
    logger.error(`${name} process error:`, error);
  });

  return process;
}

const botLogPath = path.join(__dirname, 'logs', 'bot.log');
// const webLogPath = path.join(__dirname, 'logs', 'web.log');

const botProcess = startProcess('Bot', path.join(__dirname, 'src', 'bot', 'bot.js'), botLogPath);
// const webProcess = startProcess('Web Panel', path.join(__dirname, 'src', 'web', 'app.js'), webLogPath);

process.on('SIGINT', () => {
  logger.info('Stopping all processes...');
  botProcess.kill();
  // webProcess.kill();
  process.exit();
});