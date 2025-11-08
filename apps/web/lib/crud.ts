import { query } from './db';

export interface Task {
  id: number;
  user_number: string;
  title: string;
  description: string | null;
  due_date: Date | null;
  status: string;
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
  created_at: Date;
  updated_at: Date;
}

// Task Operations
export async function createTask(
  userNumber: string,
  title: string,
  description?: string,
  dueDate?: string
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
    `INSERT INTO tasks (user_number, title, description, due_date, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [userNumber, title, description || null, parsedDueDate]
  );

  return result.rows[0];
}

export async function getTasks(
  userNumber: string,
  filters?: { status?: string; limit?: number }
): Promise<Task[]> {
  let queryText = 'SELECT * FROM tasks WHERE user_number = $1';
  const params: any[] = [userNumber];

  if (filters?.status) {
    queryText += ' AND status = $2';
    params.push(filters.status);
  }

  queryText += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    queryText += ` LIMIT $${params.length + 1}`;
    params.push(filters.limit);
  }

  const result = await query(queryText, params);
  return result.rows;
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
  orderId?: string
): Promise<Order> {
  // Generate order ID if not provided
  const finalOrderId = orderId || `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const result = await query(
    `INSERT INTO orders (user_number, order_id, product_name, quantity, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [userNumber, finalOrderId, productName, quantity]
  );

  return result.rows[0];
}

export async function getOrders(
  userNumber: string,
  filters?: { status?: string; limit?: number }
): Promise<Order[]> {
  let queryText = 'SELECT * FROM orders WHERE user_number = $1';
  const params: any[] = [userNumber];

  if (filters?.status) {
    queryText += ' AND status = $2';
    params.push(filters.status);
  }

  queryText += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    queryText += ` LIMIT $${params.length + 1}`;
    params.push(filters.limit);
  }

  const result = await query(queryText, params);
  return result.rows;
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

