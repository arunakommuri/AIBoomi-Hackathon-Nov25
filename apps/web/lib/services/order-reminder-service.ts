import { query } from '@/lib/db';
import { Order, OrderItem } from '@/lib/crud';
import { sendWhatsAppMessage } from '@/lib/twilio';
import { MessageService } from './message-service';
import { formatDate } from '@/lib/response-formatter';

/**
 * Get all pending orders grouped by user number
 * Only includes orders that need to be fulfilled today (fulfillment_date is today)
 */
export async function getAllPendingOrdersByUser(): Promise<Map<string, Array<Order & { items: OrderItem[] }>>> {
  try {
    // Get pending orders that need to be fulfilled today
    // DATE(fulfillment_date) = CURRENT_DATE compares only the date part, ignoring time
    const result = await query(
      `SELECT DISTINCT o.id, o.user_number, o.order_id, o.product_name, o.quantity, 
              o.status, o.fulfillment_date, o.original_message, o.created_at, o.updated_at
       FROM orders o
       WHERE o.status = 'pending'
         AND o.fulfillment_date IS NOT NULL
         AND DATE(o.fulfillment_date) = CURRENT_DATE
       ORDER BY o.user_number, o.fulfillment_date ASC NULLS LAST, o.created_at DESC`
    );

    const ordersByUser = new Map<string, Array<Order & { items: OrderItem[] }>>();

    // Process each order and get its items
    for (const orderRow of result.rows) {
      const userNumber = orderRow.user_number;
      
      // Get order items
      const itemsResult = await query(
        'SELECT product_name, quantity FROM order_items WHERE order_id = $1 ORDER BY id',
        [orderRow.id]
      );
      
      const items: OrderItem[] = itemsResult.rows.map((row: { product_name: string; quantity: number }) => ({
        productName: row.product_name,
        quantity: row.quantity
      }));

      const order: Order & { items: OrderItem[] } = {
        ...orderRow,
        items: items.length > 0 ? items : [{ productName: orderRow.product_name, quantity: orderRow.quantity }]
      };

      if (!ordersByUser.has(userNumber)) {
        ordersByUser.set(userNumber, []);
      }
      ordersByUser.get(userNumber)!.push(order);
    }

    return ordersByUser;
  } catch (error) {
    console.error('Error fetching pending orders by user:', error);
    throw error;
  }
}

/**
 * Format a reminder message for pending orders (reply-friendly format matching order lists)
 */
export function formatPendingOrderReminder(orders: Array<Order & { items: OrderItem[] }>): string {
  if (orders.length === 0) {
    return '';
  }

  // Format similar to formatOrderResponse for consistency
  let message = `⏰ Reminder: You have ${orders.length} pending order${orders.length > 1 ? 's' : ''} due today:\n\n`;
  
  orders.forEach((order, index) => {
    const fulfillmentDate = order.fulfillment_date
      ? formatDate(order.fulfillment_date)
      : 'No date set';
    
    const itemNumber = index + 1;
    const statusEmoji = '⏳'; // Pending status
    
    // Format matching order list format for reply compatibility
    message += `${itemNumber}. 📅 ${fulfillmentDate}\n`;
    message += `   📦 ${order.product_name} x${order.quantity} | ${statusEmoji} ${order.status}\n`;
    message += `   🆔 ${order.order_id || order.id}\n`;
    
    if (index < orders.length - 1) {
      message += '\n';
    }
  });

  message += `\n\n💬 Reply with order number(s) to update (e.g., "1", "1 2", or "1,2,3")`;

  return message.trim();
}


/**
 * Send pending order reminders to all users
 */
export async function sendPendingOrderReminders(): Promise<{ successCount: number; errorCount: number; errors: Array<{ userNumber: string; error: string }> }> {
  try {
    const ordersByUser = await getAllPendingOrdersByUser();
    
    // Check if there are any orders due today
    if (ordersByUser.size === 0) {
      console.log('ℹ️  No pending orders due today. No reminders to send.');
      return { successCount: 0, errorCount: 0, errors: [] };
    }
    
    console.log(`📋 Found ${ordersByUser.size} user(s) with pending orders due today`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ userNumber: string; error: string }> = [];

    // Send reminders to each user
    // Convert Map to Array to avoid iteration issues
    const userEntries = Array.from(ordersByUser.entries());
    for (const [userNumber, orders] of userEntries) {
      try {
        const reminderMessage = formatPendingOrderReminder(orders);
        
        if (reminderMessage) {
          // Send the reminder message
          const twilioResult = await sendWhatsAppMessage(userNumber, reminderMessage);
          
          // Store the message in database for reply context
          // Note: from_number should be the Twilio number (sender), but we store it as the user's number
          // so replies can reference it. The actual sender is Twilio, but we track it as if sent to the user.
          if (twilioResult.sid) {
            // Get Twilio FROM number for proper message storage
            const twilioFrom = process.env.TWILIO_WHATSAPP_FROM || userNumber;
            await MessageService.storeMessage(
              twilioResult.sid,
              twilioFrom, // Sender is Twilio number
              reminderMessage,
              null // No referred message for reminders
            );
          }
          
          // Store context for replies (similar to order lists)
          const orderIds = orders.map(o => o.order_id || o.id.toString());
          const orderMappings: Record<string, string> = {};
          orders.forEach((order, index) => {
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
          
          successCount++;
          console.log(`✅ Sent reminder to ${userNumber} for ${orders.length} pending order(s) with reply context`);
        }
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ userNumber, error: errorMessage });
        console.error(`❌ Failed to send reminder to ${userNumber}:`, error);
      }
    }

    return { successCount, errorCount, errors };
  } catch (error) {
    console.error('Error in sendPendingOrderReminders:', error);
    throw error;
  }
}

