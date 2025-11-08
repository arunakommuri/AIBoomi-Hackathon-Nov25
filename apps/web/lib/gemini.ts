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
    dateRange?: string; // e.g., "this week", "this month", "last week", "today", "yesterday"
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
    "fulfillmentDate": "string (for orders, extract when order needs to be fulfilled, e.g., 'tomorrow', 'next week', '15th November')",
    "status": "string (for updates: 'pending', 'completed', 'processing', 'cancelled')",
    "taskId": number (for task updates, extract ID from message),
    "dateRange": "string (for get intent: extract date range filters like 'this week', 'this month', 'last week', 'today', 'yesterday', 'last month', etc.)"
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
- Intent "get": User wants to view/list their tasks, reminders, or orders (e.g., "show my tasks", "list orders", "what are my reminders", "my tasks", "orders this week", "tasks this month")
  * Extract dateRange from phrases like "this week", "this month", "last week", "today", "yesterday", "last month", "this year"
- Intent "update": User wants to modify an existing task or order. This includes:
  * "mark task 1 as completed" → UPDATE task
  * "update order #123" → UPDATE order
  * "mark as done" → UPDATE (status: completed)
  * "update to done" → UPDATE (status: completed)
  * "set to completed" → UPDATE (status: completed)
  * "move to done" → UPDATE (status: completed)
  * "change status to processing" → UPDATE (status: processing)
  * "mark as completed" → UPDATE (status: completed)
  * "done" → UPDATE (status: completed)
  * "complete" → UPDATE (status: completed)
  * Any message containing status words like "done", "completed", "processing", "cancelled", "pending" when referring to existing items
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

export interface TaskMatch {
  taskId: number;
  confidence: number; // 0-1, where 1 is highest confidence
  ambiguity: number; // 0-1, where 1 is highest ambiguity (multiple good matches)
  reason: string;
}

export interface TaskMatchResult {
  bestMatch: TaskMatch | null;
  allMatches: TaskMatch[];
  needsConfirmation: boolean;
}

export async function findMatchingTask(
  userMessage: string,
  tasks: Array<{ id: number; title: string; description: string | null; due_date: Date | null; status: string }>
): Promise<TaskMatchResult> {
  try {
    if (tasks.length === 0) {
      return {
        bestMatch: null,
        allMatches: [],
        needsConfirmation: false,
      };
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    // Format tasks for the prompt
    const tasksList = tasks.map((task, index) => {
      const dueDateStr = task.due_date
        ? new Date(task.due_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'No due date';
      return `${index + 1}. Task ID: ${task.id}, Title: "${task.title}", Description: ${task.description || 'None'}, Due Date: ${dueDateStr}, Status: ${task.status}`;
    }).join('\n');

    const prompt = `You are analyzing a user's message to find which task they want to update from their list of tasks.

User's message: "${userMessage}"

Available tasks:
${tasksList}

Analyze the user's message and find the best matching task(s). Consider:
- Date references (e.g., "15th", "19th", "from 15th to 19th")
- Task titles or keywords
- Context clues

Return ONLY a valid JSON object with this exact structure:
{
  "matches": [
    {
      "taskId": number (the actual task ID from the list),
      "confidence": number (0.0 to 1.0, where 1.0 is highest confidence),
      "reason": "string explaining why this task matches"
    }
  ],
  "needsConfirmation": boolean (true if confidence < 0.8 OR if multiple tasks have confidence > 0.6)
}

Rules:
- confidence >= 0.8 and only one match → needsConfirmation: false (high confidence, single match)
- confidence < 0.8 OR multiple matches with confidence > 0.6 → needsConfirmation: true (low confidence or ambiguous)
- Sort matches by confidence (highest first)
- If no good match (all confidence < 0.5), return empty matches array

Return ONLY the JSON object, no other text:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in task matching response:', text);
      return {
        bestMatch: null,
        allMatches: [],
        needsConfirmation: false,
      };
    }

    const matchData = JSON.parse(jsonMatch[0]) as {
      matches: Array<{ taskId: number; confidence: number; reason: string }>;
      needsConfirmation: boolean;
    };

    // Calculate ambiguity (if multiple high-confidence matches)
    const highConfidenceMatches = matchData.matches.filter(m => m.confidence > 0.6);
    const ambiguity = highConfidenceMatches.length > 1 ? 1.0 : 0.0;

    const allMatches: TaskMatch[] = matchData.matches.map(m => ({
      taskId: m.taskId,
      confidence: m.confidence,
      ambiguity,
      reason: m.reason,
    }));

    const bestMatch = allMatches.length > 0 ? allMatches[0] : null;

    // Determine if confirmation is needed
    const needsConfirmation =
      matchData.needsConfirmation ||
      (bestMatch && bestMatch.confidence < 0.8) ||
      (highConfidenceMatches.length > 1);

    return {
      bestMatch,
      allMatches,
      needsConfirmation,
    };
  } catch (error) {
    console.error('Error finding matching task:', error);
    return {
      bestMatch: null,
      allMatches: [],
      needsConfirmation: false,
    };
  }
}

