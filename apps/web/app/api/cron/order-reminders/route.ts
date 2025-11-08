import { NextRequest, NextResponse } from 'next/server';
import { sendPendingOrderReminders } from '@/lib/services/order-reminder-service';

/**
 * API route for sending pending order reminders
 * This should be called by a cron job service (e.g., Vercel Cron, GitHub Actions, or external cron)
 * 
 * To set up:
 * 1. Add this URL to your cron service
 * 2. Set ORDER_REMINDER_INTERVAL_MINUTES environment variable (default: 360 minutes = 6 hours)
 * 3. Configure cron to call this endpoint at the desired interval
 * 
 * Example cron schedules:
 * Every 6 hours: 0 *\/6 * * * (runs at 00:00, 06:00, 12:00, 18:00)
 * Every 30 minutes: *\/30 * * * * (runs every 30 minutes)
 * Every 1 hour: 0 * * * * (runs at the top of every hour)
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Add authentication/authorization check
    // For example, check for a secret token in headers or query params
    const authToken = request.headers.get('authorization') || request.nextUrl.searchParams.get('token');
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    if (expectedToken && authToken !== `Bearer ${expectedToken}` && authToken !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🔄 Starting pending order reminders job...');
    const startTime = Date.now();

    const result = await sendPendingOrderReminders();

    const duration = Date.now() - startTime;
    console.log(`✅ Completed pending order reminders job in ${duration}ms`);
    console.log(`   Success: ${result.successCount}, Errors: ${result.errorCount}`);

    return NextResponse.json({
      success: true,
      message: 'Order reminders sent',
      stats: {
        successCount: result.successCount,
        errorCount: result.errorCount,
        totalUsers: result.successCount + result.errorCount,
        duration: `${duration}ms`
      },
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error) {
    console.error('❌ Error in order reminders cron job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}

