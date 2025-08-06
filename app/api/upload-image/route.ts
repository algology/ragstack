import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const GEMINI_VISION_MODEL = "gemini-2.5-flash";

// Helper function to convert file to base64
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return base64;
}

export async function POST(req: NextRequest) {
  console.log("Image Process API: Request received");
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const description = formData.get('description') as string | null;
    
    if (!file) {
      console.error("Image Process API: No file provided in FormData");
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error("Image Process API: Invalid file type:", file.type);
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.error("Image Process API: File too large:", file.size);
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const mimeType = file.type;
    const fileSize = file.size;
    
    console.log("Image Process API: File details:", { 
      fileName, 
      mimeType, 
      fileSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
      hasDescription: !!description 
    });
    
    // Convert image to base64 for Gemini Vision API
    console.log("Image Process API: Converting image to base64...");
    const base64Image = await fileToBase64(file);
    
    // Create Gemini model for vision analysis
    const model = genAI.getGenerativeModel({
      model: GEMINI_VISION_MODEL,
    });
    
    // Prepare the analysis prompt
    const analysisPrompt = description && description.trim()
      ? `Analyze this image in detail. The user provided this description: "${description.trim()}". Please provide a comprehensive analysis including: 1) What you see in the image, 2) Key objects, people, or elements, 3) Visual style and composition, 4) Any text or writing visible, 5) Context or setting, 6) How it relates to the user's description.`
      : `Analyze this image in detail. Please provide a comprehensive analysis including: 1) What you see in the image, 2) Key objects, people, or elements, 3) Visual style and composition, 4) Any text or writing visible, 5) Context or setting, 6) Any interesting or notable features.`;
    
    console.log("Image Process API: Starting Gemini Vision analysis...");
    
    // Analyze the image with Gemini Vision
    const result = await model.generateContent([
      analysisPrompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ]);
    
    const response = result.response;
    const imageAnalysis = response.text();
    
    console.log("Image Process API: Gemini Vision analysis completed");
    
    // Create enhanced context with AI analysis
    const imageContext = `USER HAS UPLOADED AN IMAGE: The user has provided an image file called "${fileName}". 

DETAILED IMAGE ANALYSIS: ${imageAnalysis}

CONTEXT: This image was uploaded by the user and they want to discuss it or ask questions about it. Please acknowledge that you can see and analyze their uploaded image in your response.`;
    
    console.log("Image Process API: Created enhanced image context with AI analysis");
    
    return NextResponse.json({ 
      success: true, 
      fileName: fileName,
      fileSize: fileSize,
      mimeType: mimeType,
      imageContext: imageContext,
      aiAnalysis: imageAnalysis,
      userDescription: description || null,
      message: "Image analyzed successfully with Gemini Vision. Use the context in your next message."
    });

  } catch (error) {
    console.error("Image Process API: Caught error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Determine if it's a Gemini API error or general processing error
    const isGeminiError = errorMessage.includes("GoogleGenerativeAI") || 
                         errorMessage.includes("API key") || 
                         errorMessage.includes("quota") ||
                         errorMessage.includes("safety");
    
    const errorResponse = isGeminiError 
      ? { 
          error: "Failed to analyze image with AI", 
          details: errorMessage,
          fallbackMessage: "Image uploaded successfully but AI analysis failed. You can still describe the image manually."
        }
      : { 
          error: "Failed to process image", 
          details: errorMessage 
        };
    
    console.error("Image Process API: Returning error response:", errorResponse);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}