import { query } from './db';
import { parseDateRange, DateRange, parseDateTime } from './date-utils';

export interface Task {
  id: number;
  user_number: string;
  title: string;
  description: string | null;
  due_date: Date | null;
  status: string;
  original_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: number;
  user_number: string;
  order_id: string | null;
  product_name: string;
  quantity: number;
  status: string;
  fulfillment_date: Date | null;
  original_message: string | null;
  created_at: Date;
  updated_at: Date;
}

// Task Operations
export async function createTask(
  userNumber: string,
  title: string,
  description?: string,
  dueDate?: string,
  originalMessage?: string
): Promise<Task> {
  let parsedDueDate: Date | null = null;
  
  if (dueDate) {
    // Parse relative dates
    const now = new Date();
    const lowerDueDate = dueDate.toLowerCase().trim();
    
    if (lowerDueDate === 'tomorrow') {
      parsedDueDate = new Date(now);
      parsedDueDate.setDate(parsedDueDate.getDate() + 1);
    } else if (lowerDueDate.includes('next week')) {
      parsedDueDate = new Date(now);
      parsedDueDate.setDate(parsedDueDate.getDate() + 7);
    } else if (lowerDueDate.includes('next month')) {
      parsedDueDate = new Date(now);
      parsedDueDate.setMonth(parsedDueDate.getMonth() + 1);
    } else {
      // Check for day names like "Tuesday", "coming Wednesday", "this Friday", "next Monday"
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      let targetDayIndex: number | null = null;
      
      // Find which day name is mentioned
      for (let i = 0; i < dayNames.length; i++) {
        if (lowerDueDate.includes(dayNames[i])) {
          targetDayIndex = i;
          break;
        }
      }
      
      // If a day name is found, calculate the date
      if (targetDayIndex !== null) {
        const isNext = lowerDueDate.includes('next') || lowerDueDate.includes('coming');
        const isThis = lowerDueDate.includes('this');
        
        parsedDueDate = new Date(now);
        const currentDay = parsedDueDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        let daysToAdd = targetDayIndex - currentDay;
        
        if (isNext || lowerDueDate.includes('coming')) {
          // "next Tuesday" or "coming Wednesday" - find the next occurrence
          if (daysToAdd <= 0) {
            daysToAdd += 7; // Move to next week
          }
        } else if (isThis) {
          // "this Tuesday" - find current or next occurrence
          if (daysToAdd < 0) {
            daysToAdd += 7; // Move to next week
          }
        } else {
          // Just "Tuesday" - find the next occurrence (same as "next")
          if (daysToAdd <= 0) {
            daysToAdd += 7; // Move to next week
          }
        }
        
        parsedDueDate.setDate(parsedDueDate.getDate() + daysToAdd);
        
        // Extract time if specified (e.g., "Tuesday 2PM", "coming Wednesday at 3pm")
        const timeMatch = lowerDueDate.match(/(\d{1,2})\s*(pm|am|:(\d{2}))/i);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1]);
          let minute = 0;
          if (timeMatch[2] && timeMatch[2].toLowerCase() === 'pm' && hour !== 12) {
            hour += 12;
          } else if (timeMatch[2] && timeMatch[2].toLowerCase() === 'am' && hour === 12) {
            hour = 0;
          }
          if (timeMatch[3]) {
            minute = parseInt(timeMatch[3]);
          }
          parsedDueDate.setHours(hour, minute, 0, 0);
        } else {
          // Reset time to start of day if no time specified
          parsedDueDate.setHours(0, 0, 0, 0);
        }
      } else {
        // Try to parse dates like "Saturday 15th November 2PM" or "15th November"
        try {
          // Handle dates with day names and ordinal numbers (e.g., "Saturday 15th November")
          const dateStr = dueDate.replace(/(\d+)(st|nd|rd|th)/g, '$1'); // Remove ordinal suffixes
          parsedDueDate = new Date(dateStr);
          
          // If parsing failed, try alternative parsing
          if (isNaN(parsedDueDate.getTime())) {
            // Try parsing with date-fns or manual parsing for formats like "Saturday 15th November 2PM" or "15th dec"
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                              'july', 'august', 'september', 'october', 'november', 'december'];
            const monthAbbreviations = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            
            const lowerStr = dateStr.toLowerCase();
            let day: number | null = null;
            let month: number | null = null;
            let year = now.getFullYear(); // Default to current year
            let hour = 0;
            let minute = 0;
            
            // Extract day
            const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
            if (dayMatch) {
              day = parseInt(dayMatch[1]);
            }
            
            // Extract month name (full name) if present
            for (let i = 0; i < monthNames.length; i++) {
              if (lowerStr.includes(monthNames[i])) {
                month = i; // Already 0-indexed for JavaScript Date
                break;
              }
            }
            
            // If month not found, try month abbreviations
            if (month === null) {
              for (let i = 0; i < monthAbbreviations.length; i++) {
                // Use word boundary to match whole words only (e.g., "dec" not "december")
                const abbrevRegex = new RegExp(`\\b${monthAbbreviations[i]}\\b`);
                if (abbrevRegex.test(lowerStr)) {
                  month = i;
                  break;
                }
              }
            }
            
            // Extract time (2PM, 14:00, etc.)
            const timeMatch = lowerStr.match(/(\d{1,2})\s*(pm|am|:(\d{2}))/i);
            if (timeMatch) {
              hour = parseInt(timeMatch[1]);
              if (timeMatch[2] && timeMatch[2].toLowerCase() === 'pm' && hour !== 12) {
                hour += 12;
              } else if (timeMatch[2] && timeMatch[2].toLowerCase() === 'am' && hour === 12) {
                hour = 0;
              }
              if (timeMatch[3]) {
                minute = parseInt(timeMatch[3]);
              }
            }
            
            // If only day is provided (no month), use current month and year
            if (day !== null && month === null) {
              month = now.getMonth(); // Current month (0-indexed)
              parsedDueDate = new Date(year, month, day, hour, minute);
              
              // If the date is in the past, move to next month
              if (parsedDueDate < now) {
                parsedDueDate.setMonth(month + 1);
                // JavaScript automatically handles year rollover when month exceeds 11
              }
            } else if (day !== null && month !== null) {
              // Both day and month provided - defaults to current year
              parsedDueDate = new Date(year, month, day, hour, minute);
              // If the date is in the past, move to next year
              if (parsedDueDate < now) {
                parsedDueDate.setFullYear(year + 1);
              }
            } else {
              // Fallback to standard Date parsing
              parsedDueDate = new Date(dateStr);
              if (isNaN(parsedDueDate.getTime())) {
                parsedDueDate = null;
              }
            }
          }
      } catch (error) {
        console.error('Error parsing date:', error);
        parsedDueDate = null;
      }
    }
    }
  }

  const result = await query(
    `INSERT INTO tasks (user_number, title, description, due_date, status, original_message)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING *`,
    [userNumber, title, description || null, parsedDueDate, originalMessage || null]
  );

  return result.rows[0];
}

export async function getTasks(
  userNumber: string,
  filters?: { status?: string; limit?: number; dateRange?: string; offset?: number }
): Promise<{ tasks: Task[]; total: number }> {
  let queryText = 'SELECT * FROM tasks WHERE user_number = $1';
  let countQueryText = 'SELECT COUNT(*) as total FROM tasks WHERE user_number = $1';
  const params: any[] = [userNumber];
  const countParams: any[] = [userNumber];
  let paramIndex = 2;
  let countParamIndex = 2;

  if (filters?.status) {
    queryText += ` AND status = $${paramIndex}`;
    countQueryText += ` AND status = $${countParamIndex}`;
    params.push(filters.status);
    countParams.push(filters.status);
    paramIndex++;
    countParamIndex++;
  }

  // Apply date range filter if provided (filter by due_date for tasks)
  if (filters?.dateRange) {
    const dateRange = parseDateRange(filters.dateRange);
    if (dateRange.startDate && dateRange.endDate) {
      queryText += ` AND due_date >= $${paramIndex} AND due_date <= $${paramIndex + 1}`;
      countQueryText += ` AND due_date >= $${countParamIndex} AND due_date <= $${countParamIndex + 1}`;
      params.push(dateRange.startDate, dateRange.endDate);
      countParams.push(dateRange.startDate, dateRange.endDate);
      paramIndex += 2;
      countParamIndex += 2;
    }
  }

  // Sort by due_date ASC (NULLS LAST - tasks without due dates go to the end)
  queryText += ' ORDER BY due_date ASC NULLS LAST, created_at DESC';

  // Apply offset for pagination
  if (filters?.offset) {
    queryText += ` OFFSET $${paramIndex}`;
    params.push(filters.offset);
    paramIndex++;
  }

  // Default limit to 5 if not specified
  const limit = filters?.limit || 5;
  queryText += ` LIMIT $${paramIndex}`;
  params.push(limit);

  const [result, totalResult] = await Promise.all([
    query(queryText, params),
    query(countQueryText, countParams)
  ]);

  const total = parseInt(totalResult.rows[0]?.total || '0');

  return { tasks: result.rows, total };
}

export async function updateTask(
  taskId: number,
  updates: { title?: string; description?: string; dueDate?: Date | null; status?: string }
): Promise<Task> {
  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    updateFields.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }
  if (updates.description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }
  if (updates.dueDate !== undefined) {
    updateFields.push(`due_date = $${paramIndex++}`);
    params.push(updates.dueDate);
  }
  if (updates.status !== undefined) {
    updateFields.push(`status = $${paramIndex++}`);
    params.push(updates.status);
  }

  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(taskId);

  const result = await query(
    `UPDATE tasks 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Task with id ${taskId} not found`);
  }

  return result.rows[0];
}

// Order Operations
export interface OrderItem {
  productName: string;
  quantity: number;
}

export async function createOrder(
  userNumber: string,
  productName: string,
  quantity: number = 1,
  orderId?: string,
  fulfillmentDate?: string,
  originalMessage?: string,
  items?: OrderItem[] // Array of items for multiple products
): Promise<Order> {
  // Generate order ID if not provided
  const finalOrderId = orderId || `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // If items array is provided, use the first item's name and total quantity for the main order record
  // The individual items will be stored in order_items table
  const mainProductName = items && items.length > 0 
    ? items.map(item => `${item.productName} x${item.quantity}`).join(', ')
    : productName;
  const totalQuantity = items && items.length > 0
    ? items.reduce((sum, item) => sum + item.quantity, 0)
    : quantity;

  // Parse fulfillment date if provided (similar to task due date parsing)
  let parsedFulfillmentDate: Date | null = null;
  if (fulfillmentDate) {
    // First try the new date/time parser for relative dates with times
    parsedFulfillmentDate = parseDateTime(fulfillmentDate);
    
    // If the new parser didn't handle it, fall back to existing logic
    if (!parsedFulfillmentDate) {
      const now = new Date();
      const lowerDate = fulfillmentDate.toLowerCase().trim();
      
      if (lowerDate === 'tomorrow') {
        parsedFulfillmentDate = new Date(now);
        parsedFulfillmentDate.setDate(parsedFulfillmentDate.getDate() + 1);
      } else if (lowerDate.includes('next week')) {
        parsedFulfillmentDate = new Date(now);
        parsedFulfillmentDate.setDate(parsedFulfillmentDate.getDate() + 7);
      } else if (lowerDate.includes('next month')) {
        parsedFulfillmentDate = new Date(now);
        parsedFulfillmentDate.setMonth(parsedFulfillmentDate.getMonth() + 1);
      } else {
        // Check for day names like "Tuesday", "coming Wednesday", "this Friday", "next Monday"
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        let targetDayIndex: number | null = null;
        
        // Find which day name is mentioned
        for (let i = 0; i < dayNames.length; i++) {
          if (lowerDate.includes(dayNames[i])) {
            targetDayIndex = i;
            break;
          }
        }
        
        // If a day name is found, calculate the date
        if (targetDayIndex !== null) {
          const isNext = lowerDate.includes('next') || lowerDate.includes('coming');
          const isThis = lowerDate.includes('this');
          
          parsedFulfillmentDate = new Date(now);
          const currentDay = parsedFulfillmentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
          
          let daysToAdd = targetDayIndex - currentDay;
          
          if (isNext || lowerDate.includes('coming')) {
            // "next Tuesday" or "coming Wednesday" - find the next occurrence
            if (daysToAdd <= 0) {
              daysToAdd += 7; // Move to next week
            }
          } else if (isThis) {
            // "this Tuesday" - find current or next occurrence
            if (daysToAdd < 0) {
              daysToAdd += 7; // Move to next week
            }
          } else {
            // Just "Tuesday" - find the next occurrence (same as "next")
            if (daysToAdd <= 0) {
              daysToAdd += 7; // Move to next week
            }
          }
          
          parsedFulfillmentDate.setDate(parsedFulfillmentDate.getDate() + daysToAdd);
          // Reset time to start of day (fulfillment dates typically don't have times)
          parsedFulfillmentDate.setHours(0, 0, 0, 0);
        } else {
          // Try to parse dates like "15th November", "Saturday 15th November", or just "20th"
          try {
            const dateStr = fulfillmentDate.replace(/(\d+)(st|nd|rd|th)/g, '$1');
            parsedFulfillmentDate = new Date(dateStr);
            
            if (isNaN(parsedFulfillmentDate.getTime())) {
              // Try manual parsing for formats like "15th November", "15th dec", or just "20th"
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                'july', 'august', 'september', 'october', 'november', 'december'];
              const monthAbbreviations = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                         'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const lowerStr = dateStr.toLowerCase();
              let day: number | null = null;
              let month: number | null = null;
              let year = now.getFullYear(); // Default to current year
              
              // Extract day number
              const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
              if (dayMatch) {
                day = parseInt(dayMatch[1]);
              }
              
              // Extract month name (full name) if present
              for (let i = 0; i < monthNames.length; i++) {
                if (lowerStr.includes(monthNames[i])) {
                  month = i;
                  break;
                }
              }
              
              // If month not found, try month abbreviations
              if (month === null) {
                for (let i = 0; i < monthAbbreviations.length; i++) {
                  // Use word boundary to match whole words only (e.g., "dec" not "december")
                  const abbrevRegex = new RegExp(`\\b${monthAbbreviations[i]}\\b`);
                  if (abbrevRegex.test(lowerStr)) {
                    month = i;
                    break;
                  }
                }
              }
              
              // If only day is provided (no month), use current month and year
              if (day !== null && month === null) {
                month = now.getMonth(); // Current month (0-indexed)
                parsedFulfillmentDate = new Date(year, month, day);
                
                // If the date is in the past, move to next month
                if (parsedFulfillmentDate < now) {
                  parsedFulfillmentDate.setMonth(month + 1);
                  // JavaScript automatically handles year rollover when month exceeds 11
                }
              } else if (day !== null && month !== null) {
                // Both day and month provided - defaults to current year
                parsedFulfillmentDate = new Date(year, month, day);
                // If the date is in the past, move to next year
                if (parsedFulfillmentDate < now) {
                  parsedFulfillmentDate.setFullYear(year + 1);
                }
              } else {
                parsedFulfillmentDate = null;
              }
            }
          } catch (error) {
            console.error('Error parsing fulfillment date:', error);
            parsedFulfillmentDate = null;
          }
        }
      }
    }
  }

  // If no fulfillment date was provided or could not be parsed, set to current time + 5 hours
  if (!parsedFulfillmentDate) {
    const now = new Date();
    parsedFulfillmentDate = new Date(now.getTime() + 5 * 60 * 60 * 1000); // Add 5 hours (5 * 60 minutes * 60 seconds * 1000 milliseconds)
    console.log('No fulfillment date provided, setting to 5 hours from now:', parsedFulfillmentDate);
  }

  const result = await query(
    `INSERT INTO orders (user_number, order_id, product_name, quantity, status, fulfillment_date, original_message)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING *`,
    [userNumber, finalOrderId, mainProductName, totalQuantity, parsedFulfillmentDate, originalMessage || null]
  );

  const order = result.rows[0];

  // If items array is provided, create order_items records
  if (items && items.length > 0) {
    for (const item of items) {
      await query(
        `INSERT INTO order_items (order_id, product_name, quantity)
         VALUES ($1, $2, $3)`,
        [order.id, item.productName, item.quantity]
      );
    }
  } else {
    // If no items array, create a single order_item for backward compatibility
    await query(
      `INSERT INTO order_items (order_id, product_name, quantity)
       VALUES ($1, $2, $3)`,
      [order.id, productName, quantity]
    );
  }

  return order;
}

/**
 * Get order items for a specific order
 */
export async function getOrderItems(orderId: number): Promise<OrderItem[]> {
  try {
    const result = await query(
      'SELECT product_name, quantity FROM order_items WHERE order_id = $1 ORDER BY id',
      [orderId]
    );
    return result.rows.map(row => ({
      productName: row.product_name,
      quantity: row.quantity
    }));
  } catch (error) {
    console.error('Error getting order items:', error);
    return [];
  }
}

/**
 * Get a single order by order ID
 * Also tries to find the original message with media information
 */
export async function getOrderByOrderId(
  userNumber: string,
  orderId: string
): Promise<Order & { mediaInfo?: { url?: string; type?: string; extractedText?: string }; items?: OrderItem[] } | null> {
  try {
    const result = await query(
      'SELECT * FROM orders WHERE user_number = $1 AND order_id = $2',
      [userNumber, orderId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const order = result.rows[0];
    
    // Get order items
    const orderItems = await getOrderItems(order.id);
    if (orderItems.length > 0) {
      order.items = orderItems;
    }
    
    // Try to find the original message with media information
    if (order.original_message) {
      try {
        const messageResult = await query(
          `SELECT media_url, media_type, extracted_text 
           FROM messages 
           WHERE from_number = $1 
           AND body = $2 
           AND media_url IS NOT NULL
           ORDER BY created_at DESC 
           LIMIT 1`,
          [userNumber, order.original_message]
        );
        
        if (messageResult.rows.length > 0) {
          return {
            ...order,
            mediaInfo: {
              url: messageResult.rows[0].media_url,
              type: messageResult.rows[0].media_type,
              extractedText: messageResult.rows[0].extracted_text,
            },
          };
        }
      } catch (mediaError) {
        console.error('Error fetching media info for order:', mediaError);
        // Continue without media info
      }
    }
    
    return order;
  } catch (error) {
    console.error('Error getting order by order ID:', error);
    return null;
  }
}

/**
 * Get orders with their items for summary generation
 */
export async function getOrdersWithItemsForSummary(
  userNumber: string,
  dateRange?: string
): Promise<Array<Order & { items: OrderItem[] }>> {
  // Explicitly select all columns including fulfillment_date
  let queryText = 'SELECT id, user_number, order_id, product_name, quantity, status, fulfillment_date, original_message, created_at, updated_at FROM orders WHERE user_number = $1';
  const params: any[] = [userNumber];
  let paramIndex = 2;

  // Apply date range filter if provided (filter by fulfillment_date for orders)
  if (dateRange) {
    const dateRangeObj = parseDateRange(dateRange);
    if (dateRangeObj.startDate && dateRangeObj.endDate) {
      queryText += ` AND fulfillment_date >= $${paramIndex} AND fulfillment_date <= $${paramIndex + 1}`;
      params.push(dateRangeObj.startDate, dateRangeObj.endDate);
      paramIndex += 2;
    }
  }

  // Sort by fulfillment_date ASC
  queryText += ' ORDER BY fulfillment_date ASC NULLS LAST, created_at DESC';

  // No limit for summaries - we want all orders in the date range
  const result = await query(queryText, params);

  // Get items for each order
  const ordersWithItems = await Promise.all(
    result.rows.map(async (order) => {
      const items = await getOrderItems(order.id);
      return {
        ...order,
        items: items.length > 0 ? items : [{ productName: order.product_name, quantity: order.quantity }]
      };
    })
  );

  return ordersWithItems;
}

export async function getOrders(
  userNumber: string,
  filters?: { status?: string; limit?: number; dateRange?: string; offset?: number }
): Promise<{ orders: Order[]; total: number }> {
  // Explicitly select all columns including fulfillment_date to ensure it's included
  let queryText = 'SELECT id, user_number, order_id, product_name, quantity, status, fulfillment_date, original_message, created_at, updated_at FROM orders WHERE user_number = $1';
  const params: any[] = [userNumber];
  let paramIndex = 2;

  if (filters?.status) {
    queryText += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  // Apply date range filter if provided (filter by fulfillment_date for orders)
  if (filters?.dateRange) {
    const dateRange = parseDateRange(filters.dateRange);
    if (dateRange.startDate && dateRange.endDate) {
      queryText += ` AND fulfillment_date >= $${paramIndex} AND fulfillment_date <= $${paramIndex + 1}`;
      params.push(dateRange.startDate, dateRange.endDate);
      paramIndex += 2;
    }
  }

  // Sort by fulfillment_date ASC (NULLS LAST - orders without fulfillment dates go to the end)
  queryText += ' ORDER BY fulfillment_date ASC NULLS LAST, created_at DESC';

  // Apply offset for pagination
  if (filters?.offset) {
    queryText += ` OFFSET $${paramIndex}`;
    params.push(filters.offset);
    paramIndex++;
  }

  // Default limit to 5 if not specified
  const limit = filters?.limit || 5;
  queryText += ` LIMIT $${paramIndex}`;
  params.push(limit);

  // Get total count with same filters
  let countQueryText = 'SELECT COUNT(*) as total FROM orders WHERE user_number = $1';
  const countParams: any[] = [userNumber];
  let countParamIndex = 2;

  if (filters?.status) {
    countQueryText += ` AND status = $${countParamIndex}`;
    countParams.push(filters.status);
    countParamIndex++;
  }

  if (filters?.dateRange) {
    const dateRange = parseDateRange(filters.dateRange);
    if (dateRange.startDate && dateRange.endDate) {
      countQueryText += ` AND fulfillment_date >= $${countParamIndex} AND fulfillment_date <= $${countParamIndex + 1}`;
      countParams.push(dateRange.startDate, dateRange.endDate);
      countParamIndex += 2;
    }
  }

  const [result, totalResult] = await Promise.all([
    query(queryText, params),
    query(countQueryText, countParams)
  ]);

  const total = parseInt(totalResult.rows[0]?.total || '0');

  return { orders: result.rows, total };
}

export async function updateOrder(
  orderId: string,
  updates: { productName?: string; quantity?: number; status?: string }
): Promise<Order> {
  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.productName !== undefined) {
    updateFields.push(`product_name = $${paramIndex++}`);
    params.push(updates.productName);
  }
  if (updates.quantity !== undefined) {
    updateFields.push(`quantity = $${paramIndex++}`);
    params.push(updates.quantity);
  }
  if (updates.status !== undefined) {
    updateFields.push(`status = $${paramIndex++}`);
    params.push(updates.status);
  }

  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(orderId);

  const result = await query(
    `UPDATE orders 
     SET ${updateFields.join(', ')}
     WHERE order_id = $${paramIndex}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Order with id ${orderId} not found`);
  }

  return result.rows[0];
}

/**
 * Bulk update tasks based on filters
 * @param userNumber - User's phone number
 * @param updates - Fields to update
 * @param filters - Filters to apply (status, dateRange)
 * @returns Array of updated tasks and count
 */
export async function bulkUpdateTasks(
  userNumber: string,
  updates: { title?: string; description?: string; dueDate?: Date | null; status?: string },
  filters?: { status?: string; dateRange?: string }
): Promise<{ tasks: Task[]; count: number }> {
  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    updateFields.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }
  if (updates.description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }
  if (updates.dueDate !== undefined) {
    updateFields.push(`due_date = $${paramIndex++}`);
    params.push(updates.dueDate);
  }
  if (updates.status !== undefined) {
    updateFields.push(`status = $${paramIndex++}`);
    params.push(updates.status);
  }

  if (updateFields.length === 0) {
    return { tasks: [], count: 0 };
  }

  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

  // Build WHERE clause
  let whereClause = 'WHERE user_number = $' + paramIndex++;
  params.push(userNumber);

  // Add status filter
  if (filters?.status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }

  // Add date range filter (filter by due_date for tasks)
  if (filters?.dateRange) {
    const dateRange = parseDateRange(filters.dateRange);
    if (dateRange.startDate && dateRange.endDate) {
      const startParam = paramIndex++;
      const endParam = paramIndex++;
      whereClause += ` AND due_date >= $${startParam}::timestamp AND due_date <= $${endParam}::timestamp`;
      params.push(dateRange.startDate, dateRange.endDate);
    }
  }

  const result = await query(
    `UPDATE tasks 
     SET ${updateFields.join(', ')}
     ${whereClause}
     RETURNING *`,
    params
  );

  return { tasks: result.rows, count: result.rows.length };
}

/**
 * Bulk update orders based on filters
 * @param userNumber - User's phone number
 * @param updates - Fields to update
 * @param filters - Filters to apply (status, dateRange)
 * @returns Array of updated orders and count
 */
export async function bulkUpdateOrders(
  userNumber: string,
  updates: { productName?: string; quantity?: number; status?: string },
  filters?: { status?: string; dateRange?: string }
): Promise<{ orders: Order[]; count: number }> {
  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.productName !== undefined) {
    updateFields.push(`product_name = $${paramIndex++}`);
    params.push(updates.productName);
  }
  if (updates.quantity !== undefined) {
    updateFields.push(`quantity = $${paramIndex++}`);
    params.push(updates.quantity);
  }
  if (updates.status !== undefined) {
    updateFields.push(`status = $${paramIndex++}`);
    params.push(updates.status);
  }

  if (updateFields.length === 0) {
    return { orders: [], count: 0 };
  }

  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

  // Build WHERE clause
  let whereClause = 'WHERE user_number = $' + paramIndex++;
  params.push(userNumber);

  // Add status filter
  if (filters?.status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }

  // Add date range filter (filter by fulfillment_date for orders)
  if (filters?.dateRange) {
    const dateRange = parseDateRange(filters.dateRange);
    if (dateRange.startDate && dateRange.endDate) {
      const startParam = paramIndex++;
      const endParam = paramIndex++;
      whereClause += ` AND fulfillment_date >= $${startParam}::timestamp AND fulfillment_date <= $${endParam}::timestamp`;
      params.push(dateRange.startDate, dateRange.endDate);
    }
  }

  const result = await query(
    `UPDATE orders 
     SET ${updateFields.join(', ')}
     ${whereClause}
     RETURNING *`,
    params
  );

  return { orders: result.rows, count: result.rows.length };
}

