import { query } from '@/lib/db';
import { updateTask, updateOrder } from '@/lib/crud';
import { formatUpdateTaskResponse, formatUpdateOrderResponse } from '@/lib/response-formatter';
import { analyzeMessage } from '@/lib/gemini';
import { parseOrderNumberFromMessage } from './utils';

export interface MessageContext {
  entityType: string | null;
  orderIds: string[];
  taskIds: number[];
  orderMappings: Record<string, string>;
  taskMappings: Record<string, number>;
  contextData: any;
}

export async function handleReply(
  userNumber: string,
  body: string,
  referredMessageSid: string | null,
  context: MessageContext | null
): Promise<string | null> {
  if (!context) {
    return null;
  }

  try {
    const analysis = await analyzeMessage(body);
    
    // Fallback: If intent is unknown but message contains status keywords, treat as update
    let effectiveAnalysis = analysis;
    if (analysis.intent === 'unknown' && context.entityType) {
      const lowerBody = body.toLowerCase();
      const statusKeywords: Record<string, string> = {
        'done': 'completed',
        'complete': 'completed',
        'completed': 'completed',
        'processing': 'processing',
        'pending': 'pending',
        'cancelled': 'cancelled',
        'cancel': 'cancelled',
        'finish': 'completed',
        'finished': 'completed'
      };
      
      for (const [keyword, status] of Object.entries(statusKeywords)) {
        if (lowerBody.includes(keyword)) {
          effectiveAnalysis = {
            intent: 'update',
            entityType: context.entityType as 'task' | 'order' | 'reminder' | 'product' | null,
            parameters: { status: status }
          };
          break;
        }
      }
    }
    
    // Handle update intent with context
    if (effectiveAnalysis.intent === 'update' && context.entityType) {
      return await handleUpdateWithContext(userNumber, body, effectiveAnalysis, context);
    }
    
    return null;
  } catch (error) {
    console.error('Error processing reply:', error);
    return "I'm sorry, I encountered an error processing your reply. Please try again.";
  }
}

async function handleUpdateWithContext(
  userNumber: string,
  body: string,
  analysis: any,
  context: MessageContext
): Promise<string> {
  if (context.entityType === 'order' && context.orderIds && context.orderIds.length > 0) {
    let targetOrderIds: string[] = [];
    
    // First, check if analysis extracted an orderId (this is the key in orderMappings)
    if (analysis.parameters.orderId && context.orderMappings) {
      const orderIdKey = analysis.parameters.orderId.toString();
      const orderId = context.orderMappings[orderIdKey];
      if (orderId) {
        targetOrderIds = [orderId];
      }
    }
    
    // If not found, parse order number from user message
    if (targetOrderIds.length === 0) {
      const orderNumber = parseOrderNumberFromMessage(body, context.orderIds.length);
      
      if (orderNumber !== null && context.orderMappings) {
        const orderIdKey = orderNumber.toString();
        const orderId = context.orderMappings[orderIdKey];
        if (orderId) {
          targetOrderIds = [orderId];
        } else {
          // Fallback: use orderIds array index
          if (orderNumber > 0 && orderNumber <= context.orderIds.length) {
            targetOrderIds = [context.orderIds[orderNumber - 1]];
          }
        }
      }
    }
    
    // If still no specific order found, update all orders
    if (targetOrderIds.length === 0) {
      targetOrderIds = context.orderIds;
    }
    
    if (analysis.parameters.status && targetOrderIds.length > 0) {
      try {
        const updatePromises = targetOrderIds.map((orderId: string) => 
          updateOrder(orderId, { status: analysis.parameters.status! })
        );
        const updatedOrders = await Promise.all(updatePromises);
        
        if (updatedOrders.length === 1) {
          return formatUpdateOrderResponse(updatedOrders[0]);
        } else {
          return `I've updated ${updatedOrders.length} order${updatedOrders.length > 1 ? 's' : ''} to ${analysis.parameters.status}.`;
        }
      } catch (error) {
        console.error('Error updating orders from reply:', error);
        return "I'm sorry, I couldn't update the order(s). Please try again.";
      }
    } else {
      return "What would you like to update about this order? (e.g., 'mark as done', 'update status to processing')";
    }
  } else if (context.entityType === 'task' && context.taskIds && context.taskIds.length > 0) {
    let targetTaskIds: number[] = [];
    
    // First, check if analysis extracted a taskId
    if (analysis.parameters.taskId && context.taskMappings) {
      const taskIdKey = analysis.parameters.taskId.toString();
      const taskId = context.taskMappings[taskIdKey];
      if (taskId) {
        targetTaskIds = [taskId];
      }
    }
    
    // If not found, parse task number from user message
    if (targetTaskIds.length === 0) {
      const taskNumber = parseOrderNumberFromMessage(body, context.taskIds.length);
      
      if (taskNumber !== null && context.taskMappings) {
        const taskIdKey = taskNumber.toString();
        const taskId = context.taskMappings[taskIdKey];
        if (taskId) {
          targetTaskIds = [taskId];
        } else {
          // Fallback: use taskIds array index
          if (taskNumber > 0 && taskNumber <= context.taskIds.length) {
            targetTaskIds = [context.taskIds[taskNumber - 1]];
          }
        }
      }
    }
    
    // If still no specific task found, update all tasks
    if (targetTaskIds.length === 0) {
      targetTaskIds = context.taskIds;
    }
    
    const updates: any = {};
    if (analysis.parameters.status) updates.status = analysis.parameters.status;
    if (analysis.parameters.title) updates.title = analysis.parameters.title;
    if (analysis.parameters.description !== undefined) updates.description = analysis.parameters.description;
    if (analysis.parameters.dueDate) {
      updates.dueDate = new Date(analysis.parameters.dueDate);
    }
    
    if (Object.keys(updates).length > 0 && targetTaskIds.length > 0) {
      try {
        const updatePromises = targetTaskIds.map((taskId: number) => 
          updateTask(taskId, updates)
        );
        const updatedTasks = await Promise.all(updatePromises);
        
        if (updatedTasks.length === 1) {
          return formatUpdateTaskResponse(updatedTasks[0]);
        } else {
          return `I've updated ${updatedTasks.length} task${updatedTasks.length > 1 ? 's' : ''} to ${updates.status || 'the new status'}.`;
        }
      } catch (error) {
        console.error('Error updating tasks from reply:', error);
        return "I'm sorry, I couldn't update the task(s). Please try again.";
      }
    } else {
      return "What would you like to update about this task? (e.g., 'mark as completed', 'change title to...')";
    }
  }
  
  return null;
}

