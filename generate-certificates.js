const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Generating self-signed SSL certificates for local development...\n');

const certDir = path.join(__dirname, 'server', 'certs');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
  console.log('✓ Created certs directory');
}

try {
  // Generate private key
  console.log('Generating private key...');
  execSync(`openssl genrsa -out "${path.join(certDir, 'key.pem')}" 2048`, { stdio: 'inherit' });

  // Generate certificate
  console.log('Generating certificate...');
  execSync(`openssl req -new -x509 -key "${path.join(certDir, 'key.pem')}" -out "${path.join(certDir, 'cert.pem')}" -days 365 -subj "/C=US/ST=State/L=City/O=CchdDash/CN=localhost"`, { stdio: 'inherit' });

  console.log('\n✓ SSL certificates generated successfully!');
  console.log(`  Location: ${certDir}`);
  console.log('\nNOTE: These are self-signed certificates for local development only.');
  console.log('Your browser will show a security warning - this is expected and safe to bypass for localhost.\n');
} catch (error) {
  console.error('\n✗ Error generating certificates:');
  console.error('OpenSSL is required to generate certificates.');
  console.error('\nOptions:');
  console.error('1. Install OpenSSL:');
  console.error('   - Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
  console.error('   - Mac: brew install openssl');
  console.error('   - Linux: sudo apt-get install openssl');
  console.error('2. Or run without HTTPS for local development (set HTTPS=false in .env)');
  process.exit(1);
}
