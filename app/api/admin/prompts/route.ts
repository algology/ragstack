import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// Define the prompt interface
interface Prompt {
  id?: number;
  title: string;
  category: 'wine_production' | 'vineyard_management' | 'recent_research';
  display_order?: number;
  is_active?: boolean;
}

// GET - Fetch all prompts (with optional category filter)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const activeOnly = searchParams.get('active') === 'true';

    let query = supabase
      .from('prompts')
      .select('*')
      .order('category')
      .order('display_order');

    if (category) {
      query = query.eq('category', category);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching prompts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch prompts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ prompts: data });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/prompts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, category, display_order = 0 }: Prompt = body;

    // Validation
    if (!title || !category) {
      return NextResponse.json(
        { error: 'Title and category are required' },
        { status: 400 }
      );
    }

    if (!['wine_production', 'vineyard_management', 'recent_research'].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // If no display_order provided, set it to the next available number in the category
    let finalDisplayOrder = display_order;
    if (display_order === 0) {
      const { data: maxOrderData } = await supabase
        .from('prompts')
        .select('display_order')
        .eq('category', category)
        .order('display_order', { ascending: false })
        .limit(1);

      finalDisplayOrder = maxOrderData && maxOrderData.length > 0 
        ? (maxOrderData[0].display_order || 0) + 1 
        : 1;
    }

    const { data, error } = await supabase
      .from('prompts')
      .insert([{
        title,
        category,
        display_order: finalDisplayOrder,
        is_active: true
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating prompt:', error);
      return NextResponse.json(
        { error: 'Failed to create prompt' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      prompt: data 
    }, { status: 201 });

  } catch (error) {
    console.error('Unexpected error in POST /api/admin/prompts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update existing prompt
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, category, display_order, is_active }: Prompt & { id: number } = body;

    // Validation
    if (!id) {
      return NextResponse.json(
        { error: 'Prompt ID is required' },
        { status: 400 }
      );
    }

    if (category && !['wine_production', 'vineyard_management', 'recent_research'].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updateData: Partial<Prompt> = {};
    if (title !== undefined) updateData.title = title;
    if (category !== undefined) updateData.category = category;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('prompts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating prompt:', error);
      return NextResponse.json(
        { error: 'Failed to update prompt' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      prompt: data 
    });

  } catch (error) {
    console.error('Unexpected error in PUT /api/admin/prompts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete prompt (or soft delete by setting is_active to false)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const soft = searchParams.get('soft') === 'true';

    if (!id) {
      return NextResponse.json(
        { error: 'Prompt ID is required' },
        { status: 400 }
      );
    }

    if (soft) {
      // Soft delete - set is_active to false
      const { data, error } = await supabase
        .from('prompts')
        .update({ is_active: false })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) {
        console.error('Error soft deleting prompt:', error);
        return NextResponse.json(
          { error: 'Failed to delete prompt' },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json(
          { error: 'Prompt not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Prompt deactivated successfully' 
      });
    } else {
      // Hard delete - permanently remove
      const { error } = await supabase
        .from('prompts')
        .delete()
        .eq('id', parseInt(id));

      if (error) {
        console.error('Error deleting prompt:', error);
        return NextResponse.json(
          { error: 'Failed to delete prompt' },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Prompt deleted successfully' 
      });
    }

  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/prompts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}