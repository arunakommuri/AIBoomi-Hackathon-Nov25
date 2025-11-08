import { query } from '@/lib/db';
import { getTasks, updateTask, updateOrder } from '@/lib/crud';
import { formatUpdateTaskResponse, formatUpdateOrderResponse } from '@/lib/response-formatter';
import { findMatchingTask } from '@/lib/gemini';

export async function handleUpdate(
  userNumber: string,
  analysis: any,
  body?: string
): Promise<string> {
  if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
    try {
      const allTasksResult = await getTasks(userNumber, { limit: 1000 });
      const allTasks = allTasksResult.tasks;
    
      if (allTasks.length === 0) {
        return "You don't have any tasks to update.";
      } else {
        const matchResult = await findMatchingTask(body || '', allTasks);

        if (!matchResult.bestMatch) {
          return "I couldn't find a matching task. Please be more specific (e.g., 'update task 1' or 'change my appointment on 15th').";
        } else if (matchResult.needsConfirmation) {
          // Low confidence or ambiguous - ask for confirmation
          const task = allTasks.find(t => t.id === matchResult.bestMatch!.taskId);
          if (task) {
            const updates: any = {};
            if (analysis.parameters.status) updates.status = analysis.parameters.status;
            if (analysis.parameters.title) updates.title = analysis.parameters.title;
            if (analysis.parameters.description !== undefined) {
              updates.description = analysis.parameters.description;
            }
            if (analysis.parameters.dueDate) {
              updates.dueDate = parseDate(analysis.parameters.dueDate);
            }

            await query(
              `INSERT INTO pending_confirmations (user_number, task_id, updates, original_message)
               VALUES ($1, $2, $3, $4)`,
              [userNumber, task.id, JSON.stringify(updates), body]
            );

            const dueDateStr = task.due_date
              ? new Date(task.due_date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })
              : 'no due date';
            
            let responseMessage = `I found task "${task.title}" (due ${dueDateStr}). `;
            if (matchResult.allMatches.length > 1) {
              responseMessage += `There are ${matchResult.allMatches.length} possible matches. `;
            }
            responseMessage += `Do you want to update this task? Reply "yes" to confirm or "no" to cancel.`;
            return responseMessage;
          } else {
            return "I couldn't find the task. Please try again.";
          }
        } else {
          // High confidence, single match - update directly
          const task = allTasks.find(t => t.id === matchResult.bestMatch!.taskId);
          if (task) {
            const updates: any = {};
            if (analysis.parameters.status) updates.status = analysis.parameters.status;
            if (analysis.parameters.title) updates.title = analysis.parameters.title;
            if (analysis.parameters.description !== undefined) {
              updates.description = analysis.parameters.description;
            }
            if (analysis.parameters.dueDate) {
              updates.dueDate = parseDate(analysis.parameters.dueDate);
            }

            const updatedTask = await updateTask(task.id, updates);
            return formatUpdateTaskResponse(updatedTask);
          } else {
            return "I couldn't find the task. Please try again.";
          }
        }
      }
    } catch (error) {
      console.error('Error updating task:', error);
      return "I'm sorry, I couldn't update that task. Please try again.";
    }
  } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
    try {
      const orderId = analysis.parameters.orderId;
      if (!orderId) {
        return "Please specify which order to update (e.g., 'update order #123').";
      } else {
        const updates: any = {};
        if (analysis.parameters.status) updates.status = analysis.parameters.status;
        if (analysis.parameters.productName) updates.productName = analysis.parameters.productName;
        if (analysis.parameters.quantity !== undefined) {
          updates.quantity = analysis.parameters.quantity;
        }

        const order = await updateOrder(orderId, updates);
        return formatUpdateOrderResponse(order);
      }
    } catch (error) {
      console.error('Error updating order:', error);
      return "I'm sorry, I couldn't update that order. Please check the order ID and try again.";
    }
  } else {
    return "I can help you update tasks or orders. What would you like to update?";
  }
}

function parseDate(dateStr: string): Date | null {
  const now = new Date();
  const lowerDate = dateStr.toLowerCase().trim();
  
  let parsedDate: Date | null = null;
  if (lowerDate.includes('19th') || lowerDate.includes('19')) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
    let month = now.getMonth();
    for (let i = 0; i < monthNames.length; i++) {
      if (lowerDate.includes(monthNames[i])) {
        month = i;
        break;
      }
    }
    parsedDate = new Date(now.getFullYear(), month, 19);
    if (parsedDate < now) {
      parsedDate.setMonth(month + 1);
    }
  } else {
    parsedDate = new Date(dateStr);
    if (isNaN(parsedDate.getTime())) {
      parsedDate = null;
    }
  }
  return parsedDate;
}

