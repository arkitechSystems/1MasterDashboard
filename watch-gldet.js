const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

// Path to the gldet.json file
const gldetPath = path.join(__dirname, 'public', 'gldet.json');
const metadataPath = path.join(__dirname, 'public', 'gldet-metadata.json');

function updateMetadata() {
  try {
    // Get the last modified time of gldet.json
    const stats = fs.statSync(gldetPath);
    const lastModified = stats.mtime.toISOString();

    // Create metadata object
    const metadata = {
      lastModified: lastModified,
      fileSize: stats.size,
      updatedAt: new Date().toISOString()
    };

    // Write metadata to file
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`[${new Date().toLocaleTimeString()}] ✓ Metadata updated!`);
    console.log(`  Last Modified: ${new Date(lastModified).toLocaleString()}`);
    console.log(`  File Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error('Error updating metadata:', error.message);
  }
}

// Initialize watcher
console.log('👀 Watching for changes to gldet.json...');
console.log('Press Ctrl+C to stop watching\n');

// Update metadata immediately on start
updateMetadata();

// Watch for changes to gldet.json
const watcher = chokidar.watch(gldetPath, {
  persistent: true,
  ignoreInitial: true
});

watcher
  .on('change', () => {
    console.log('\n📝 gldet.json has been modified!');
    updateMetadata();
  })
  .on('error', error => {
    console.error('Watcher error:', error);
  });
