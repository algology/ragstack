-- Create prompts table for admin-managed prompt system
CREATE TABLE IF NOT EXISTS prompts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('wine_production', 'vineyard_management', 'recent_research')),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying by category and order
CREATE INDEX IF NOT EXISTS idx_prompts_category_order ON prompts(category, display_order, is_active);

-- Create index for efficient querying by active status
CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on prompts table
CREATE TRIGGER update_prompts_updated_at 
    BEFORE UPDATE ON prompts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert initial prompts from existing hardcoded arrays
-- Wine Production Prompts
INSERT INTO prompts (title, category, display_order) VALUES
('What is smoke taint and how does it affect wine quality?', 'wine_production', 1),
('How can I treat smoke-affected grapes before fermentation?', 'wine_production', 2),
('What are the latest methods for managing malolactic fermentation?', 'wine_production', 3),
('How do I test for and prevent Brett contamination in my wines?', 'wine_production', 4),
('What''s the difference between treating smoke taint with activated carbon vs nanofiltration?', 'wine_production', 5),
('How does protein instability affect wine and how do I test for it?', 'wine_production', 6),
('What are the recommended oxygen management techniques during winemaking?', 'wine_production', 7);

-- Vineyard Management Prompts  
INSERT INTO prompts (title, category, display_order) VALUES
('How do I manage powdery mildew in my vineyard?', 'vineyard_management', 1),
('What are the best soil management practices for wine grapes?', 'vineyard_management', 2),
('When is the optimal time to harvest grapes for different wine styles?', 'vineyard_management', 3),
('How do I assess grape ripeness and sugar levels in the vineyard?', 'vineyard_management', 4),
('What are effective organic pest control methods for vineyards?', 'vineyard_management', 5),
('How does terroir influence grape quality and wine character?', 'vineyard_management', 6),
('What pruning techniques maximize grape quality over quantity?', 'vineyard_management', 7);

-- Recent Research Prompts
INSERT INTO prompts (title, category, display_order) VALUES
('What are the latest findings on Pierce''s Disease-resistant grapevine varieties from UC Davis?', 'recent_research', 1),
('How is climate change affecting global wine production in 2024-2025?', 'recent_research', 2),
('What are the key trends driving the organic wine market growth?', 'recent_research', 3),
('How are consumer demographics and drinking patterns changing in the wine industry?', 'recent_research', 4),
('What innovative viticultural techniques are being researched to adapt to climate warming?', 'recent_research', 5);