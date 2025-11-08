import { Task, Order } from './crud';

export function formatTaskResponse(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "You don't have any tasks yet.";
  }

  if (tasks.length === 1) {
    const task = tasks[0];
    const dueDateStr = task.due_date
      ? ` due ${formatDate(task.due_date)}`
      : '';
    return `Task: ${task.title}${dueDateStr} (${task.status})`;
  }

  let response = `You have ${tasks.length} tasks:\n\n`;
  tasks.forEach((task, index) => {
    const dueDateStr = task.due_date
      ? ` - Due: ${formatDate(task.due_date)}`
      : '';
    response += `${index + 1}. ${task.title} (${task.status})${dueDateStr}\n`;
  });

  return response.trim();
}

export function formatOrderResponse(orders: Order[]): string {
  if (orders.length === 0) {
    return "You don't have any orders yet.";
  }

  if (orders.length === 1) {
    const order = orders[0];
    return `Order ${order.order_id || order.id}: ${order.product_name} x${order.quantity} (${order.status})`;
  }

  let response = `You have ${orders.length} orders:\n\n`;
  orders.forEach((order, index) => {
    response += `${index + 1}. Order ${order.order_id || order.id}: ${order.product_name} x${order.quantity} (${order.status})\n`;
  });

  return response.trim();
}

export function formatCreateTaskResponse(task: Task): string {
  const dueDateStr = task.due_date
    ? ` due ${formatDate(task.due_date)}`
    : '';
  return `I've created a task "${task.title}"${dueDateStr}.`;
}

export function formatCreateOrderResponse(order: Order): string {
  return `I've created order ${order.order_id || order.id} for ${order.product_name} x${order.quantity}.`;
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

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'tomorrow';
  } else if (diffDays === -1) {
    return 'yesterday';
  } else if (diffDays > 0 && diffDays <= 7) {
    return `in ${diffDays} days`;
  } else {
    return d.toLocaleDateString();
  }
}

