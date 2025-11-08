import { NextRequest, NextResponse } from 'next/server';
import { query, initializeSchema } from '@/lib/db';
import { analyzeMessage } from '@/lib/gemini';
import {
  createTask,
  getTasks,
  updateTask,
  createOrder,
  getOrders,
  updateOrder,
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
        const analysis = await analyzeMessage(body);
        console.log('Message analysis:', analysis);

        const userNumber = from;

        // Handle based on intent and entity type
        if (analysis.intent === 'create') {
          if (analysis.entityType === 'task' || analysis.entityType === 'reminder') {
            try {
              const task = await createTask(
                userNumber,
                analysis.parameters.title || 'Untitled Task',
                analysis.parameters.description,
                analysis.parameters.dueDate
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
                analysis.parameters.orderId
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
              const tasks = await getTasks(userNumber);
              responseMessage = formatTaskResponse(tasks);
            } catch (error) {
              console.error('Error getting tasks:', error);
              responseMessage = "I'm sorry, I couldn't retrieve your tasks. Please try again.";
            }
          } else if (analysis.entityType === 'order' || analysis.entityType === 'product') {
            try {
              const orders = await getOrders(userNumber);
              responseMessage = formatOrderResponse(orders);
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
              const taskId = analysis.parameters.taskId;
              if (!taskId) {
                responseMessage = "Please specify which task to update (e.g., 'update task 1').";
              } else {
                const updates: any = {};
                if (analysis.parameters.status) updates.status = analysis.parameters.status;
                if (analysis.parameters.title) updates.title = analysis.parameters.title;
                if (analysis.parameters.description !== undefined) {
                  updates.description = analysis.parameters.description;
                }
                if (analysis.parameters.dueDate) {
                  const dueDate = new Date(analysis.parameters.dueDate);
                  updates.dueDate = isNaN(dueDate.getTime()) ? null : dueDate;
                }

                const task = await updateTask(taskId, updates);
                responseMessage = formatUpdateTaskResponse(task);
              }
            } catch (error) {
              console.error('Error updating task:', error);
              responseMessage = "I'm sorry, I couldn't update that task. Please check the task ID and try again.";
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

