export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export function parseDateRange(dateRange: string): DateRange {
  const now = new Date();
  const lowerRange = dateRange.toLowerCase().trim();
  
  // Reset time to start of day for date comparisons
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (lowerRange === 'today') {
    return {
      startDate: startOfToday,
      endDate: endOfToday,
    };
  }

  if (lowerRange === 'yesterday') {
    const yesterday = new Date(startOfToday);
    yesterday.setDate(yesterday.getDate() - 1);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);
    return {
      startDate: yesterday,
      endDate: endOfYesterday,
    };
  }

  if (lowerRange === 'this week') {
    // Week runs from Monday (day 1) to Sunday (day 0)
    const startOfWeek = new Date(startOfToday);
    const dayOfWeek = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Calculate days to subtract to get to Monday
    // If today is Sunday (0), go back 6 days to get to Monday
    // If today is Monday (1), go back 0 days
    // If today is Tuesday (2), go back 1 day, etc.
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // End of week is Sunday (6 days after Monday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return {
      startDate: startOfWeek,
      endDate: endOfWeek,
    };
  }

  if (lowerRange === 'last week') {
    // Last week: Monday to Sunday of the previous week
    const startOfWeek = new Date(startOfToday);
    const dayOfWeek = startOfWeek.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // Go back to Monday of this week, then subtract 7 more days to get to last week's Monday
    startOfWeek.setDate(startOfWeek.getDate() - daysToMonday - 7);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // End of last week is Sunday (6 days after Monday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return {
      startDate: startOfWeek,
      endDate: endOfWeek,
    };
  }

  if (lowerRange === 'this month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    return {
      startDate: startOfMonth,
      endDate: endOfMonth,
    };
  }

  if (lowerRange === 'last month') {
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    
    return {
      startDate: startOfLastMonth,
      endDate: endOfLastMonth,
    };
  }

  if (lowerRange === 'this year') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    
    return {
      startDate: startOfYear,
      endDate: endOfYear,
    };
  }

  // Default: no date range
  return {
    startDate: null,
    endDate: null,
  };
}

