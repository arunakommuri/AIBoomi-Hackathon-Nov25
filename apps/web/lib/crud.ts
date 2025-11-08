import { query } from './db';
import { parseDateRange, DateRange } from './date-utils';

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
      // Try to parse dates like "Saturday 15th November 2PM" or "15th November"
      try {
        // Handle dates with day names and ordinal numbers (e.g., "Saturday 15th November")
        const dateStr = dueDate.replace(/(\d+)(st|nd|rd|th)/g, '$1'); // Remove ordinal suffixes
        parsedDueDate = new Date(dateStr);
        
        // If parsing failed, try alternative parsing
        if (isNaN(parsedDueDate.getTime())) {
          // Try parsing with date-fns or manual parsing for formats like "Saturday 15th November 2PM"
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                            'july', 'august', 'september', 'october', 'november', 'december'];
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          
          const lowerStr = dateStr.toLowerCase();
          let day: number | null = null;
          let month: number | null = null;
          let year = now.getFullYear();
          let hour = 0;
          let minute = 0;
          
          // Extract day
          const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
          if (dayMatch) {
            day = parseInt(dayMatch[1]);
          }
          
          // Extract month (JavaScript months are 0-indexed)
          for (let i = 0; i < monthNames.length; i++) {
            if (lowerStr.includes(monthNames[i])) {
              month = i; // Already 0-indexed for JavaScript Date
              break;
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
          
          // If we have day and month, create the date
          if (day !== null && month !== null) {
            parsedDueDate = new Date(year, month, day, hour, minute);
            // If the date is in the past, assume next year
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
export async function createOrder(
  userNumber: string,
  productName: string,
  quantity: number = 1,
  orderId?: string,
  fulfillmentDate?: string,
  originalMessage?: string
): Promise<Order> {
  // Generate order ID if not provided
  const finalOrderId = orderId || `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Parse fulfillment date if provided (similar to task due date parsing)
  let parsedFulfillmentDate: Date | null = null;
  if (fulfillmentDate) {
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
      // Try to parse dates like "15th November" or "Saturday 15th November"
      try {
        const dateStr = fulfillmentDate.replace(/(\d+)(st|nd|rd|th)/g, '$1');
        parsedFulfillmentDate = new Date(dateStr);
        
        if (isNaN(parsedFulfillmentDate.getTime())) {
          // Try manual parsing for formats like "15th November"
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                            'july', 'august', 'september', 'october', 'november', 'december'];
          const lowerStr = dateStr.toLowerCase();
          let day: number | null = null;
          let month: number | null = null;
          let year = now.getFullYear();
          
          const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
          if (dayMatch) {
            day = parseInt(dayMatch[1]);
          }
          
          for (let i = 0; i < monthNames.length; i++) {
            if (lowerStr.includes(monthNames[i])) {
              month = i;
              break;
            }
          }
          
          if (day !== null && month !== null) {
            parsedFulfillmentDate = new Date(year, month, day);
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

  const result = await query(
    `INSERT INTO orders (user_number, order_id, product_name, quantity, status, fulfillment_date, original_message)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING *`,
    [userNumber, finalOrderId, productName, quantity, parsedFulfillmentDate, originalMessage || null]
  );

  return result.rows[0];
}

export async function getOrders(
  userNumber: string,
  filters?: { status?: string; limit?: number; dateRange?: string; offset?: number }
): Promise<{ orders: Order[]; total: number }> {
  let queryText = 'SELECT * FROM orders WHERE user_number = $1';
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

