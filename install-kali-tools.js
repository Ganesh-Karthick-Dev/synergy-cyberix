#!/usr/bin/env node
// install-kali-tools.js
// Standalone script to install missing Kali Linux tools

const path = require('path');
const { main } = require(path.join(__dirname, 'src', 'tools', 'cursor-installer.js'));

console.log('🔧 Kali Linux Tools Installer');
console.log('This script will check for missing security tools and help you install them.\n');

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
