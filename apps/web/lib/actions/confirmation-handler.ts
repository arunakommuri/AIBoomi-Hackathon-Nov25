import { query } from '@/lib/db';
import { updateTask, createOrder, updateOrder } from '@/lib/crud';
import { formatUpdateTaskResponse, formatCreateOrderResponse, formatUpdateOrderResponse } from '@/lib/response-formatter';

export async function handleConfirmation(
  userNumber: string,
  messageBody: string
): Promise<string | null> {
  const confirmationResult = await query(
    `SELECT * FROM pending_confirmations 
     WHERE user_number = $1 
     AND expires_at > CURRENT_TIMESTAMP 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [userNumber]
  );

  if (confirmationResult.rows.length === 0) {
    return null;
  }

  const pending = confirmationResult.rows[0];
  const updates = typeof pending.updates === 'string' ? JSON.parse(pending.updates) : pending.updates;
  const isNew = messageBody === 'new' || messageBody.startsWith('new');
  const isUpdate = messageBody === 'update' || messageBody.startsWith('update');
  const isYes = messageBody === 'yes' || messageBody === 'y' || messageBody.startsWith('yes') || messageBody === 'confirm';
  const isNo = messageBody === 'no' || messageBody === 'n' || messageBody.startsWith('no') || messageBody === 'cancel';

  // Handle duplicate order confirmation (new vs update)
  if (updates?.action === 'create_duplicate' && pending.order_id) {
    if (isNew) {
      // Create a new order
      try {
        // fulfillmentDate is stored as original string (e.g., "today evening 6pm")
        const order = await createOrder(
          userNumber,
          updates.productName,
          updates.quantity,
          undefined, // orderId - auto-generated (ensures uniqueness)
          updates.fulfillmentDate, // Original string format
          pending.original_message
        );
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        return formatCreateOrderResponse(order);
      } catch (error) {
        console.error('Error creating new order:', error);
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        return "I'm sorry, I couldn't create that order. Please try again.";
      }
    } else if (isUpdate) {
      // Update existing order
      try {
        const updateData: any = {};
        if (updates.productName) updateData.productName = updates.productName;
        if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
        
        const order = await updateOrder(pending.order_id, updateData);
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        return formatUpdateOrderResponse(order);
      } catch (error) {
        console.error('Error updating order:', error);
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        return "I'm sorry, I couldn't update that order. Please try again.";
      }
    } else if (isNo) {
      await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
      return "Order creation cancelled. How else can I help you?";
    } else {
      // Not a clear response, ask again
      return "Please reply 'new' for a new order or 'update' to modify the existing one.";
    }
  }

  // Handle task update confirmation (existing logic)
  if (pending.task_id) {
    if (isYes) {
      try {
        const task = await updateTask(pending.task_id, updates);
        
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        
        return formatUpdateTaskResponse(task);
      } catch (error) {
        console.error('Error updating task after confirmation:', error);
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        return "I'm sorry, I couldn't update that task. Please try again.";
      }
    } else if (isNo) {
      await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
      return "Update cancelled. How else can I help you?";
    } else {
      // Not a clear yes/no, ask again
      const taskInfo = await query('SELECT * FROM tasks WHERE id = $1', [pending.task_id]);
      if (taskInfo.rows.length > 0) {
        const task = taskInfo.rows[0];
        return `Please confirm: Do you want to update task "${task.title}"? Reply "yes" to confirm or "no" to cancel.`;
      } else {
        await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
        return "The pending update has expired. Please try again.";
      }
    }
  }

  return null;
}

