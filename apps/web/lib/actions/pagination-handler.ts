import { query } from '@/lib/db';
import { getTasks, getOrders } from '@/lib/crud';
import { formatTaskResponse, formatOrderResponse } from '@/lib/response-formatter';

export async function handlePagination(
  userNumber: string,
  messageBody: string
): Promise<string | null> {
  const isNext = messageBody === 'next' || messageBody === 'more' || messageBody.startsWith('next');
  
  if (!isNext) {
    return null;
  }

  const paginationResult = await query(
    `SELECT * FROM pagination_state 
     WHERE user_number = $1 
     AND expires_at > CURRENT_TIMESTAMP 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [userNumber]
  );

  if (paginationResult.rows.length === 0) {
    return "No more items to show. Please request your tasks or orders again.";
  }

  const pagination = paginationResult.rows[0];
  const entityType = pagination.entity_type;
  const currentOffset = pagination.offset_count || 0;
  const filters = typeof pagination.filters === 'string' 
    ? JSON.parse(pagination.filters) 
    : (pagination.filters || {});
  const newOffset = currentOffset + 5;

  if (entityType === 'task') {
    return await handleTaskPagination(userNumber, filters, newOffset, pagination.id);
  } else if (entityType === 'order') {
    return await handleOrderPagination(userNumber, filters, newOffset, pagination.id);
  } else {
    await query('DELETE FROM pagination_state WHERE id = $1', [pagination.id]);
    return "No pagination state found. Please request your tasks or orders again.";
  }
}

async function handleTaskPagination(
  userNumber: string,
  filters: any,
  newOffset: number,
  paginationId: number
): Promise<string> {
  try {
    const result = await getTasks(userNumber, {
      ...filters,
      offset: newOffset,
      limit: 5,
    });
    
    if (result.tasks.length > 0) {
      const responseMessage = formatTaskResponse(result.tasks, result.total, newOffset);
      
      // Store context for replies
      const taskIds = result.tasks.map(t => t.id);
      const taskMappings: Record<string, number> = {};
      result.tasks.forEach((task, index) => {
        const prefixNumber = (newOffset + index + 1).toString();
        taskMappings[prefixNumber] = task.id;
      });
      
      await query(
        `INSERT INTO user_message_context (user_number, entity_type, task_ids, task_mappings)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_number) 
         DO UPDATE SET entity_type = $2, task_ids = $3, task_mappings = $4, created_at = CURRENT_TIMESTAMP`,
        [userNumber, 'task', taskIds, JSON.stringify(taskMappings)]
      );
      
      // Update pagination state if there are more tasks
      if (result.total > newOffset + result.tasks.length) {
        await query(
          `UPDATE pagination_state 
           SET offset_count = $1, expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
           WHERE id = $2`,
          [newOffset, paginationId]
        );
      } else {
        await query('DELETE FROM pagination_state WHERE id = $1', [paginationId]);
      }
      
      return responseMessage;
    } else {
      await query('DELETE FROM pagination_state WHERE id = $1', [paginationId]);
      return "No more tasks to show.";
    }
  } catch (error) {
    console.error('Error getting next tasks:', error);
    return "I'm sorry, I couldn't retrieve the next tasks. Please try again.";
  }
}

async function handleOrderPagination(
  userNumber: string,
  filters: any,
  newOffset: number,
  paginationId: number
): Promise<string> {
  try {
    const result = await getOrders(userNumber, {
      ...filters,
      offset: newOffset,
      limit: 5,
    });
    
    if (result.orders.length > 0) {
      const responseMessage = formatOrderResponse(result.orders, result.total, newOffset);
      
      // Store context for replies
      const orderIds = result.orders.map(o => o.order_id || o.id.toString());
      const orderMappings: Record<string, string> = {};
      result.orders.forEach((order, index) => {
        const prefixNumber = (newOffset + index + 1).toString();
        orderMappings[prefixNumber] = order.order_id || order.id.toString();
      });
      
      await query(
        `INSERT INTO user_message_context (user_number, entity_type, order_ids, order_mappings)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_number) 
         DO UPDATE SET entity_type = $2, order_ids = $3, order_mappings = $4, created_at = CURRENT_TIMESTAMP`,
        [userNumber, 'order', orderIds, JSON.stringify(orderMappings)]
      );
      
      // Update pagination state if there are more orders
      if (result.total > newOffset + result.orders.length) {
        await query(
          `UPDATE pagination_state 
           SET offset_count = $1, expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
           WHERE id = $2`,
          [newOffset, paginationId]
        );
      } else {
        await query('DELETE FROM pagination_state WHERE id = $1', [paginationId]);
      }
      
      return responseMessage;
    } else {
      await query('DELETE FROM pagination_state WHERE id = $1', [paginationId]);
      return "No more orders to show.";
    }
  } catch (error) {
    console.error('Error getting next orders:', error);
    return "I'm sorry, I couldn't retrieve the next orders. Please try again.";
  }
}

