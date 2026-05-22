const fs = require('fs');
const path = require('path');

// Path to the gldet.json file
const gldetPath = path.join(__dirname, 'public', 'gldet.json');
const metadataPath = path.join(__dirname, 'public', 'gldet-metadata.json');

try {
  // Check if gldet.json exists
  if (!fs.existsSync(gldetPath)) {
    console.error('Error: gldet.json not found in public directory');
    process.exit(1);
  }

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

  console.log('✓ Metadata updated successfully!');
  console.log(`  Last Modified: ${new Date(lastModified).toLocaleString()}`);
  console.log(`  File Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} catch (error) {
  console.error('Error updating metadata:', error.message);
  process.exit(1);
}
