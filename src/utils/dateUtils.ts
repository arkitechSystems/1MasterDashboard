/**
 * Get the default month based on the current date.
 * On or after the 15th of each month, it returns the previous month.
 * Before the 15th, it returns the month before the previous month.
 *
 * For example:
 * - On October 15, 2025 or later: returns '2025-09' (September 2025)
 * - On October 14, 2025 or earlier: returns '2025-08' (August 2025)
 * - On November 15, 2025 or later: returns '2025-10' (October 2025)
 *
 * @returns {string} The default month in YYYY-MM format
 */
export const getDefaultMonth = (): string => {
  const today = new Date();
  const currentDay = today.getDate();

  let targetDate: Date;

  if (currentDay >= 15) {
    // On or after the 15th: use previous month
    targetDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  } else {
    // Before the 15th: use the month before previous month
    targetDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  }

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
};
