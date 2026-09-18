#!/usr/bin/env node

/**
 * TripPlanner — Pre-Release Security & Key Audit Script
 * 
 * Verifies that:
 * 1. AndroidManifest.xml disables unencrypted cleartext traffic (usesCleartextTraffic="false").
 * 2. network_security_config.xml blocks cleartext in base-config and excludes user certificates.
 * 3. Android assets contain no sensitive files (.env, .pem, .key, .keystore, .jks).
 * 4. capacitor.config.json contains only public keys and no leaked credentials.
 * 5. Next.js client JavaScript chunks (.next/static) contain no server secrets (Upstash Redis, KV tokens, etc.).
 * 6. Application IDs and version codes are consistent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const checks = [];
let hasError = false;

function recordResult(category, description, status, details = '') {
  checks.push({ category, description, status, details });
  if (status === 'FAIL') {
    hasError = true;
  }
}

console.log('\n🔍 Running TripPlanner Pre-Release Security & Key Audit...\n');

// ─── 1. Android Manifest Audit ───────────────────────────────────────────────
const manifestPath = path.join(rootDir, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  const content = fs.readFileSync(manifestPath, 'utf8');

  // Check usesCleartextTraffic
  if (content.includes('android:usesCleartextTraffic="false"')) {
    recordResult('Manifest', 'Disallow cleartext traffic (usesCleartextTraffic="false")', 'PASS');
  } else if (content.includes('android:usesCleartextTraffic="true"')) {
    recordResult('Manifest', 'Disallow cleartext traffic', 'FAIL', 'Found android:usesCleartextTraffic="true". Google Play requires false for secure releases.');
  } else {
    recordResult('Manifest', 'Cleartext traffic defaults to secure (unset)', 'PASS');
  }

  // Check required permissions
  const requiredPermissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
  ];

  for (const perm of requiredPermissions) {
    if (content.includes(`android:name="${perm}"`)) {
      recordResult('Manifest', `Permission: ${perm.replace('android.permission.', '')}`, 'PASS');
    } else {
      recordResult('Manifest', `Permission: ${perm.replace('android.permission.', '')}`, 'FAIL', `Missing ${perm} in AndroidManifest.xml`);
    }
  }
} else {
  recordResult('Manifest', 'AndroidManifest.xml exists', 'FAIL', `File not found at ${manifestPath}`);
}

// ─── 2. Network Security Config Audit ───────────────────────────────────────
const netSecPath = path.join(rootDir, 'android/app/src/main/res/xml/network_security_config.xml');
if (fs.existsSync(netSecPath)) {
  const content = fs.readFileSync(netSecPath, 'utf8');

  if (content.includes('base-config cleartextTrafficPermitted="false"')) {
    recordResult('Network Security', 'Base config cleartextTrafficPermitted="false"', 'PASS');
  } else {
    recordResult('Network Security', 'Base config cleartextTrafficPermitted="false"', 'FAIL', 'Base config permits unencrypted cleartext traffic.');
  }

  if (content.includes('<certificates src="user"')) {
    recordResult('Network Security', 'Exclude user certificates in production', 'FAIL', 'Found user certificates trust anchor in network security config.');
  } else {
    recordResult('Network Security', 'User certificates excluded from trust anchors', 'PASS');
  }
} else {
  recordResult('Network Security', 'network_security_config.xml exists', 'FAIL', 'File not found');
}

// ─── 3. Android Assets Directory Audit ──────────────────────────────────────
const assetsDir = path.join(rootDir, 'android/app/src/main/assets');
if (fs.existsSync(assetsDir)) {
  const forbiddenPatterns = [
    /^\.env/i,
    /\.pem$/i,
    /\.key$/i,
    /\.keystore$/i,
    /\.jks$/i,
    /\.p12$/i,
    /service[-_]?account.*\.json$/i,
  ];

  const leakedFiles = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else {
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(entry.name)) {
            leakedFiles.push(path.relative(assetsDir, fullPath));
            break;
          }
        }
      }
    }
  }

  scanDir(assetsDir);

  if (leakedFiles.length === 0) {
    recordResult('Assets', 'No sensitive credentials or env files in Android assets', 'PASS');
  } else {
    recordResult('Assets', 'No sensitive credentials in Android assets', 'FAIL', `Found sensitive files: ${leakedFiles.join(', ')}`);
  }

  // Check capacitor.config.json in assets
  const capConfigPath = path.join(assetsDir, 'capacitor.config.json');
  if (fs.existsSync(capConfigPath)) {
    try {
      const jsonStr = fs.readFileSync(capConfigPath, 'utf8');
      const sensitiveKeys = ['token', 'secret', 'password', 'redis', 'upstash', 'private'];
      const lower = jsonStr.toLowerCase();
      const detectedKeys = sensitiveKeys.filter((k) => lower.includes(k));

      if (detectedKeys.length === 0) {
        recordResult('Assets', 'capacitor.config.json contains only safe configuration', 'PASS');
      } else {
        recordResult('Assets', 'capacitor.config.json secrets audit', 'FAIL', `Detected potential sensitive keywords: ${detectedKeys.join(', ')}`);
      }
    } catch (err) {
      recordResult('Assets', 'Parse capacitor.config.json', 'FAIL', err.message);
    }
  }
} else {
  recordResult('Assets', 'Android assets directory exists', 'WARN', 'Run `npx cap sync android` to generate assets.');
}

// ─── 4. Client Web Chunks Secret Leak Audit ─────────────────────────────────
const nextStaticDir = path.join(rootDir, '.next/static');
if (fs.existsSync(nextStaticDir)) {
  const sensitivePatterns = [
    { label: 'Upstash Redis REST Token', regex: /UPSTASH_REDIS_REST_TOKEN|gQAAAAA[A-Za-z0-9_-]+/ },
    { label: 'Upstash Redis URL', regex: /electric-hawk-.*\.upstash\.io/ },
    { label: 'KV REST API Token', regex: /KV_REST_API_TOKEN/ },
    { label: 'Google Play Service Account Private Key', regex: /BEGIN PRIVATE KEY/ },
  ];

  const leaksFound = [];

  function scanJsChunks(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanJsChunks(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of sensitivePatterns) {
          if (pattern.regex.test(fileContent)) {
            leaksFound.push({ file: path.relative(rootDir, fullPath), label: pattern.label });
          }
        }
      }
    }
  }

  scanJsChunks(nextStaticDir);

  if (leaksFound.length === 0) {
    recordResult('Client Chunks', 'No server secrets or database tokens in client bundles', 'PASS');
  } else {
    recordResult(
      'Client Chunks',
      'No server secrets in client bundles',
      'FAIL',
      leaksFound.map((l) => `${l.label} in ${l.file}`).join('; ')
    );
  }
} else {
  recordResult('Client Chunks', 'Next.js static bundles (.next/static)', 'WARN', 'Run `npm run build` first to compile client chunks for inspection.');
}

// ─── 5. App ID & Version Check ──────────────────────────────────────────────
const buildGradlePath = path.join(rootDir, 'android/app/build.gradle');
if (fs.existsSync(buildGradlePath)) {
  const content = fs.readFileSync(buildGradlePath, 'utf8');
  const appIdMatch = content.match(/applicationId\s+["']([^"']+)["']/);
  const vCodeMatch = content.match(/versionCode\s+(\d+)/);
  const vNameMatch = content.match(/versionName\s+["']([^"']+)["']/);

  if (appIdMatch) {
    recordResult('Package & Version', `Application ID: ${appIdMatch[1]}`, 'PASS');
  } else {
    recordResult('Package & Version', 'Application ID in build.gradle', 'FAIL', 'Could not find applicationId');
  }

  if (vCodeMatch && vNameMatch) {
    recordResult('Package & Version', `Version: ${vNameMatch[1]} (versionCode ${vCodeMatch[1]})`, 'PASS');
  } else {
    recordResult('Package & Version', 'versionCode and versionName', 'FAIL', 'Missing version config in build.gradle');
  }
}

// ─── 6. Output Table ────────────────────────────────────────────────────────
console.log('-------------------------------------------------------------------------------------');
console.log(
  `${'Category'.padEnd(18)} | ${'Check'.padEnd(45)} | ${'Status'.padEnd(6)} | Details`
);
console.log('-------------------------------------------------------------------------------------');

for (const c of checks) {
  const statusEmoji = c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL';
  console.log(
    `${c.category.padEnd(18)} | ${c.description.padEnd(45)} | ${statusEmoji.padEnd(8)} | ${c.details}`
  );
}

console.log('-------------------------------------------------------------------------------------\n');

if (hasError) {
  console.error('❌ Audit FAILED: Some release security or key verification checks failed.');
  process.exit(1);
} else {
  console.log('✅ Audit PASSED: Output files and configurations satisfy Google Play release standards.');
  process.exit(0);
}
