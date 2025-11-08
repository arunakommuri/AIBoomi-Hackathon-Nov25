import { Task, Order } from './crud';

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

export function formatOrderResponse(orders: Order[], total?: number, offset?: number): string {
  if (orders.length === 0) {
    return "You don't have any orders yet.";
  }

  if (orders.length === 1 && !total) {
    const order = orders[0];
    // Access fulfillment_date - handle both Date objects and string dates from PostgreSQL
    const fulfillmentDate = order.fulfillment_date;
    const dateStr = fulfillmentDate != null
      ? ` - Fulfill by: ${formatDate(fulfillmentDate)}`
      : '';
    return `Order ${order.order_id || order.id}: ${order.product_name} x${order.quantity} (${order.status})${dateStr}`;
  }

  const showingCount = orders.length;
  const remaining = total !== undefined ? total - (offset || 0) - showingCount : 0;
  
  let response = `You have ${total !== undefined ? total : showingCount} order${total !== undefined && total !== 1 ? 's' : ''}:\n\n`;
  orders.forEach((order, index) => {
    // Access fulfillment_date - handle both Date objects and string dates from PostgreSQL
    const fulfillmentDate = order.fulfillment_date;
    const dateStr = fulfillmentDate != null
      ? ` - Fulfill by: ${formatDate(fulfillmentDate)}`
      : ' - No fulfillment date';
    const itemNumber = (offset || 0) + index + 1;
    response += `${itemNumber}. Order ${order.order_id || order.id}: ${order.product_name} x${order.quantity} (${order.status})${dateStr}\n`;
  });

  if (remaining > 0) {
    response += `\n\nThere are ${remaining} more order${remaining !== 1 ? 's' : ''}. Would you like to see the next 5? Reply "next" to continue.`;
  }

  return response.trim();
}

export function formatCreateTaskResponse(task: Task): string {
  const dueDateStr = task.due_date
    ? ` due ${formatDate(task.due_date)}`
    : '';
  return `I've created a task "${task.title}"${dueDateStr}.`;
}

export function formatCreateOrderResponse(order: Order): string {
  const dateStr = order.fulfillment_date
    ? ` to be fulfilled by ${formatDate(order.fulfillment_date)}`
    : '';
  return `I've created order ${order.order_id || order.id} for ${order.product_name} x${order.quantity}${dateStr}.`;
}

export function formatUpdateTaskResponse(task: Task): string {
  const dueDateStr = task.due_date
    ? ` due ${formatDate(task.due_date)}`
    : '';
  return `Task "${task.title}" has been updated${dueDateStr ? dueDateStr : ''}. Status: ${task.status}`;
}

export function formatUpdateOrderResponse(order: Order): string {
  return `Order ${order.order_id || order.id} has been updated. Status: ${order.status}`;
}

export function formatDate(date: Date | string): string {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(d.getTime())) {
    return '';
  }
  
  // Always format as absolute date-time value (MM/DD/YYYY HH:MM AM/PM)
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  
  const hours = d.getHours();
  const minutes = d.getMinutes();
  
  // Format time in 12-hour format with AM/PM
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const formattedHours = displayHours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');
  
  return `${month}/${day}/${year} ${formattedHours}:${formattedMinutes} ${period}`;
}


