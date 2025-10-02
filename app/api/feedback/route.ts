import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

interface FeedbackRequest {
  conversationId: string;
  messageContent: string; // Keep for backward compatibility
  feedbackType: 'thumbs_up' | 'thumbs_down';
  userQuestion?: string; // New: the user's original question/prompt
  aiResponse?: string; // New: the AI's response content
  contextInfo?: {
    hasRAGSources?: boolean;
    hasWebSearch?: boolean;
    ragSources?: Array<{
      documentId?: string;
      documentName?: string;
      pageNumber?: number;
    }>;
    webSearchQueries?: string[];
    [key: string]: any;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: FeedbackRequest = await req.json();
    
    // Validate required fields
    if (!body.conversationId || !body.messageContent || !body.feedbackType) {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, messageContent, feedbackType' },
        { status: 400 }
      );
    }

    // Validate feedbackType
    if (!['thumbs_up', 'thumbs_down'].includes(body.feedbackType)) {
      return NextResponse.json(
        { error: 'Invalid feedbackType. Must be "thumbs_up" or "thumbs_down"' },
        { status: 400 }
      );
    }

    console.log('Feedback API: Storing feedback:', {
      conversationId: body.conversationId,
      feedbackType: body.feedbackType,
      hasContext: !!body.contextInfo,
      hasQuestion: !!body.userQuestion,
      hasResponse: !!body.aiResponse
    });

    // Check if feedback already exists for this message
    const { data: existingFeedback, error: checkError } = await supabase
      .from('chat_feedback')
      .select('id, feedback_type')
      .eq('conversation_id', body.conversationId)
      .eq('message_content', body.messageContent)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Feedback API: Error checking existing feedback:', checkError);
      return NextResponse.json(
        { error: 'Database error while checking existing feedback' },
        { status: 500 }
      );
    }

    let result;

    if (existingFeedback) {
      // Update existing feedback
      console.log('Feedback API: Updating existing feedback from', existingFeedback.feedback_type, 'to', body.feedbackType);
      
      const { data, error } = await supabase
        .from('chat_feedback')
        .update({
          feedback_type: body.feedbackType,
          context_info: body.contextInfo || null,
          user_question: body.userQuestion || null,
          ai_response: body.aiResponse || body.messageContent, // Use aiResponse if provided, fallback to messageContent
          updated_at: new Date().toISOString()
        })
        .eq('id', existingFeedback.id)
        .select()
        .single();

      if (error) {
        console.error('Feedback API: Error updating feedback:', error);
        return NextResponse.json(
          { error: 'Failed to update feedback' },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Insert new feedback
      console.log('Feedback API: Creating new feedback entry');
      
      const { data, error } = await supabase
        .from('chat_feedback')
        .insert({
          conversation_id: body.conversationId,
          message_content: body.messageContent, // Keep for backward compatibility
          feedback_type: body.feedbackType,
          context_info: body.contextInfo || null,
          user_question: body.userQuestion || null,
          ai_response: body.aiResponse || body.messageContent // Use aiResponse if provided, fallback to messageContent
        })
        .select()
        .single();

      if (error) {
        console.error('Feedback API: Error inserting feedback:', error);
        return NextResponse.json(
          { error: 'Failed to store feedback' },
          { status: 500 }
        );
      }

      result = data;
    }

    console.log('Feedback API: Successfully stored feedback with ID:', result.id);

    return NextResponse.json({
      success: true,
      feedback: {
        id: result.id,
        feedbackType: result.feedback_type,
        updated: !!existingFeedback
      }
    });

  } catch (error) {
    console.error('Feedback API: Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint for retrieving feedback analytics and data
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');
    const analytics = url.searchParams.get('analytics');
    const recent = url.searchParams.get('recent');

    if (conversationId) {
      // Get feedback for a specific conversation
      const { data, error } = await supabase
        .from('chat_feedback')
        .select('id, feedback_type, created_at, context_info, user_question, ai_response, message_content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Feedback API: Error fetching conversation feedback:', error);
        return NextResponse.json(
          { error: 'Failed to fetch feedback' },
          { status: 500 }
        );
      }

      return NextResponse.json({ feedback: data });
    } else if (analytics === 'true') {
      // Get comprehensive analytics statistics
      console.log('Feedback API: Fetching comprehensive analytics...');

      // Get overall stats
      const { data: overallStats, error: overallError } = await supabase
        .from('chat_feedback')
        .select('feedback_type');

      if (overallError) {
        console.error('Feedback API: Error fetching overall stats:', overallError);
        return NextResponse.json(
          { error: 'Failed to fetch overall statistics' },
          { status: 500 }
        );
      }

      // Calculate overall metrics with validation
      const totalFeedback = overallStats?.length || 0;
      const thumbsUp = overallStats?.filter(item => item.feedback_type === 'thumbs_up').length || 0;
      const thumbsDown = overallStats?.filter(item => item.feedback_type === 'thumbs_down').length || 0;
      
      // Validate that thumbsUp + thumbsDown equals totalFeedback
      if (thumbsUp + thumbsDown !== totalFeedback) {
        console.warn('Feedback API: Data inconsistency detected', {
          totalFeedback,
          thumbsUp,
          thumbsDown,
          sum: thumbsUp + thumbsDown
        });
      }
      
      const positiveRate = totalFeedback > 0 ? thumbsUp / totalFeedback : 0;

      // Get daily breakdown using the existing view
      const { data: dailyData, error: dailyError } = await supabase
        .from('feedback_analytics')
        .select('*')
        .order('feedback_date', { ascending: false })
        .limit(30);

      if (dailyError) {
        console.error('Feedback API: Error fetching daily analytics:', dailyError);
        return NextResponse.json(
          { error: 'Failed to fetch daily analytics' },
          { status: 500 }
        );
      }

      // Group and aggregate daily data properly
      const groupedDaily: Record<string, {
        date: string;
        thumbsUp: number;
        thumbsDown: number;
        total: number;
        contextTypes: Set<string>;
      }> = {};

      // Process each row from the database view
      dailyData?.forEach(day => {
        if (!day.feedback_date || !day.feedback_type || typeof day.total_count !== 'number') {
          console.warn('Feedback API: Invalid daily data row:', day);
          return;
        }

        const dateKey = day.feedback_date;
        
        if (!groupedDaily[dateKey]) {
          groupedDaily[dateKey] = {
            date: dateKey,
            thumbsUp: 0,
            thumbsDown: 0,
            total: 0,
            contextTypes: new Set()
          };
        }
        
        // Add context type to the set
        if (day.context_type) {
          groupedDaily[dateKey].contextTypes.add(day.context_type);
        }
        
        // Aggregate counts by feedback type
        if (day.feedback_type === 'thumbs_up') {
          groupedDaily[dateKey].thumbsUp += day.total_count;
        } else if (day.feedback_type === 'thumbs_down') {
          groupedDaily[dateKey].thumbsDown += day.total_count;
        }
        
        // Recalculate total
        groupedDaily[dateKey].total = groupedDaily[dateKey].thumbsUp + groupedDaily[dateKey].thumbsDown;
      });

      // Transform to final format for frontend
      const finalDailyBreakdown = Object.values(groupedDaily)
        .map(day => ({
          date: day.date,
          thumbsUp: day.thumbsUp,
          thumbsDown: day.thumbsDown,
          total: day.total,
          contextType: Array.from(day.contextTypes).join(', ') || 'mixed'
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending

      console.log('Feedback API: Returning analytics data', {
        totalFeedback,
        thumbsUp,
        thumbsDown,
        positiveRate,
        dailyBreakdownCount: finalDailyBreakdown.length
      });

      return NextResponse.json({
        stats: {
          totalFeedback,
          thumbsUp,
          thumbsDown,
          positiveRate,
          dailyBreakdown: finalDailyBreakdown
        }
      });
    } else if (recent) {
      // Get recent feedback entries with validation
      const limit = Math.min(Math.max(parseInt(recent) || 10, 1), 100); // Limit between 1 and 100
      
      console.log('Feedback API: Fetching recent feedback with limit:', limit);
      
      const { data, error } = await supabase
        .from('chat_feedback')
        .select('id, conversation_id, feedback_type, created_at, context_info, user_question, ai_response, message_content')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Feedback API: Error fetching recent feedback:', error);
        return NextResponse.json(
          { error: 'Failed to fetch recent feedback' },
          { status: 500 }
        );
      }

      // Validate the returned data
      const validatedData = data?.filter(item => {
        if (!item.id || !item.conversation_id || !item.feedback_type || !item.created_at) {
          console.warn('Feedback API: Invalid recent feedback row:', item);
          return false;
        }
        return ['thumbs_up', 'thumbs_down'].includes(item.feedback_type);
      }) || [];

      console.log('Feedback API: Returning', validatedData.length, 'validated recent feedback entries');
      
      return NextResponse.json({ feedback: validatedData });
    } else {
      // Default: Get aggregate feedback statistics from view
      const { data, error } = await supabase
        .from('feedback_analytics')
        .select('*')
        .order('feedback_date', { ascending: false })
        .limit(30); // Last 30 days

      if (error) {
        console.error('Feedback API: Error fetching analytics:', error);
        return NextResponse.json(
          { error: 'Failed to fetch analytics' },
          { status: 500 }
        );
      }

      return NextResponse.json({ analytics: data });
    }
  } catch (error) {
    console.error('Feedback API: Unexpected error in GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}