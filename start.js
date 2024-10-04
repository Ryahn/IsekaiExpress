const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function startProcess(name, scriptPath, logPath) {
  // Ensure the log directory exists
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Open log file stream
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const process = spawn('node', [scriptPath], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true
  });

  console.log(`Started ${name} (PID: ${process.pid})`);

  // Pipe process output to log file and console
  process.stdout.pipe(logStream);
  process.stderr.pipe(logStream);
  process.stdout.pipe(process.stdout);
  process.stderr.pipe(process.stderr);

  process.on('close', (code) => {
    console.log(`${name} process exited with code ${code}`);
    logStream.end();
  });

  return process;
}

const botLogPath = path.join(__dirname, 'logs', 'bot.log');
const webLogPath = path.join(__dirname, 'logs', 'web.log');

const botProcess = startProcess('Bot', path.join(__dirname, 'bot', 'bot.js'), botLogPath);
const webProcess = startProcess('Web Panel', path.join(__dirname, 'web', 'app.js'), webLogPath);

process.on('SIGINT', () => {
  console.log('Stopping all processes...');
  botProcess.kill();
  webProcess.kill();
  process.exit();
});