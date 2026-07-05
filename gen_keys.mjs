import { generateKeyPairSync } from 'crypto';
import fs from 'fs';

console.log("Generating high-security RSA key pair...");

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'pkcs1',
    format: 'openssh'
  },
  privateKeyEncoding: {
    type: 'pkcs1',
    format: 'pem'
  }
});

fs.writeFileSync('PRIVATE_KEY.txt', privateKey);
fs.writeFileSync('PUBLIC_KEY.txt', publicKey);

console.log("Keys generated successfully!");
