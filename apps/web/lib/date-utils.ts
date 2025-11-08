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

  if (lowerRange === 'tomorrow') {
    // Start from beginning of tomorrow (00:00:00), end at end of tomorrow
    // Do NOT include today's remaining orders
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    startOfTomorrow.setHours(0, 0, 0, 0);
    
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);
    return {
      startDate: startOfTomorrow, // Start from beginning of tomorrow
      endDate: endOfTomorrow,
    };
  }

  if (lowerRange === 'next week') {
    // Start from beginning of next week's Monday (00:00:00), end at end of next week (Sunday)
    // Do NOT include today's remaining orders or this week's remaining orders
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // Calculate next week's Monday
    const nextWeekMonday = new Date(startOfToday);
    nextWeekMonday.setDate(nextWeekMonday.getDate() - daysToMonday + 7);
    nextWeekMonday.setHours(0, 0, 0, 0);
    
    // End of next week is Sunday (6 days after Monday)
    const endOfNextWeek = new Date(nextWeekMonday);
    endOfNextWeek.setDate(nextWeekMonday.getDate() + 6);
    endOfNextWeek.setHours(23, 59, 59, 999);
    
    return {
      startDate: nextWeekMonday, // Start from beginning of next week's Monday
      endDate: endOfNextWeek,
    };
  }

  if (lowerRange === 'next month') {
    // Start from current datetime, end at end of next month
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    
    return {
      startDate: now, // Start from current datetime
      endDate: endOfNextMonth,
    };
  }

  // Default: no date range
  return {
    startDate: null,
    endDate: null,
  };
}

/**
 * Parse date/time strings like "today 5pm", "tomorrow 8am", "day after tomorrow @7pm"
 * Returns a Date object with the parsed date and time, or null if parsing fails
 */
export function parseDateTime(dateTimeStr: string): Date | null {
  if (!dateTimeStr) return null;
  
  const now = new Date();
  const lowerStr = dateTimeStr.toLowerCase().trim();
  
  // Extract time from the string (handles formats like "5pm", "@5pm", "8am", "7:30pm", "14:00", etc.)
  let hours: number | null = null;
  let minutes: number = 0;
  
  // Match time patterns: "5pm", "@5pm", "8am", "7:30pm", "14:00", "9:15am", etc.
  // Pattern 1: With colon and optional am/pm (e.g., "7:30pm", "@7:30pm", "14:00")
  const colonPattern = /@?(\d{1,2}):(\d{2})\s*(am|pm)?/i;
  const colonMatch = lowerStr.match(colonPattern);
  if (colonMatch) {
    let parsedHours = parseInt(colonMatch[1]);
    minutes = parseInt(colonMatch[2]);
    const period = colonMatch[3]?.toLowerCase();
    
    // If no period specified and hours > 12, assume 24-hour format
    if (!period) {
      if (parsedHours >= 0 && parsedHours <= 23 && minutes >= 0 && minutes <= 59) {
        hours = parsedHours;
      }
    } else {
      // 12-hour format with am/pm
      if (period === 'pm' && parsedHours !== 12) {
        parsedHours += 12;
      } else if (period === 'am' && parsedHours === 12) {
        parsedHours = 0;
      }
      if (parsedHours >= 0 && parsedHours <= 23 && minutes >= 0 && minutes <= 59) {
        hours = parsedHours;
      }
    }
  }
  
  // Pattern 2: Without colon, just hour and am/pm (e.g., "5pm", "@5pm", "8am")
  if (hours === null) {
    const simpleTimeMatch = lowerStr.match(/@?(\d{1,2})\s*(am|pm)/i);
    if (simpleTimeMatch) {
      let parsedHours = parseInt(simpleTimeMatch[1]);
      const period = simpleTimeMatch[2].toLowerCase();
      
      if (period === 'pm' && parsedHours !== 12) {
        parsedHours += 12;
      } else if (period === 'am' && parsedHours === 12) {
        parsedHours = 0;
      }
      
      if (parsedHours >= 0 && parsedHours <= 23) {
        hours = parsedHours;
        minutes = 0;
      }
    }
  }
  
  // Parse the date part - check for date keywords FIRST before removing time patterns
  // This ensures we catch "today evening 6pm" correctly
  let targetDate = new Date(now);
  
  // Check for date keywords in the original string (case-insensitive)
  // We check the original string to catch patterns like "today evening 6pm"
  const hasToday = /\btoday\b/i.test(lowerStr);
  const hasTomorrow = /\btomorrow\b/i.test(lowerStr);
  const hasDayAfter = /\bday\s+after\s+tomorrow\b/i.test(lowerStr) || /\bday\s+after\b/i.test(lowerStr);
  const hasYesterday = /\byesterday\b/i.test(lowerStr);
  const hasNextWeek = /\bnext\s+week\b/i.test(lowerStr);
  const hasNextMonth = /\bnext\s+month\b/i.test(lowerStr);
  
  if (hasToday) {
    // Today - keep current date, just update time if provided
    targetDate = new Date(now);
  } else if (hasDayAfter) {
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (hasTomorrow) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (hasYesterday) {
    targetDate.setDate(targetDate.getDate() - 1);
  } else if (hasNextWeek) {
    targetDate.setDate(targetDate.getDate() + 7);
  } else if (hasNextMonth) {
    targetDate.setMonth(targetDate.getMonth() + 1);
  } else {
    // No relative date keywords found - check if we have time but no date
    // If time is provided without a date keyword, assume today
    if (hours !== null) {
      targetDate = new Date(now);
    } else {
      // No date indicators and no time - let existing parser handle it
      return null;
    }
  }
  
  // Set the time if it was parsed
  if (hours !== null) {
    targetDate.setHours(hours, minutes, 0, 0);
  } else {
    // If no time specified, keep the current time or set to end of day
    // For fulfillment dates, we might want to set a default time
    // For now, keep the time as is (or set to a reasonable default like 5pm)
    targetDate.setHours(17, 0, 0, 0); // Default to 5pm if no time specified
  }
  
  return targetDate;
}

