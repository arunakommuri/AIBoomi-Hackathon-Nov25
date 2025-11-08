import { query } from '@/lib/db';
import { getTasks, getOrders } from '@/lib/crud';
import { formatTaskResponse, formatOrderResponse } from '@/lib/response-formatter';

export async function handleGet(
  userNumber: string,
  analysis: any,
  body?: string
): Promise<string> {
  if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
    try {
      const filters: { dateRange?: string; limit?: number } = { limit: 5 };
      if (analysis.parameters.dateRange) {
        filters.dateRange = analysis.parameters.dateRange;
      }
      const result = await getTasks(userNumber, filters);
      
      // Store pagination state if there are more tasks
      if (result.total > result.tasks.length) {
        await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'task']);
        await query(
          `INSERT INTO pagination_state (user_number, entity_type, offset_count, total_count, filters)
           VALUES ($1, $2, $3, $4, $5)`,
          [userNumber, 'task', 0, result.total, JSON.stringify(filters)]
        );
      } else {
        await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'task']);
      }
      
      const responseMessage = formatTaskResponse(result.tasks, result.total, 0);
      
      // Store context for replies with task mappings
      const taskIds = result.tasks.map(t => t.id);
      const taskMappings: Record<string, number> = {};
      result.tasks.forEach((task, index) => {
        const prefixNumber = (index + 1).toString();
        taskMappings[prefixNumber] = task.id;
      });
      
      await query(
        `INSERT INTO user_message_context (user_number, entity_type, task_ids, task_mappings)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_number) 
         DO UPDATE SET entity_type = $2, task_ids = $3, task_mappings = $4, created_at = CURRENT_TIMESTAMP`,
        [userNumber, 'task', taskIds, JSON.stringify(taskMappings)]
      );
      
      return responseMessage;
    } catch (error) {
      console.error('Error getting tasks:', error);
      return "I'm sorry, I couldn't retrieve your tasks. Please try again.";
    }
  } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
    try {
      const filters: { dateRange?: string; limit?: number } = { limit: 5 };
      if (analysis.parameters.dateRange) {
        filters.dateRange = analysis.parameters.dateRange;
      }
      const result = await getOrders(userNumber, filters);
      
      // Store pagination state if there are more orders
      if (result.total > result.orders.length) {
        await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'order']);
        await query(
          `INSERT INTO pagination_state (user_number, entity_type, offset_count, total_count, filters)
           VALUES ($1, $2, $3, $4, $5)`,
          [userNumber, 'order', 0, result.total, JSON.stringify(filters)]
        );
      } else {
        await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'order']);
      }
      
      const responseMessage = formatOrderResponse(result.orders, result.total, 0);
      
      // Store context for replies with order mappings
      const orderIds = result.orders.map(o => o.order_id || o.id.toString());
      const orderMappings: Record<string, string> = {};
      result.orders.forEach((order, index) => {
        const prefixNumber = (index + 1).toString();
        orderMappings[prefixNumber] = order.order_id || order.id.toString();
      });
      
      await query(
        `INSERT INTO user_message_context (user_number, entity_type, order_ids, order_mappings)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_number) 
         DO UPDATE SET entity_type = $2, order_ids = $3, order_mappings = $4, created_at = CURRENT_TIMESTAMP`,
        [userNumber, 'order', orderIds, JSON.stringify(orderMappings)]
      );
      
      return responseMessage;
    } catch (error) {
      console.error('Error getting orders:', error);
      return "I'm sorry, I couldn't retrieve your orders. Please try again.";
    }
  } else {
    return "I can show you your tasks or orders. What would you like to see?";
  }
}

