import { query } from '@/lib/db';
import { updateTask, updateOrder, getOrderByOrderId } from '@/lib/crud';
import { formatUpdateTaskResponse, formatUpdateOrderResponse, formatOrderDetailsResponse } from '@/lib/response-formatter';
import { analyzeMessage } from '@/lib/gemini';
import { parseOrderNumberFromMessage, parseMultipleOrderNumbersFromMessage } from './utils';

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
    const lowerBody = body.toLowerCase();
    
    // Check if user is asking for details (even if intent is unknown)
    const isDetailsRequest = 
      lowerBody.includes('details') ||
      lowerBody.includes('detail') ||
      lowerBody.includes('information') ||
      lowerBody.includes('info') ||
      lowerBody.includes('tell me about') ||
      lowerBody.includes('show') && (lowerBody.includes('order') || lowerBody.includes('task'));
    
    // Fallback: If intent is unknown but message contains status keywords, treat as update
    let effectiveAnalysis = analysis;
    if (analysis.intent === 'unknown' && context.entityType) {
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
      
      // If it's a details request, treat as get intent
      if (effectiveAnalysis.intent === 'unknown' && isDetailsRequest) {
        effectiveAnalysis = {
          intent: 'get',
          entityType: context.entityType as 'task' | 'order' | 'reminder' | 'product' | null,
          parameters: analysis.parameters || {}
        };
      }
    }
    
    // Handle update intent with context
    if (effectiveAnalysis.intent === 'update' && context.entityType) {
      return await handleUpdateWithContext(userNumber, body, effectiveAnalysis, context);
    }
    
    // Handle get intent with context (for order/task details)
    // Also handle if it's a details request even if intent wasn't detected as "get"
    if ((analysis.intent === 'get' || isDetailsRequest) && context.entityType) {
      return await handleGetWithContext(userNumber, body, effectiveAnalysis.intent === 'get' ? analysis : effectiveAnalysis, context);
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
): Promise<string | null> {
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
    
    // If not found, try to parse multiple order numbers from user message
    // This handles replies like "1 2 3", "1,2,3", etc.
    if (targetOrderIds.length === 0) {
      const orderNumbers = parseMultipleOrderNumbersFromMessage(body, context.orderIds.length);
      
      if (orderNumbers.length > 0 && context.orderMappings) {
        // Map order numbers to order IDs
        for (const orderNumber of orderNumbers) {
          const orderIdKey = orderNumber.toString();
          const orderId = context.orderMappings[orderIdKey];
          if (orderId && !targetOrderIds.includes(orderId)) {
            targetOrderIds.push(orderId);
          } else {
            // Fallback: use orderIds array index
            if (orderNumber > 0 && orderNumber <= context.orderIds.length) {
              const fallbackOrderId = context.orderIds[orderNumber - 1];
              if (!targetOrderIds.includes(fallbackOrderId)) {
                targetOrderIds.push(fallbackOrderId);
              }
            }
          }
        }
      }
      
      // If still no numbers found, try single number parsing (backward compatibility)
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

async function handleGetWithContext(
  userNumber: string,
  body: string,
  analysis: any,
  context: MessageContext
): Promise<string | null> {
  if (context.entityType === 'order' && context.orderIds && context.orderIds.length > 0) {
    let targetOrderId: string | null = null;
    
    console.log('Getting order details from reply context:', {
      body,
      orderIds: context.orderIds,
      orderMappings: context.orderMappings,
      analysisParams: analysis.parameters
    });
    
    // First, check if analysis extracted an orderId
    if (analysis.parameters?.orderId && context.orderMappings) {
      const orderIdKey = analysis.parameters.orderId.toString();
      const orderId = context.orderMappings[orderIdKey];
      if (orderId) {
        targetOrderId = orderId;
        console.log('Found order ID from analysis parameters:', targetOrderId);
      }
    }
    
    // If not found, parse order number from user message (e.g., "5th", "order 5", "details of order 5")
    if (!targetOrderId) {
      const orderNumber = parseOrderNumberFromMessage(body, context.orderIds.length);
      console.log('Parsed order number from message:', orderNumber);
      
      if (orderNumber !== null) {
        if (context.orderMappings && Object.keys(context.orderMappings).length > 0) {
          const orderIdKey = orderNumber.toString();
          const orderId = context.orderMappings[orderIdKey];
          if (orderId) {
            targetOrderId = orderId;
            console.log('Found order ID from mappings:', targetOrderId);
          }
        }
        
        // Fallback: use orderIds array index if mappings don't have it
        if (!targetOrderId && orderNumber > 0 && orderNumber <= context.orderIds.length) {
          targetOrderId = context.orderIds[orderNumber - 1];
          console.log('Using order ID from array index:', targetOrderId);
        }
      }
    }
    
    // If we found a target order, get its details
    if (targetOrderId) {
      try {
        const order = await getOrderByOrderId(userNumber, targetOrderId);
        if (order) {
          console.log('Successfully retrieved order details:', order.order_id);
          return formatOrderDetailsResponse(order);
        } else {
          console.log('Order not found in database:', targetOrderId);
          return `I couldn't find order ${targetOrderId}. Please check the order ID and try again.`;
        }
      } catch (error) {
        console.error('Error getting order details from reply:', error);
        return "I'm sorry, I couldn't retrieve the order details. Please try again.";
      }
    } else {
      // No specific order identified - could be asking for list
      console.log('No target order ID found, returning null to let normal flow handle');
      return null; // Let normal flow handle it
    }
  } else if (context.entityType === 'task' && context.taskIds && context.taskIds.length > 0) {
    // Similar logic for tasks if needed in the future
    // For now, return null to let normal flow handle task details
    return null;
  }
  
  return null;
}

