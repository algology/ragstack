"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff,
  Wine,
  Grape,
  Search
} from "lucide-react";

interface Prompt {
  id: number;
  title: string;
  category: 'wine_production' | 'vineyard_management' | 'recent_research';
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Category display mapping
const categoryDisplay = {
  wine_production: { label: 'Wine Production', icon: Wine, color: 'bg-red-100 text-red-800' },
  vineyard_management: { label: 'Vineyard Management', icon: Grape, color: 'bg-green-100 text-green-800' },
  recent_research: { label: 'Recent Research', icon: Search, color: 'bg-blue-100 text-blue-800' }
};

export function PromptManager() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState<{
    title: string;
    category: 'wine_production' | 'vineyard_management' | 'recent_research';
    display_order: number;
  }>({
    title: '',
    category: 'wine_production',
    display_order: 0
  });

  // Fetch prompts from API
  const fetchPrompts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/prompts');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch prompts');
      }

      setPrompts(data.prompts || []);
    } catch (err) {
      console.error('Error fetching prompts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prompts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // Handle form submission (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('Prompt title is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const url = editingPrompt ? '/api/admin/prompts' : '/api/admin/prompts';
      const method = editingPrompt ? 'PUT' : 'POST';
      const body = editingPrompt 
        ? { ...formData, id: editingPrompt.id }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save prompt');
      }

      await fetchPrompts(); // Refresh the list
      resetForm();
      setIsDialogOpen(false);

    } catch (err) {
      console.error('Error saving prompt:', err);
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setLoading(false);
    }
  };

  // Handle prompt deletion
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this prompt?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/prompts?id=${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete prompt');
      }

      await fetchPrompts(); // Refresh the list

    } catch (err) {
      console.error('Error deleting prompt:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete prompt');
    } finally {
      setLoading(false);
    }
  };

  // Handle toggle active status
  const handleToggleActive = async (prompt: Prompt) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: prompt.id,
          is_active: !prompt.is_active
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update prompt');
      }

      await fetchPrompts(); // Refresh the list

    } catch (err) {
      console.error('Error updating prompt:', err);
      setError(err instanceof Error ? err.message : 'Failed to update prompt');
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({ title: '', category: 'wine_production', display_order: 0 });
    setEditingPrompt(null);
    setError(null);
  };

  // Start editing
  const startEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setFormData({
      title: prompt.title,
      category: prompt.category,
      display_order: prompt.display_order
    });
    setIsDialogOpen(true);
  };

  // Filter prompts by category
  const filteredPrompts = filterCategory === 'all' 
    ? prompts 
    : prompts.filter(p => p.category === filterCategory);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Prompts</CardTitle>
        <CardDescription>
          Add, edit, and organize the prompts that appear in the chat dropdown buttons.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Label htmlFor="category-filter">Filter:</Label>
            <Select 
              value={filterCategory} 
              onValueChange={setFilterCategory}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="wine_production">Wine Production</SelectItem>
                <SelectItem value="vineyard_management">Vineyard Management</SelectItem>
                <SelectItem value="recent_research">Recent Research</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Prompt
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingPrompt ? 'Edit Prompt' : 'Add New Prompt'}
                </DialogTitle>
                <DialogDescription>
                  {editingPrompt 
                    ? 'Update the prompt details below.' 
                    : 'Enter the details for the new prompt.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="prompt-title">Prompt Text</Label>
                  <Input
                    id="prompt-title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter the prompt question..."
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="prompt-category">Category</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value: any) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wine_production">Wine Production</SelectItem>
                      <SelectItem value="vineyard_management">Vineyard Management</SelectItem>
                      <SelectItem value="recent_research">Recent Research</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="display-order">Display Order</Label>
                  <Input
                    id="display-order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      display_order: parseInt(e.target.value) || 0 
                    }))}
                    placeholder="Order (0 for auto)"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingPrompt ? 'Update' : 'Create')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Prompts Table */}
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && prompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    Loading prompts...
                  </TableCell>
                </TableRow>
              ) : filteredPrompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No prompts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPrompts.map((prompt) => {
                  const categoryInfo = categoryDisplay[prompt.category];
                  const IconComponent = categoryInfo.icon;
                  
                  return (
                    <TableRow key={prompt.id}>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={prompt.title}>
                          {prompt.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={categoryInfo.color}>
                          <IconComponent className="mr-1 h-3 w-3" />
                          {categoryInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{prompt.display_order}</TableCell>
                      <TableCell>
                        <Badge variant={prompt.is_active ? "default" : "secondary"}>
                          {prompt.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(prompt)}
                            title={prompt.is_active ? "Deactivate" : "Activate"}
                          >
                            {prompt.is_active ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit(prompt)}
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(prompt.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}