import { initDatabase } from './database';
import { queryAuditLogs, AuditCategory, AuditEventType, AuditStatus } from './auditLogger';

// Get command line arguments
const args = process.argv.slice(2);

const showHelp = () => {
  console.log(`
Audit Log Viewer
=================

Usage: npm run view-logs [options]

Options:
  --username <username>     Filter by username
  --category <category>     Filter by event category
  --type <eventType>        Filter by event type
  --status <status>         Filter by status
  --days <number>           Show logs from last N days (default: 7)
  --limit <number>          Limit number of results (default: 50)
  --all                     Show all logs (no date filter)

Event Categories:
  AUTHENTICATION, USER_MANAGEMENT, DATA_ACCESS, SYSTEM, SECURITY, CONFIGURATION

Event Types:
  LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, USER_CREATED, PASSWORD_RESET,
  FINANCIAL_DATA_VIEW, DATA_EXPORT, UNAUTHORIZED_ACCESS, etc.

Status:
  SUCCESS, FAILURE, WARNING, ERROR

Examples:
  npm run view-logs
  npm run view-logs --username Concho1
  npm run view-logs --category AUTHENTICATION --days 1
  npm run view-logs --status FAILURE --limit 20
  npm run view-logs --type LOGIN_FAILURE
  npm run view-logs --all
`);
  process.exit(0);
};

// Parse command line arguments
const parseArgs = () => {
  const filters: any = {
    limit: 50
  };

  // Default: last 7 days
  let showAll = false;
  let days = 7;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        showHelp();
        break;
      case '--username':
        filters.username = args[++i];
        break;
      case '--category':
        filters.eventCategory = args[++i] as AuditCategory;
        break;
      case '--type':
        filters.eventType = args[++i] as AuditEventType;
        break;
      case '--status':
        filters.status = args[++i] as AuditStatus;
        break;
      case '--days':
        days = parseInt(args[++i], 10);
        break;
      case '--limit':
        filters.limit = parseInt(args[++i], 10);
        break;
      case '--all':
        showAll = true;
        break;
    }
  }

  // Set date range unless --all is specified
  if (!showAll) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    filters.startDate = startDate.toISOString();
    filters.endDate = endDate.toISOString();
  }

  return filters;
};

const formatLog = (log: any) => {
  const timestamp = new Date(log.created_at).toLocaleString();
  const username = log.username || 'Anonymous';
  const status = log.status === 'SUCCESS' ? '✓' : log.status === 'FAILURE' ? '✗' : '⚠';

  console.log(`
${status} [${timestamp}]
  User: ${username}${log.user_id ? ` (ID: ${log.user_id})` : ''}
  Category: ${log.event_category}
  Event: ${log.event_type}
  Status: ${log.status}
  Description: ${log.description}
  IP Address: ${log.ip_address || 'N/A'}
  User Agent: ${log.user_agent ? log.user_agent.substring(0, 60) + '...' : 'N/A'}
  ${log.metadata ? `Metadata: ${log.metadata}` : ''}
${'─'.repeat(80)}`);
};

const main = async () => {
  try {
    await initDatabase();

    const filters = parseArgs();

    console.log('\n' + '═'.repeat(80));
    console.log('                         AUDIT LOG VIEWER');
    console.log('═'.repeat(80));

    if (filters.username) console.log(`Filtering by username: ${filters.username}`);
    if (filters.eventCategory) console.log(`Filtering by category: ${filters.eventCategory}`);
    if (filters.eventType) console.log(`Filtering by event type: ${filters.eventType}`);
    if (filters.status) console.log(`Filtering by status: ${filters.status}`);
    if (filters.startDate) {
      console.log(`Date range: ${new Date(filters.startDate).toLocaleDateString()} to ${new Date(filters.endDate).toLocaleDateString()}`);
    }
    console.log(`Limit: ${filters.limit} records`);
    console.log('═'.repeat(80));

    const logs = await queryAuditLogs(filters);

    if (logs.length === 0) {
      console.log('\nNo audit logs found matching the criteria.\n');
    } else {
      console.log(`\nFound ${logs.length} audit log(s):\n`);
      logs.forEach(formatLog);

      console.log(`\nTotal: ${logs.length} record(s)\n`);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Error viewing audit logs:', error.message, '\n');
    process.exit(1);
  }
};

main();
