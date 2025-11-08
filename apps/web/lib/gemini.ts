import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not configured. Please set it in your environment variables.');
}

const genAI = new GoogleGenerativeAI(apiKey);

export interface MessageAnalysis {
  intent: 'create' | 'get' | 'update' | 'unknown';
  entityType: 'task' | 'reminder' | 'order' | 'product' | null;
  parameters: {
    title?: string;
    description?: string;
    dueDate?: string;
    orderId?: string;
    productName?: string;
    quantity?: number;
    status?: string;
    taskId?: number;
    [key: string]: any;
  };
}

export async function analyzeMessage(message: string): Promise<MessageAnalysis> {
  try {
    // Get model from environment variable, fallback to gemini-1.5-flash as default
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `Analyze the following WhatsApp message and extract the intent, entity type, and parameters. 
Return ONLY a valid JSON object with this exact structure:
{
  "intent": "create" | "get" | "update" | "unknown",
  "entityType": "task" | "reminder" | "order" | "product" | null,
  "parameters": {
    "title": "string (for tasks/reminders)",
    "description": "string (optional, for tasks)",
    "dueDate": "string (optional, for tasks/reminders, can be relative like 'tomorrow', 'next week', or absolute date)",
    "orderId": "string (for orders, extract number/ID from message)",
    "productName": "string (for orders/products)",
    "quantity": number (for orders/products),
    "status": "string (for updates: 'pending', 'completed', 'processing', 'cancelled')",
    "taskId": number (for task updates, extract ID from message)
  }
}

IMPORTANT RULES:
- Intent "create": User wants to create a new task, reminder, or order. This includes messages like:
  * "Have an appointment at..." → CREATE task/reminder
  * "Add appointment..." → CREATE task/reminder
  * "Create a task..." → CREATE task
  * "I need to..." → CREATE task (if it sounds like a task/reminder)
  * "Remind me to..." → CREATE reminder
  * "Order..." or "I want to order..." → CREATE order
- Intent "get": User wants to view/list their tasks, reminders, or orders (e.g., "show my tasks", "list orders", "what are my reminders", "my tasks")
- Intent "update": User wants to modify an existing task or order (e.g., "mark task 1 as completed", "update order #123")
- Intent "unknown": Only use if truly cannot determine intent

Entity Type Rules:
- "task" or "reminder": Use for appointments, tasks, reminders, things to do, events
- "order" or "product": Use for purchases, orders, products, items to buy

Date Extraction:
- Extract dates from messages like "Saturday 15th November", "2PM on Saturday", "tomorrow", "next week"
- For appointments with time, include both date and time in dueDate
- Parse dates like "Saturday 15th November" or "15th November" into a proper date format
- Relative dates: "tomorrow" = next day, "next week" = 7 days from now, etc.

Title Extraction:
- For appointments: Extract the main subject (e.g., "appointment", "meeting", "doctor visit")
- For tasks: Extract the task description
- If message says "appointment" or "have an appointment", use "Appointment" as title

Examples:
- "Have an appointment at 2PM on Saturday 15th November" → {"intent": "create", "entityType": "task", "parameters": {"title": "Appointment", "dueDate": "Saturday 15th November 2PM"}}
- "Add appointment at 2PM on Saturday 15th November" → {"intent": "create", "entityType": "task", "parameters": {"title": "Appointment", "dueDate": "Saturday 15th November 2PM"}}
- "Create a task to buy groceries tomorrow" → {"intent": "create", "entityType": "task", "parameters": {"title": "buy groceries", "dueDate": "tomorrow"}}

Message: "${message}"

Return ONLY the JSON object, no other text:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response (handle cases where LLM adds extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response:', text);
      return {
        intent: 'unknown',
        entityType: null,
        parameters: {},
      };
    }

    const analysis = JSON.parse(jsonMatch[0]) as MessageAnalysis;

    // Validate the analysis structure
    if (!analysis.intent || !['create', 'get', 'update', 'unknown'].includes(analysis.intent)) {
      analysis.intent = 'unknown';
    }

    if (analysis.entityType && !['task', 'reminder', 'order', 'product'].includes(analysis.entityType)) {
      analysis.entityType = null;
    }

    return analysis;
  } catch (error) {
    console.error('Error analyzing message with Gemini:', error);
    // Return unknown intent on error
    return {
      intent: 'unknown',
      entityType: null,
      parameters: {},
    };
  }
}

