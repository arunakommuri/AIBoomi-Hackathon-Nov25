import { query } from '@/lib/db';
import { getTasks, getOrders, getOrderByOrderId } from '@/lib/crud';
import { formatTaskResponse, formatOrderResponse, formatOrderDetailsResponse } from '@/lib/response-formatter';
import { parseOrderNumberFromMessage, parseOrderMappingsFromMessage } from './utils';

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
      // Check if user is asking for details of a specific order
      const orderId = analysis.parameters.orderId;
      if (orderId) {
        // User specified an order ID - get that specific order
        const order = await getOrderByOrderId(userNumber, orderId);
        if (order) {
          return formatOrderDetailsResponse(order);
        } else {
          return `I couldn't find order ${orderId}. Please check the order ID and try again.`;
        }
      }
      
      // Check if user is asking for details using a number reference (e.g., "order 1", "details of order 2")
      // This could be from a previous list context
      // First get all orders to determine max number
      const allOrdersForNumber = await getOrders(userNumber, { limit: 100 });
      const orderNumber = parseOrderNumberFromMessage(body || '', allOrdersForNumber.orders.length);
      if (orderNumber) {
        // Try to find order from context mappings
        const contextResult = await query(
          'SELECT order_mappings FROM user_message_context WHERE user_number = $1',
          [userNumber]
        );
        
        if (contextResult.rows.length > 0 && contextResult.rows[0].order_mappings) {
          const orderMappings = contextResult.rows[0].order_mappings;
          const mappedOrderId = orderMappings[orderNumber];
          
          if (mappedOrderId) {
            const order = await getOrderByOrderId(userNumber, mappedOrderId);
            if (order) {
              return formatOrderDetailsResponse(order);
            }
          }
        }
        
        // If not found in mappings, try to get from recent orders list
        const allOrders = await getOrders(userNumber, { limit: 100 });
        if (allOrders.orders.length >= parseInt(orderNumber)) {
          const order = allOrders.orders[parseInt(orderNumber) - 1];
          if (order) {
            return formatOrderDetailsResponse(order);
          }
        }
        
        return `I couldn't find order ${orderNumber}. Please specify the order ID (e.g., "ORD-123") or say "show my orders" first.`;
      }
      
      // No specific order requested - show list of orders
      const filters: { status?: string; dateRange?: string; limit?: number } = { limit: 5 };
      
      // Extract status filter (e.g., "pending orders", "completed orders")
      if (analysis.parameters.status) {
        const status = analysis.parameters.status.toLowerCase();
        // Validate status values
        const validStatuses = ['pending', 'completed', 'processing', 'cancelled'];
        if (validStatuses.includes(status)) {
          filters.status = status;
        }
      }
      
      // Extract date range filter (e.g., "orders today", "orders this week")
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
      
      const responseMessage = formatOrderResponse(result.orders, result.total, 0, filters);
      
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

