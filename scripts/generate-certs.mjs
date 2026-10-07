import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'certificates');
const certificate = path.join(directory, 'localhost.pem');
const privateKey = path.join(directory, 'localhost-key.pem');
const force = process.argv.includes('--force');

if (existsSync(certificate) && existsSync(privateKey) && !force) {
  console.log('Using the existing localhost certificate pair. Use --force to replace it.');
  process.exit(0);
}
if ((existsSync(certificate) || existsSync(privateKey)) && !force) {
  console.error('Only one localhost certificate file exists. Use --force to replace the pair.');
  process.exit(1);
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
const result = spawnSync(process.env.OPENSSL_BIN || 'openssl', [
  'req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-nodes',
  '-days', '365', '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
  '-addext', 'basicConstraints=critical,CA:FALSE',
  '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
  '-addext', 'extendedKeyUsage=serverAuth',
  '-keyout', privateKey, '-out', certificate,
], { cwd: root, stdio: 'inherit' });

if (result.error || result.status !== 0) {
  console.error(result.error?.code === 'ENOENT'
    ? 'OpenSSL is required. Install it or set OPENSSL_BIN to its executable.'
    : 'Certificate generation failed. Check the OpenSSL output above.');
  process.exit(1);
}
chmodSync(privateKey, 0o600);
chmodSync(certificate, 0o644);
console.log('Created certificates/localhost.pem and certificates/localhost-key.pem.');
console.log('The certificate is self-signed and is for local testing only.');
