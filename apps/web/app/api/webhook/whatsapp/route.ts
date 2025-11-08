import { NextRequest, NextResponse } from 'next/server';
import { query, initializeSchema } from '@/lib/db';
import { analyzeMessage, findMatchingTask } from '@/lib/gemini';
import {
  createTask,
  getTasks,
  updateTask,
  createOrder,
  getOrders,
  updateOrder,
  Task,
} from '@/lib/crud';
import {
  formatTaskResponse,
  formatOrderResponse,
  formatCreateTaskResponse,
  formatCreateOrderResponse,
  formatUpdateTaskResponse,
  formatUpdateOrderResponse,
} from '@/lib/response-formatter';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string | null;
    const body = formData.get('Body') as string | null;
    const messageSid = formData.get('MessageSid') as string | null;

    // Validate required fields
    if (!from || !messageSid) {
      console.error('Missing required fields:', { from, messageSid });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Log the incoming message
    console.log('Received WhatsApp message:', { from, body, messageSid });

    // Initialize database schema (idempotent)
    try {
      await initializeSchema();
    } catch (schemaError) {
      console.error('Schema initialization error:', schemaError);
      // Continue - schema might already exist
    }

    // Store message in database
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          message_sid VARCHAR(255) UNIQUE,
          from_number VARCHAR(255),
          body TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      );

      await query(
        'INSERT INTO messages (message_sid, from_number, body) VALUES ($1, $2, $3) ON CONFLICT (message_sid) DO NOTHING',
        [messageSid, from, body || '']
      );
    } catch (dbError) {
      console.error('Database error storing message:', dbError);
      // Continue even if DB fails
    }

    // Analyze message with Gemini LLM
    let responseMessage = 'Hi';
    
    if (body && body.trim()) {
      try {
        const userNumber = from;
        const messageBody = body.trim().toLowerCase();

        // Check for pagination requests (next)
        const isNext = messageBody === 'next' || messageBody === 'more' || messageBody.startsWith('next');
        
        if (isNext) {
          // Check for pagination state
          const paginationResult = await query(
            `SELECT * FROM pagination_state 
             WHERE user_number = $1 
             AND expires_at > CURRENT_TIMESTAMP 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userNumber]
          );

          if (paginationResult.rows.length > 0) {
            const pagination = paginationResult.rows[0];
            const entityType = pagination.entity_type;
            const currentOffset = pagination.offset_count || 0;
            // Parse filters from JSONB
            const filters = typeof pagination.filters === 'string' 
              ? JSON.parse(pagination.filters) 
              : (pagination.filters || {});
            const newOffset = currentOffset + 5;

            if (entityType === 'task') {
              try {
                const result = await getTasks(userNumber, {
                  ...filters,
                  offset: newOffset,
                  limit: 5,
                });
                
                if (result.tasks.length > 0) {
                  responseMessage = formatTaskResponse(result.tasks, result.total, newOffset);
                  
                  // Update pagination state if there are more tasks
                  if (result.total > newOffset + result.tasks.length) {
                    await query(
                      `UPDATE pagination_state 
                       SET offset_count = $1, expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
                       WHERE id = $2`,
                      [newOffset, pagination.id]
                    );
                  } else {
                    // No more tasks, delete pagination state
                    await query('DELETE FROM pagination_state WHERE id = $1', [pagination.id]);
                  }
                } else {
                  responseMessage = "No more tasks to show.";
                  await query('DELETE FROM pagination_state WHERE id = $1', [pagination.id]);
                }
              } catch (error) {
                console.error('Error getting next tasks:', error);
                responseMessage = "I'm sorry, I couldn't retrieve the next tasks. Please try again.";
              }
            } else if (entityType === 'order') {
              try {
                const result = await getOrders(userNumber, {
                  ...filters,
                  offset: newOffset,
                  limit: 5,
                });
                
                if (result.orders.length > 0) {
                  responseMessage = formatOrderResponse(result.orders, result.total, newOffset);
                  
                  // Update pagination state if there are more orders
                  if (result.total > newOffset + result.orders.length) {
                    await query(
                      `UPDATE pagination_state 
                       SET offset_count = $1, expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
                       WHERE id = $2`,
                      [newOffset, pagination.id]
                    );
                  } else {
                    // No more orders, delete pagination state
                    await query('DELETE FROM pagination_state WHERE id = $1', [pagination.id]);
                  }
                } else {
                  responseMessage = "No more orders to show.";
                  await query('DELETE FROM pagination_state WHERE id = $1', [pagination.id]);
                }
              } catch (error) {
                console.error('Error getting next orders:', error);
                responseMessage = "I'm sorry, I couldn't retrieve the next orders. Please try again.";
              }
            } else {
              await query('DELETE FROM pagination_state WHERE id = $1', [pagination.id]);
              responseMessage = "No pagination state found. Please request your tasks or orders again.";
            }
          } else {
            responseMessage = "No more items to show. Please request your tasks or orders again.";
          }
        } else {
          // Check for confirmation responses (yes/no)
          const confirmationResult = await query(
            `SELECT * FROM pending_confirmations 
             WHERE user_number = $1 
             AND expires_at > CURRENT_TIMESTAMP 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userNumber]
          );

          if (confirmationResult.rows.length > 0) {
            const pending = confirmationResult.rows[0];
            const isYes = messageBody === 'yes' || messageBody === 'y' || messageBody.startsWith('yes') || messageBody === 'confirm';
            const isNo = messageBody === 'no' || messageBody === 'n' || messageBody.startsWith('no') || messageBody === 'cancel';

          if (isYes) {
            // User confirmed, proceed with update
            try {
              const updates = pending.updates;
              const task = await updateTask(pending.task_id, updates);
              
              // Delete pending confirmation
              await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
              
              responseMessage = formatUpdateTaskResponse(task);
            } catch (error) {
              console.error('Error updating task after confirmation:', error);
              responseMessage = "I'm sorry, I couldn't update that task. Please try again.";
              await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
            }
          } else if (isNo) {
            // User declined
            await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
            responseMessage = "Update cancelled. How else can I help you?";
          } else {
            // Not a clear yes/no, ask again
            const taskInfo = await query('SELECT * FROM tasks WHERE id = $1', [pending.task_id]);
            if (taskInfo.rows.length > 0) {
              const task = taskInfo.rows[0];
              responseMessage = `Please confirm: Do you want to update task "${task.title}"? Reply "yes" to confirm or "no" to cancel.`;
            } else {
              await query('DELETE FROM pending_confirmations WHERE id = $1', [pending.id]);
              responseMessage = "The pending update has expired. Please try again.";
            }
          }
        } else {
          // No pending confirmation, proceed with normal flow
          const analysis = await analyzeMessage(body);
          console.log('Message analysis:', analysis);

          // Handle based on intent and entity type
          if (analysis.intent === 'create') {
            if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
              try {
                const task = await createTask(
                  userNumber,
                  analysis.parameters.title || 'Untitled Task',
                  analysis.parameters.description,
                  analysis.parameters.dueDate,
                  body
                );
                responseMessage = formatCreateTaskResponse(task);
              } catch (error) {
                console.error('Error creating task:', error);
                responseMessage = "I'm sorry, I couldn't create that task. Please try again.";
              }
            } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
              try {
                const order = await createOrder(
                  userNumber,
                  analysis.parameters.productName || 'Unknown Product',
                  analysis.parameters.quantity || 1,
                  analysis.parameters.orderId,
                  analysis.parameters.fulfillmentDate,
                  body
                );
                responseMessage = formatCreateOrderResponse(order);
              } catch (error) {
                console.error('Error creating order:', error);
                responseMessage = "I'm sorry, I couldn't create that order. Please try again.";
              }
            } else {
              responseMessage = "I can help you create tasks or orders. What would you like to create?";
            }
          } else if (analysis.intent === 'get') {
            if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
              try {
                const filters: { dateRange?: string; limit?: number } = { limit: 5 };
                if (analysis.parameters.dateRange) {
                  filters.dateRange = analysis.parameters.dateRange;
                }
                const result = await getTasks(userNumber, filters);
                
                // Store pagination state if there are more tasks
                if (result.total > result.tasks.length) {
                  // Delete existing pagination state for this user and entity type
                  await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'task']);
                  
                  await query(
                    `INSERT INTO pagination_state (user_number, entity_type, offset_count, total_count, filters)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [userNumber, 'task', 0, result.total, JSON.stringify(filters)]
                  );
                } else {
                  // No more tasks, delete pagination state
                  await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'task']);
                }
                
                responseMessage = formatTaskResponse(result.tasks, result.total, 0);
              } catch (error) {
                console.error('Error getting tasks:', error);
                responseMessage = "I'm sorry, I couldn't retrieve your tasks. Please try again.";
              }
            } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
              try {
                const filters: { dateRange?: string; limit?: number } = { limit: 5 };
                if (analysis.parameters.dateRange) {
                  filters.dateRange = analysis.parameters.dateRange;
                }
                const result = await getOrders(userNumber, filters);
                
                // Store pagination state if there are more orders
                if (result.total > result.orders.length) {
                  // Delete any existing pagination state for this user
                  await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'order']);
                  
                  await query(
                    `INSERT INTO pagination_state (user_number, entity_type, offset_count, total_count, filters)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [userNumber, 'order', 0, result.total, JSON.stringify(filters)]
                  );
                } else {
                  // No more orders, delete pagination state
                  await query('DELETE FROM pagination_state WHERE user_number = $1 AND entity_type = $2', [userNumber, 'order']);
                }
                
                responseMessage = formatOrderResponse(result.orders, result.total, 0);
              } catch (error) {
                console.error('Error getting orders:', error);
                responseMessage = "I'm sorry, I couldn't retrieve your orders. Please try again.";
              }
            } else {
              responseMessage = "I can show you your tasks or orders. What would you like to see?";
            }
          } else if (analysis.intent === 'update') {
            if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
              try {
                // Get all user's tasks (no limit for matching)
                const allTasksResult = await getTasks(userNumber, { limit: 1000 });
                const allTasks = allTasksResult.tasks;
              
              if (allTasks.length === 0) {
                responseMessage = "You don't have any tasks to update.";
              } else {
                // Use LLM to find the matching task
                const matchResult = await findMatchingTask(body, allTasks);
                console.log('Task match result:', matchResult);

                if (!matchResult.bestMatch) {
                  responseMessage = "I couldn't find a matching task. Please be more specific (e.g., 'update task 1' or 'change my appointment on 15th').";
                } else if (matchResult.needsConfirmation) {
                  // Low confidence or ambiguous - ask for confirmation
                  const task = allTasks.find(t => t.id === matchResult.bestMatch!.taskId);
                  if (task) {
                    // Prepare updates
                    const updates: any = {};
                    if (analysis.parameters.status) updates.status = analysis.parameters.status;
                    if (analysis.parameters.title) updates.title = analysis.parameters.title;
                    if (analysis.parameters.description !== undefined) {
                      updates.description = analysis.parameters.description;
                    }
                    if (analysis.parameters.dueDate) {
                      // Parse the date using the same logic as createTask
                      const dateStr = analysis.parameters.dueDate;
                      const now = new Date();
                      const lowerDate = dateStr.toLowerCase().trim();
                      
                      let parsedDate: Date | null = null;
                      if (lowerDate.includes('19th') || lowerDate.includes('19')) {
                        // Extract month from context or use current month
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
                      updates.dueDate = parsedDate;
                    }

                    // Store pending confirmation
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
                    
                    responseMessage = `I found task "${task.title}" (due ${dueDateStr}). `;
                    if (matchResult.allMatches.length > 1) {
                      responseMessage += `There are ${matchResult.allMatches.length} possible matches. `;
                    }
                    responseMessage += `Do you want to update this task? Reply "yes" to confirm or "no" to cancel.`;
                  } else {
                    responseMessage = "I couldn't find the task. Please try again.";
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
                      const dateStr = analysis.parameters.dueDate;
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
                      updates.dueDate = parsedDate;
                    }

                    const updatedTask = await updateTask(task.id, updates);
                    responseMessage = formatUpdateTaskResponse(updatedTask);
                  } else {
                    responseMessage = "I couldn't find the task. Please try again.";
                  }
                }
              }
            } catch (error) {
              console.error('Error updating task:', error);
              responseMessage = "I'm sorry, I couldn't update that task. Please try again.";
            }
          } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
            try {
              const orderId = analysis.parameters.orderId;
              if (!orderId) {
                responseMessage = "Please specify which order to update (e.g., 'update order #123').";
              } else {
                const updates: any = {};
                if (analysis.parameters.status) updates.status = analysis.parameters.status;
                if (analysis.parameters.productName) updates.productName = analysis.parameters.productName;
                if (analysis.parameters.quantity !== undefined) {
                  updates.quantity = analysis.parameters.quantity;
                }

                const order = await updateOrder(orderId, updates);
                responseMessage = formatUpdateOrderResponse(order);
              }
            } catch (error) {
              console.error('Error updating order:', error);
              responseMessage = "I'm sorry, I couldn't update that order. Please check the order ID and try again.";
            }
          } else {
            responseMessage = "I can help you update tasks or orders. What would you like to update?";
            }
          } else {
            // Unknown intent - ask for clarification
            responseMessage = "I can help you with tasks and orders. You can:\n" +
              "• Create: 'Create a task to buy groceries tomorrow'\n" +
              "• View: 'Show my tasks' or 'List my orders'\n" +
              "• Update: 'Mark task 1 as completed' or 'Update order #123 to processing'\n\n" +
              "What would you like to do?";
          }
          }
        }
      } catch (error) {
        console.error('Error analyzing message:', error);
        responseMessage = "I'm having trouble understanding. Could you please rephrase that?";
      }
    }

    // Escape XML special characters in the message
    const escapedMessage = responseMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // Return TwiML response (Twilio will automatically send this message)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>${escapedMessage}</Message>
      </Response>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
        },
      }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'ok', message: 'WhatsApp webhook endpoint is active' });
}

