import { createUser, initDatabase } from './database';

// Get command line arguments
const username = process.argv[2];
const password = process.argv[3];
const email = process.argv[4];

if (!username || !password) {
  console.log('Usage: npm run create-user <username> <password> [email]');
  console.log('Example: npm run create-user john mypassword123 john@example.com');
  process.exit(1);
}

const main = async () => {
  try {
    await initDatabase();
    const user = await createUser(username, password, email);
    console.log('\n✓ User created successfully!');
    console.log(`  Username: ${user.username}`);
    console.log(`  Email: ${user.email || 'N/A'}`);
    console.log(`  Created: ${user.created_at}\n`);
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Error creating user:', error.message);
    if (error.message.includes('UNIQUE constraint failed')) {
      console.error('  Username already exists!\n');
    }
    process.exit(1);
  }
};

main();
