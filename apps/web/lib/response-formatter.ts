import { Task, Order } from './crud';

/**
 * Get status-specific emoji for orders
 */
function getStatusEmoji(status: string): string {
  const lowerStatus = status.toLowerCase();
  switch (lowerStatus) {
    case 'completed':
      return '✅';
    case 'pending':
      return '⏳';
    case 'processing':
      return '🔄';
    case 'cancelled':
      return '❌';
    default:
      return '📊';
  }
}

export function formatTaskResponse(tasks: Task[], total?: number, offset?: number): string {
  if (tasks.length === 0) {
    return "You don't have any tasks yet.";
  }

  if (tasks.length === 1 && !total) {
    const task = tasks[0];
    const dueDateStr = task.due_date
      ? ` due ${formatDate(task.due_date)}`
      : '';
    return `Task: ${task.title}${dueDateStr} (${task.status})`;
  }

  const showingCount = tasks.length;
  const remaining = total !== undefined ? total - (offset || 0) - showingCount : 0;
  
  let response = `You have ${total !== undefined ? total : showingCount} task${total !== undefined && total !== 1 ? 's' : ''}:\n\n`;
  tasks.forEach((task, index) => {
    const dueDateStr = task.due_date
      ? ` - Due: ${formatDate(task.due_date)}`
      : ' - No due date';
    const itemNumber = (offset || 0) + index + 1;
    response += `${itemNumber}. ${task.title} (${task.status})${dueDateStr}\n`;
  });

  if (remaining > 0) {
    response += `\n\nThere are ${remaining} more task${remaining !== 1 ? 's' : ''}. Would you like to see the next 5? Reply "next" to continue.`;
  }

  return response.trim();
}

export function formatOrderResponse(orders: Order[], total?: number, offset?: number, filters?: { status?: string; dateRange?: string }): string {
  if (orders.length === 0) {
    // Provide helpful message based on filters
    if (filters?.status) {
      return `You don't have any ${filters.status} orders.`;
    }
    if (filters?.dateRange) {
      return `You don't have any orders for ${filters.dateRange}.`;
    }
    return "You don't have any orders yet.";
  }

  if (orders.length === 1 && !total) {
    const order = orders[0];
    const fulfillmentDate = order.fulfillment_date;
    const dateStr = fulfillmentDate != null
      ? formatDate(fulfillmentDate)
      : 'No date set';
    const statusEmoji = getStatusEmoji(order.status);
    return `📅 ${dateStr}\n📦 ${order.product_name} x${order.quantity}\n${statusEmoji} ${order.status}\n🆔 ${order.order_id || order.id}`;
  }

  const showingCount = orders.length;
  const remaining = total !== undefined ? total - (offset || 0) - showingCount : 0;
  
  // Build header message with filter info
  let header = `📋 You have ${total !== undefined ? total : showingCount} order${total !== undefined && total !== 1 ? 's' : ''}`;
  if (filters?.status) {
    header += ` (${filters.status})`;
  }
  if (filters?.dateRange) {
    header += ` for ${filters.dateRange}`;
  }
  header += `:\n\n`;
  
  let response = header;
  orders.forEach((order, index) => {
    const fulfillmentDate = order.fulfillment_date;
    const dateStr = fulfillmentDate != null
      ? formatDate(fulfillmentDate)
      : 'No date set';
    const itemNumber = (offset || 0) + index + 1;
    
    // Clean, mobile-friendly format:
    // Number. Date (most important first)
    //    Product x Quantity | Status (with emoji)
    //    Order ID (at the end, less prominent)
    const statusEmoji = getStatusEmoji(order.status);
    response += `${itemNumber}. 📅 ${dateStr}\n`;
    response += `   📦 ${order.product_name} x${order.quantity} | ${statusEmoji} ${order.status}\n`;
    response += `   🆔 ${order.order_id || order.id}\n`;
    
    // Add spacing between orders (except for last one)
    if (index < orders.length - 1) {
      response += `\n`;
    }
  });

  if (remaining > 0) {
    response += `\n\n📄 There are ${remaining} more order${remaining !== 1 ? 's' : ''}. Reply "next" to continue.`;
  }

  return response.trim();
}

export function formatCreateTaskResponse(task: Task): string {
  const dueDateStr = task.due_date
    ? ` due ${formatDate(task.due_date)}`
    : '';
  return `I've created a task "${task.title}"${dueDateStr}.`;
}

export function formatCreateOrderResponse(order: Order, items?: Array<{productName: string; quantity: number}>): string {
  const dateStr = order.fulfillment_date
    ? ` to be fulfilled by ${formatDate(order.fulfillment_date)}`
    : '';
  
  // If items array is provided, list all items
  if (items && items.length > 0) {
    const itemsList = items.map(item => `${item.productName} x${item.quantity}`).join(', ');
    return `I've created order ${order.order_id || order.id} with ${items.length} item${items.length > 1 ? 's' : ''}: ${itemsList}${dateStr}.`;
  }
  
  return `I've created order ${order.order_id || order.id} for ${order.product_name} x${order.quantity}${dateStr}.`;
}

export function formatUpdateTaskResponse(task: Task): string {
  const dueDateStr = task.due_date
    ? ` due ${formatDate(task.due_date)}`
    : '';
  return `Task "${task.title}" has been updated${dueDateStr ? dueDateStr : ''}. Status: ${task.status}`;
}

export function formatUpdateOrderResponse(order: Order): string {
  const statusEmoji = getStatusEmoji(order.status);
  return `Order ${order.order_id || order.id} has been updated. Status: ${statusEmoji} ${order.status}`;
}

/**
 * Format response for bulk update operations
 * @param entityType - 'task' or 'order'
 * @param count - Number of items updated
 * @param updates - The updates that were applied
 * @param filters - The filters that were used
 */
export function formatBulkUpdateResponse(
  entityType: 'task' | 'order',
  count: number,
  updates: { status?: string; title?: string; description?: string; dueDate?: Date | null; productName?: string; quantity?: number },
  filters?: { status?: string; dateRange?: string }
): string {
  const entityName = entityType === 'task' ? 'task' : 'order';
  const entityNamePlural = entityType === 'task' ? 'tasks' : 'orders';
  
  // Build filter description
  let filterDescription = '';
  if (filters) {
    const filterParts: string[] = [];
    if (filters.status) {
      filterParts.push(`with status "${filters.status}"`);
    }
    if (filters.dateRange) {
      filterParts.push(`for ${filters.dateRange}`);
    }
    if (filterParts.length > 0) {
      filterDescription = ` ${filterParts.join(' ')}`;
    }
  }

  // Build update description
  const updateParts: string[] = [];
  if (updates.status) {
    const statusEmoji = getStatusEmoji(updates.status);
    updateParts.push(`status to ${statusEmoji} ${updates.status}`);
  }
  if (updates.title) {
    updateParts.push(`title to "${updates.title}"`);
  }
  if (updates.description !== undefined) {
    updateParts.push(`description`);
  }
  if (updates.dueDate !== undefined) {
    updateParts.push(`due date`);
  }
  if (updates.productName) {
    updateParts.push(`product name to "${updates.productName}"`);
  }
  if (updates.quantity !== undefined) {
    updateParts.push(`quantity to ${updates.quantity}`);
  }

  const updateDescription = updateParts.length > 0 
    ? updateParts.join(', ')
    : 'updated';

  if (count === 0) {
    return `No ${entityNamePlural}${filterDescription} found to update.`;
  }

  let response = `✅ Successfully updated ${count} ${count === 1 ? entityName : entityNamePlural}${filterDescription}.\n\n`;
  response += `Updated: ${updateDescription}`;

  return response;
}

export function formatOrderDetailsResponse(order: Order & { mediaInfo?: { url?: string; type?: string; extractedText?: string }; items?: Array<{productName: string; quantity: number}> }): string {
  const fulfillmentDate = order.fulfillment_date
    ? formatDate(order.fulfillment_date)
    : 'Not set';
  
  const createdDate = order.created_at
    ? formatDate(order.created_at)
    : 'Unknown';
  
  const updatedDate = order.updated_at
    ? formatDate(order.updated_at)
    : 'Never';
  
  let response = `📦 Order Details\n\n`;
  response += `Order ID: ${order.order_id || order.id}\n`;
  
  // If order has items array, show all items
  if (order.items && order.items.length > 0) {
    response += `Items (${order.items.length}):\n`;
    order.items.forEach((item, index) => {
      response += `  ${index + 1}. ${item.productName} x${item.quantity}\n`;
    });
    response += `Total Quantity: ${order.quantity}\n`;
  } else {
    response += `Product: ${order.product_name}\n`;
    response += `Quantity: ${order.quantity}\n`;
  }
  
  const statusEmoji = getStatusEmoji(order.status);
  response += `Status: ${statusEmoji} ${order.status}\n`;
  response += `Fulfillment Date: ${fulfillmentDate}\n`;
  response += `Created: ${createdDate}\n`;
  response += `Last Updated: ${updatedDate}\n`;
  
  // Add media information if available
  if (order.mediaInfo) {
    response += `\n📎 Media Type: ${order.mediaInfo.type || 'Unknown'}`;
    if (order.mediaInfo.extractedText) {
      response += `\n📝 Extracted Text: ${order.mediaInfo.extractedText}`;
    }
  }
  
  if (order.original_message) {
    response += `\n\n💬 Original Message: ${order.original_message}`;
  }
  
  return response;
}

export function formatOrderSummaryResponse(
  orders: Array<Order & { items: Array<{ productName: string; quantity: number }> }>,
  dateRange: string
): string {
  if (orders.length === 0) {
    return `📊 Order Summary for ${dateRange}\n\n❌ No orders found for this period.`;
  }

  // Calculate totals
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status.toLowerCase() === 'completed').length;
  const pendingOrders = orders.filter(o => o.status.toLowerCase() === 'pending').length;
  const processingOrders = orders.filter(o => o.status.toLowerCase() === 'processing').length;
  const cancelledOrders = orders.filter(o => o.status.toLowerCase() === 'cancelled').length;

  // Build header with totals
  let response = `📊 Order Summary for ${dateRange}\n\n`;
  response += `📦 Total Orders: ${totalOrders}`;
  if (completedOrders > 0) response += ` | ✅ Completed: ${completedOrders}`;
  if (pendingOrders > 0) response += ` | ⏳ Pending: ${pendingOrders}`;
  if (processingOrders > 0) response += ` | 🔄 Processing: ${processingOrders}`;
  if (cancelledOrders > 0) response += ` | ❌ Cancelled: ${cancelledOrders}`;
  response += `\n\n`;

  // Group orders by status
  const ordersByStatus: Record<string, Array<Order & { items: Array<{ productName: string; quantity: number }> }>> = {};
  orders.forEach(order => {
    const status = order.status.toLowerCase();
    if (!ordersByStatus[status]) {
      ordersByStatus[status] = [];
    }
    ordersByStatus[status].push(order);
  });

  // Define status order and emojis
  const statusOrder = ['completed', 'processing', 'pending', 'cancelled'];
  const statusEmojis: Record<string, string> = {
    'completed': '✅',
    'processing': '🔄',
    'pending': '⏳',
    'cancelled': '❌'
  };
  const statusLabels: Record<string, string> = {
    'completed': 'Completed',
    'processing': 'Processing',
    'pending': 'Pending',
    'cancelled': 'Cancelled'
  };

  // Process each status
  statusOrder.forEach(status => {
    const statusOrders = ordersByStatus[status];
    if (!statusOrders || statusOrders.length === 0) {
      return;
    }

    const emoji = statusEmojis[status] || '📊';
    const label = statusLabels[status] || status;
    
    response += `${emoji} ${label} Orders (${statusOrders.length})\n`;

    // Aggregate products by name
    const productAggregation: Record<string, number> = {};
    
    statusOrders.forEach(order => {
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          const productName = item.productName.toLowerCase().trim();
          if (productAggregation[productName]) {
            productAggregation[productName] += item.quantity;
          } else {
            productAggregation[productName] = item.quantity;
          }
        });
      } else {
        // Fallback to main product_name if no items
        const productName = order.product_name.toLowerCase().trim();
        if (productAggregation[productName]) {
          productAggregation[productName] += order.quantity;
        } else {
          productAggregation[productName] = order.quantity;
        }
      }
    });

    // Sort products by quantity (descending)
    const sortedProducts = Object.entries(productAggregation)
      .sort((a, b) => b[1] - a[1]);

    // Display aggregated products
    if (sortedProducts.length > 0) {
      sortedProducts.forEach(([productName, totalQuantity]) => {
        // Capitalize first letter of each word for better display
        const displayName = productName
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        response += `   • ${displayName}: ${totalQuantity}\n`;
      });
    }

    response += `\n`;
  });

  return response.trim();
}

export function formatDate(date: Date | string): string {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(d.getTime())) {
    return '';
  }
  
  // Format as DD/MM/YYYY HH:MM AM/PM (day first, then month)
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  
  const hours = d.getHours();
  const minutes = d.getMinutes();
  
  // Format time in 12-hour format with AM/PM
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const formattedHours = displayHours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${formattedHours}:${formattedMinutes} ${period}`;
}


