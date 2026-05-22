// Utility to prepare financial data context for AI questions

interface GLEntry {
  glm_acc: number;
  glm_desc: string;
  gl_net?: number;
  gl_ending_bal?: number;
  'Act Desc'?: string;
  'FS_Sub_Group '?: string;
  'Dept Desc'?: string;
  Month?: number;
  FY?: string;
  glj_date?: number;
  glj_memo?: string;
  [key: string]: any;
}

/**
 * Extracts relevant financial data based on the user's question keywords
 */
export const prepareFinancialContext = (question: string, gldetData: GLEntry[]): string => {
  const lowerQuestion = question.toLowerCase();

  // Detect what type of financial data the question is asking about
  const isRevenue = lowerQuestion.includes('revenue') || lowerQuestion.includes('income');
  const isExpense = lowerQuestion.includes('expense') || lowerQuestion.includes('cost');
  const isSwingBed = lowerQuestion.includes('swing bed') || lowerQuestion.includes('swingbed');
  const isMonthly = lowerQuestion.includes('month') || lowerQuestion.includes('monthly');
  const isLastMonth = lowerQuestion.includes('last month');

  // Get current month/year for "last month" queries
  const now = new Date();
  const lastMonth = now.getMonth(); // 0-11
  const currentYear = now.getFullYear();

  let relevantData: GLEntry[] = [];

  // Filter data based on question context
  if (isSwingBed) {
    relevantData = gldetData.filter(entry =>
      entry.glm_desc?.toLowerCase().includes('swing bed') ||
      entry['Act Desc']?.toLowerCase().includes('swing bed') ||
      entry['FS_Sub_Group ']?.toLowerCase().includes('swing bed')
    );
  } else if (isRevenue) {
    relevantData = gldetData.filter(entry =>
      entry['Act Desc']?.toLowerCase().includes('revenue') ||
      entry['FS_Sub_Group ']?.toLowerCase().includes('revenue') ||
      (entry.glm_desc?.toLowerCase().includes('revenue'))
    );
  } else if (isExpense) {
    relevantData = gldetData.filter(entry =>
      entry['Act Desc']?.toLowerCase().includes('expense') ||
      entry['FS_Sub_Group ']?.toLowerCase().includes('expense') ||
      entry.glm_desc?.toLowerCase().includes('expense')
    );
  }

  // If asking about last month, filter by month
  if (isLastMonth && relevantData.length > 0) {
    relevantData = relevantData.filter(entry => entry.Month === lastMonth);
  }

  // If no specific filter matched, provide a summary of available data
  if (relevantData.length === 0) {
    relevantData = gldetData.slice(0, 50); // Limit to first 50 entries to avoid token limits
  } else {
    relevantData = relevantData.slice(0, 30); // Limit relevant data
  }

  // Create a structured context string
  const context = formatDataForAI(relevantData);

  return context;
};

/**
 * Formats the filtered data into a readable context for the AI
 */
const formatDataForAI = (data: GLEntry[]): string => {
  if (data.length === 0) {
    return "No specific financial data found matching the query.";
  }

  // Group by account/category for better structure
  const summary: { [key: string]: { total: number; entries: GLEntry[] } } = {};

  data.forEach(entry => {
    const key = entry['FS_Sub_Group '] || entry.glm_desc || 'Uncategorized';

    if (!summary[key]) {
      summary[key] = { total: 0, entries: [] };
    }

    summary[key].total += (entry.gl_net || entry.gl_ending_bal || 0);
    summary[key].entries.push(entry);
  });

  // Build context string
  let contextStr = "### Financial Data Summary\n\n";

  Object.entries(summary).forEach(([category, info]) => {
    contextStr += `**${category}**\n`;
    contextStr += `- Total Amount: $${info.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    contextStr += `- Number of Entries: ${info.entries.length}\n`;

    // Add some sample entries
    const samples = info.entries.slice(0, 3);
    samples.forEach(entry => {
      const amount = entry.gl_net || entry.gl_ending_bal || 0;
      contextStr += `  - ${entry.glm_desc || entry['Act Desc']}: $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (entry.Month) contextStr += ` (Month ${entry.Month})`;
      contextStr += '\n';
    });

    contextStr += '\n';
  });

  return contextStr;
};

/**
 * Create a comprehensive financial summary
 */
export const getFinancialSummary = (gldetData: GLEntry[]): string => {
  const totalRevenue = gldetData
    .filter(e => e['Act Desc']?.toLowerCase().includes('revenue'))
    .reduce((sum, e) => sum + (e.gl_net || 0), 0);

  const totalExpenses = gldetData
    .filter(e => e['Act Desc']?.toLowerCase().includes('expense'))
    .reduce((sum, e) => sum + (e.gl_net || 0), 0);

  const swingBedRevenue = gldetData
    .filter(e => e.glm_desc?.toLowerCase().includes('swing bed'))
    .reduce((sum, e) => sum + (e.gl_net || 0), 0);

  return `
### Overall Financial Summary
- Total Revenue: $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Total Expenses: $${Math.abs(totalExpenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Swing Bed Revenue: $${swingBedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Net Income: $${(totalRevenue - Math.abs(totalExpenses)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
  `;
};
