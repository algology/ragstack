import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// Define the prompt interface
interface Prompt {
  id: number;
  title: string;
  category: 'wine_production' | 'vineyard_management' | 'recent_research';
  display_order: number;
  is_active: boolean;
}

// Define grouped prompts interface
interface GroupedPrompts {
  wine_production: string[];
  vineyard_management: string[];
  recent_research: string[];
}

// GET - Fetch active prompts grouped by category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('prompts')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching prompts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch prompts' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ prompts: [] });
    }

    // If a specific category was requested, return just the array of titles
    if (category) {
      const prompts = data.map((prompt: Prompt) => prompt.title);
      return NextResponse.json({ prompts });
    }

    // Otherwise, group prompts by category for easy consumption by frontend
    const groupedPrompts: GroupedPrompts = {
      wine_production: [],
      vineyard_management: [],
      recent_research: []
    };

    data.forEach((prompt: Prompt) => {
      groupedPrompts[prompt.category].push(prompt.title);
    });

    return NextResponse.json({ 
      prompts: groupedPrompts,
      // Also include raw data for admin purposes
      raw: data 
    });

  } catch (error) {
    console.error('Unexpected error in GET /api/prompts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}