import { spawn } from 'node:child_process';
import process from 'node:process';

const run = (command, args, env = {}) => {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
};

const server = run('pnpm', ['--filter', '@pk-candle/server', 'dev'], {
  COUNTDOWN_MS: '1000',
  SESSION_DURATION_MS: '15000',
  EVENT_PAUSE_MS: '0',
  REQUIRE_PRIVY_FOR_LEADERBOARD: '0',
  ALLOW_MEMORY_LEADERBOARD: '1',
});

const web = run('pnpm', ['--filter', '@pk-candle/web', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
  VITE_ALLOW_ANON_LEADERBOARD: 'true',
  VITE_PRIVY_APP_ID: 'test',
});

const shutdown = () => {
  server.kill('SIGTERM');
  web.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
