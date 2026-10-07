import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(root, true);

const certificate = path.join(root, 'certificates', 'localhost.pem');
const privateKey = path.join(root, 'certificates', 'localhost-key.pem');
if (!existsSync(certificate) || !existsSync(privateKey)) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-certs.mjs')], {
    cwd: root, stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(1);
}
const port = process.env.PORT || '3000';
const child = spawn(process.execPath, [
  require.resolve('next/dist/bin/next'), 'dev',
  '--hostname', '127.0.0.1', '--port', port,
  '--experimental-https',
  '--experimental-https-key', privateKey,
  '--experimental-https-cert', certificate,
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, APP_URL: process.env.APP_URL || `https://localhost:${port}` },
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => { process.exitCode = code ?? 1; });
