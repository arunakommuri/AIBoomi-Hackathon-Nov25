import { query } from '@/lib/db';
import { createTask, createOrder, getOrders } from '@/lib/crud';
import { formatCreateTaskResponse, formatCreateOrderResponse } from '@/lib/response-formatter';
import { parseDateTime } from '@/lib/date-utils';
import { formatDate } from '@/lib/response-formatter';

export async function handleCreate(
  userNumber: string,
  analysis: any,
  body?: string
): Promise<string> {
  if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
    try {
      const task = await createTask(
        userNumber,
        analysis.parameters.title || 'Untitled Task',
        analysis.parameters.description,
        analysis.parameters.dueDate,
        body || ''
      );
      return formatCreateTaskResponse(task);
    } catch (error) {
      console.error('Error creating task:', error);
      return "I'm sorry, I couldn't create that task. Please try again.";
    }
  } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
    try {
      // Check if multiple items are provided
      const items = analysis.parameters.items;
      const hasMultipleItems = items && Array.isArray(items) && items.length > 0;
      
      // For single item, use productName and quantity
      // For multiple items, use items array
      const productName = hasMultipleItems 
        ? items.map((item: any) => `${item.productName || 'Unknown'} x${item.quantity || 1}`).join(', ')
        : (analysis.parameters.productName || 'Unknown Product');
      const quantity = hasMultipleItems
        ? items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0)
        : (analysis.parameters.quantity || 1);
      const fulfillmentDate = analysis.parameters.fulfillmentDate;
      
      if (fulfillmentDate) {
        const parsedFulfillmentDate = parseDateTime(fulfillmentDate);
        
        if (parsedFulfillmentDate) {
          // Get all pending orders for this user
          const existingOrders = await getOrders(userNumber, { status: 'pending', limit: 100 });
          
          // Check for similar orders (same product, quantity, and fulfillment date)
          const similarOrders = existingOrders.orders.filter(order => {
            if (order.product_name.toLowerCase() !== productName.toLowerCase() || 
                order.quantity !== quantity) {
              return false;
            }
            
            if (!order.fulfillment_date) {
              return false;
            }
            
            const orderDate = typeof order.fulfillment_date === 'string' 
              ? new Date(order.fulfillment_date) 
              : order.fulfillment_date;
            
            // Check if dates are the same (within 1 minute tolerance)
            const timeDiff = Math.abs(orderDate.getTime() - parsedFulfillmentDate.getTime());
            return timeDiff < 60000; // 1 minute
          });
          
          if (similarOrders.length > 0) {
            // Found similar orders - ask user to confirm
            try {
              await query(
                `INSERT INTO pending_confirmations (user_number, order_id, updates, original_message, expires_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
                 ON CONFLICT (user_number) DO UPDATE SET 
                   order_id = $2, updates = $3, original_message = $4, expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'`,
                [
                  userNumber,
                  similarOrders[0].order_id,
                  JSON.stringify({
                    productName,
                    quantity,
                    fulfillmentDate: fulfillmentDate, // Store original string, not parsed Date
                    action: 'create_duplicate'
                  }),
                  body || ''
                ]
              );
              
              return `I found a similar pending order: ${similarOrders[0].product_name} x${similarOrders[0].quantity} for ${formatDate(similarOrders[0].fulfillment_date)}. Is this a new order or an update to the existing one? Reply "new" for a new order or "update" to modify the existing one.`;
            } catch (confirmationError) {
              console.error('Error storing confirmation, proceeding with order creation:', confirmationError);
              // If confirmation storage fails, proceed to create the order anyway
              // This ensures the order is created even if confirmation system has issues
            }
          }
        }
      }
      
      // Create new order with unique orderId (not fulfillmentDate)
      // fulfillmentDate should be passed as string, not Date object
      const order = await createOrder(
        userNumber,
        productName,
        quantity,
        undefined, // orderId - will be auto-generated (ensures uniqueness)
        fulfillmentDate, // fulfillmentDate as string in correct position
        body || '', // originalMessage
        hasMultipleItems ? items : undefined // items array if multiple items
      );
      return formatCreateOrderResponse(order, hasMultipleItems ? items : undefined);
    } catch (error) {
      console.error('Error creating order:', error);
      return "I'm sorry, I couldn't create that order. Please try again.";
    }
  } else {
    return "I can help you create tasks or orders. What would you like to create?";
  }
}

