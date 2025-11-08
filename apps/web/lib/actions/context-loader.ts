import { query } from '@/lib/db';
import { MessageService } from '@/lib/services/message-service';
import { MessageContext } from './reply-handler';
import { parseOrderMappingsFromMessage } from './utils';

export async function loadMessageContext(
  userNumber: string,
  referredMessageSid: string | null
): Promise<MessageContext | null> {
  if (!referredMessageSid) {
    return null;
  }

  try {
    // First try to get context from user_message_context (most recent context)
    const userContextResult = await query(
      'SELECT * FROM user_message_context WHERE user_number = $1 ORDER BY created_at DESC LIMIT 1',
      [userNumber]
    );
    
    if (userContextResult.rows.length > 0) {
      const userContext = userContextResult.rows[0];
      
      // Parse JSONB fields if they're strings
      const orderMappings = typeof userContext.order_mappings === 'string'
        ? JSON.parse(userContext.order_mappings)
        : (userContext.order_mappings || {});
      const taskMappings = typeof userContext.task_mappings === 'string'
        ? JSON.parse(userContext.task_mappings)
        : (userContext.task_mappings || {});
      
      return {
        entityType: userContext.entity_type,
        orderIds: userContext.order_ids || [],
        taskIds: userContext.task_ids || [],
        orderMappings: orderMappings,
        taskMappings: taskMappings,
        contextData: userContext.context_data || {}
      };
    }
    
    // Fallback: try to get from original message
    const originalMessage = await MessageService.getMessageBySid(referredMessageSid, userNumber);
    
    if (originalMessage) {
      const context: MessageContext = {
        entityType: null,
        orderIds: [],
        taskIds: [],
        orderMappings: {},
        taskMappings: {},
        contextData: {}
      };
      
      // Parse context if it exists
      if (originalMessage.context) {
        const parsedContext = typeof originalMessage.context === 'string' 
          ? JSON.parse(originalMessage.context) 
          : originalMessage.context;
        Object.assign(context, parsedContext);
      }
      
      // If no mappings in context, try to parse from original message body
      if (!context.orderMappings && originalMessage.body) {
        context.orderMappings = parseOrderMappingsFromMessage(originalMessage.body);
        if (Object.keys(context.orderMappings).length > 0) {
          context.orderIds = Object.values(context.orderMappings);
          context.entityType = 'order';
        }
      }
      
      return context;
    }
    
    return null;
  } catch (error) {
    console.error('Error loading message context:', error);
    return null;
  }
}

